import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../routes/projects/[projectId]/spec/edit/+server';
import { applySpecEdit } from './spec360-edits.server';
import { applyRetrospecActs, emptyRetrospecDocument, type RetrospecDocument } from '$domain/retrospec';

const stamp = '2026-11-13T03:00:00.000Z';
const writer = { id: 'writer@example.test', name: 'Writer' };
const rule = { category: 'business', description: 'Only captured funds can be refunded.', condition: { left: 'payment.captured', operator: 'is_true' }, effect: { type: 'block_action', description: 'Prevent an unfunded refund.', reason: 'Capture the payment first.' } };
const request = { op: 'upsert_rule' as const, featureId: 'f', actionId: 'a', expectedUpdatedAt: stamp, rule };

function fixture(initial = emptyRetrospecDocument()) {
	let doc: RetrospecDocument = initial;
	let revision = 0;
	const snapshot = { feature: { updatedAt: stamp, surfaces: [{ id: 's', actions: [{ id: 'a', rules: [{ ...rule, id: 'r', effect: { ...rule.effect, id: 'e' } }] }] }] } };
	const services = {
		projectAccess: { authorize: vi.fn().mockResolvedValue({ ok: true }) },
		installEdition: () => undefined, resolveActiveProject: { execute: async () => null }, projectExists: vi.fn().mockResolvedValue(true),
		currentSession: () => ({ email: writer.id }), resolveActiveMemberName: { execute: async () => writer.name },
		sectionDocuments: { load: async () => doc, currentRevision: async () => revision, save: vi.fn(async (_p: string, _section: string, next: RetrospecDocument) => { doc = next; return ++revision; }) },
		loadFeaturesDraft: { execute: vi.fn().mockResolvedValue({ features: [{ id: 'f' }] }) },
		detectFeatureIdCollision: { execute: vi.fn().mockResolvedValue([]) }, behaviorPort: { readFeature: vi.fn().mockResolvedValue(snapshot) },
		authorBehavior: { execute: vi.fn().mockResolvedValue({ available: true, batch: { ok: true, refs: { knowledge_rule: 'new-rule' }, errors: [] } }) },
		scheduleBackSync: vi.fn().mockResolvedValue(undefined), behaviorAdvisories: { touch: vi.fn() }
	};
	const event = (body = request) => ({ params: { projectId: 'p' }, locals: { services, authRequired: true }, cookies: { get: () => 'session' }, request: new Request('http://localhost/projects/p/spec/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
	return { services, event, doc: () => doc };
}

describe('scoped rule writes through the existing Knowledge edit endpoint [criterion:b5cc1e56]', () => {
	it('requires write access before any rule read or authoring [unspa:effb984d:0d6ddb20:dd26d2d5]', async () => {
		const f = fixture(); f.services.projectAccess.authorize.mockResolvedValue({ ok: false, reason: 'forbidden' });
		await expect(POST(f.event() as never)).rejects.toMatchObject({ status: 403 });
		expect(f.services.projectAccess.authorize).toHaveBeenCalledWith('p', 'session', 'write');
		expect(f.services.behaviorPort.readFeature).not.toHaveBeenCalled();
		expect(f.services.authorBehavior.execute).not.toHaveBeenCalled();
	});

	it('saves only the selected action rule under the version read and returns its confirmed anchor [unspa:effb984d:0d6ddb20:c0d57434]', async () => {
		const f = fixture(); const response = await POST(f.event() as never);
		expect(await response.json()).toEqual({ ok: true, anchor: 'rule:f:new-rule' });
		expect(f.services.authorBehavior.execute).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p', featureId: 'f', expectedUpdatedAt: stamp, operations: [{ kind: 'add_action_rule', ref: 'knowledge_rule', surfaceId: 's', actionId: 'a', rule }] }));
		expect(f.doc().runs.at(-1)?.edits?.['rule:f:new-rule']).toMatchObject({ by: writer });
	});

	it('refuses a validated reference before touching the behavior engine [unspa:effb984d:0d6ddb20:d08d856f]', async () => {
		const reviewed = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'rule:f:r', title: 'Rule', tab: 'spec360' }], { actor: writer, now: stamp });
		if (!reviewed.ok) throw new Error(reviewed.reason);
		const published = applyRetrospecActs(reviewed.doc, [{ op: 'publish', baselineId: 'b', notify: [] }], { actor: writer, now: stamp });
		if (!published.ok) throw new Error(published.reason);
		const f = fixture(published.doc);
		await expect(POST(f.event() as never)).rejects.toMatchObject({ status: 400 });
		expect(f.services.authorBehavior.execute).not.toHaveBeenCalled();
	});

	it.each(['foreign', 'ambiguous', 'stale', 'missing-rule'] as const)('refuses a %s target without a write', async (kind) => {
		const f = fixture();
		if (kind === 'foreign') f.services.loadFeaturesDraft.execute.mockResolvedValue({ features: [] });
		if (kind === 'ambiguous') f.services.detectFeatureIdCollision.execute.mockResolvedValue(['another-project']);
		const input = { ...request, ...(kind === 'stale' ? { expectedUpdatedAt: '2026-11-12T03:00:00.000Z' } : {}), ...(kind === 'missing-rule' ? { ruleId: 'gone' } : {}) };
		await expect(applySpecEdit(f.services as never, 'p', input, writer, null)).rejects.toMatchObject({ status: kind === 'foreign' ? 404 : kind === 'missing-rule' ? 400 : 409 });
		expect(f.services.authorBehavior.execute).not.toHaveBeenCalled();
	});

	it.each([false, true])('returns the canonical refusal or uncertain availability without recording success (unavailable=%s)', async (unavailable) => {
		const f = fixture(); f.services.authorBehavior.execute.mockResolvedValue({ available: !unavailable, batch: { ok: false, refs: {}, errors: ['The rule changed.'], conflict: true } });
		await expect(applySpecEdit(f.services as never, 'p', request, writer, null)).rejects.toMatchObject({ status: unavailable ? 503 : 409 });
		expect(f.services.sectionDocuments.save).not.toHaveBeenCalled();
	});

	it('invalidates earlier reviewers of the edited rule and preserves its identity', async () => {
		const approved = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'rule:f:r', title: 'Earlier rule', tab: 'spec360' }], { actor: { id: 'other', name: 'Other' }, now: stamp });
		if (!approved.ok) throw new Error(approved.reason);
		const f = fixture(approved.doc);
		expect(await applySpecEdit(f.services as never, 'p', { ...request, ruleId: 'r' }, writer, null)).toEqual({ anchor: 'rule:f:r' });
		expect(f.doc().runs.at(-1)?.verdicts['rule:f:r']?.validatedBy ?? []).toEqual([]);
		expect(f.services.authorBehavior.execute.mock.calls[0][0].operations[0]).toMatchObject({ kind: 'update_action_rule', ruleId: 'r', patch: { effect: { id: 'e' } } });
	});

	it('does not report complete success when a saved rule review trace cannot be recorded', async () => {
		const f = fixture(); f.services.sectionDocuments.save.mockRejectedValueOnce(new Error('Store unavailable'));
		await expect(applySpecEdit(f.services as never, 'p', request, writer, null)).rejects.toMatchObject({ status: 503, body: { message: 'The rule was saved, but its review history could not be updated. Reload before editing it again.' } });
		expect(f.services.authorBehavior.execute).toHaveBeenCalledTimes(1);
	});
});
