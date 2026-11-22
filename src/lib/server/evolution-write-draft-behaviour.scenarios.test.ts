import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
vi.mock('./project-access.server', () => ({ requireProjectAccess: vi.fn(async () => {}) }));
vi.mock('./ai-activity.server', () => ({ signalAiActivity: vi.fn() }));
vi.mock('./evolution-actor.server', () => ({ resolveEvolutionActor: vi.fn(async () => ({ id: 'claude@example.test', kind: 'ai_client', role: 'admin', channel: 'ai_client' })) }));
import { isHttpError, type RequestEvent } from '@sveltejs/kit';
import { batchScene, draftOn, requestAt } from './evolution-batch-scene.fixture';
import { applyBatchToDraft } from './draft-behavior-batch.server';

/**
 * Write the behaviour of a drafted feature (feat-30, action 96565a98), every
 * scenario through the real draft batch (apply_behavior_batch on a draft id)
 * and the real batch of operations it saves through. Not tested here: the
 * viewer (7c6ab3f9), refused by the route's access check, which the
 * Enterprise workspace adapter decides.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:ead2111a:96565a98:${id}]`;
const OPS = [
	{ kind: 'add_action', ref: 'save', surfaceId: 's1', name: 'Save for later', intent: 'Keep the cart for later.' },
	{ kind: 'add_action_rule', surfaceId: 's1', actionRef: 'save', rule: { category: 'business', description: 'Anyone with a cart keeps it.', effect: { type: 'allow_action', description: 'Always allowed.' } } }
];
const event = () => ({ locals: { services: s.services }, request: new Request('http://platform/api/behavior/apply'), cookies: { get: () => undefined } }) as unknown as RequestEvent;
async function write(input: { draftId?: string; dryRun?: boolean; commit?: string; operations?: Record<string, unknown>[] } = {}) {
	try {
		const res = await applyBatchToDraft(event(), { projectId: 'p', draftId: input.draftId ?? 'draft:r-1', operations: input.operations ?? OPS, dryRun: input.dryRun ?? false, ...(input.commit ? { commit: input.commit } : {}) });
		const body = (await res.json()) as { batch: { ok: boolean; errors: string[] } };
		return { status: 200, ok: body.batch.ok, errors: body.batch.errors };
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, ok: false, errors: [e.body.message] };
		throw e;
	}
}

describe('Write the behaviour of a drafted feature', () => {
	beforeEach(() => {
		s.engine.refuses = null;
		s.show(requestAt('specification'));
	});

	it(`the AI writes the behaviour of a drafted feature ${T('b807bd49')}`, async () => {
		expect(await write()).toMatchObject({ ok: true });
		expect(s.saved().drafts[0].behaviourModel?.operations).toEqual(OPS);
	});

	it(`a dry run keeps nothing ${T('6b47fa69')}`, async () => {
		expect(await write({ dryRun: true })).toMatchObject({ ok: true });
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a draft takes no new behaviour from Approval on ${T('d600579b')}`, async () => {
		s.show(requestAt('acceptance'));
		expect(await write()).toMatchObject({ ok: false, errors: ['The request carrying draft:r-1 stands past its Build: what it proposes is no longer corrected. Open a new request to change its behaviour.'] });
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`no behaviour is written for a drafted feature the request does not carry, a dry run included ${T('de4ea907')}`, async () => {
		s.show(requestAt('specification', { drafts: [], leafIds: ['feat-1'] }));
		expect(await write({ dryRun: true })).toMatchObject({ status: 404, ok: false });
	});

	it(`a draft no request carries is refused ${T('1d44d28f')}`, async () => {
		const answer = await write({ draftId: 'draft:nope-1234' });
		expect(answer.status).toBe(404);
		expect(answer.errors[0]).toBe('Draft draft:nope-1234 is not carried by any request of this project.');
	});

	it(`a draft keeps no commit token ${T('cb56025e')}`, async () => {
		const answer = await write({ commit: 'token-1' });
		expect(answer.status).toBe(400);
		expect(answer.errors[0]).toContain('A draft keeps no commit token');
	});

	it(`operations the engine refuses are not kept ${T('5266d392')}`, async () => {
		s.engine.refuses = 'action Save for later has no rule';
		expect(await write()).toMatchObject({ ok: false, errors: ['action Save for later has no rule'] });
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a cancelled request keeps its behaviour ${T('6ad537c8')}`, async () => {
		s.show(requestAt('specification', { status: 'cancelled' }));
		const answer = await write();
		expect(answer.ok).toBe(false);
		expect(answer.errors.join(' ')).toContain('This request is cancelled: reopen it first.');
	});

	it(`a dry run on a cancelled request reads right ${T('9128a92c')}`, async () => {
		s.show(requestAt('specification', { status: 'cancelled' }));
		expect(await write({ dryRun: true })).toMatchObject({ ok: true });
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`in the Build the AI corrects the behaviour of a drafted feature, opening version N+1 in correction ${T('92786fba')}`, async () => {
		s.show(requestAt('implementation', { drafts: [draftOn()] }));
		expect(await write()).toMatchObject({ ok: true });
		expect(s.saved().drafts[0].behaviourModel?.operations).toEqual(OPS);
		expect(s.saved().correction?.of).toBe(1);
	});
});
