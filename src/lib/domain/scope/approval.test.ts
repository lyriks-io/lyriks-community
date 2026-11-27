import { describe, expect, it } from 'vitest';
import { approveLeftOut, leftOutFingerprint, scopeApprovalState } from './approval';
import { createEmptyScopeDraft, createScopeCapability, type ProjectScopeDraft } from './draft';

const app = 'Outside the application-only specification requested by the owner.';

function scope(overrides: Partial<ProjectScopeDraft> = {}): ProjectScopeDraft {
	return {
		...createEmptyScopeDraft('p1'),
		mode: 'selected_scope',
		capabilities: [
			createScopeCapability('c1', { name: 'Read a feature', disposition: 'included' }),
			createScopeCapability('c2', { name: 'Issue licence keys', disposition: 'excluded', rationale: app, group: 'Releasing' }),
			createScopeCapability('c3', { name: 'Voice input', disposition: 'deferred', rationale: 'Next release.' })
		],
		...overrides
	};
}

function approved(base: ProjectScopeDraft = scope()): ProjectScopeDraft {
	const result = approveLeftOut(base, leftOutFingerprint(base), 'Ann Lee', '2026-11-25T21:00:00.000Z');
	if (!result.ok) throw new Error(result.refusal);
	return result.scope;
}

describe('A person approves what the spec leaves out, as it stands [criterion:d16b352d]', () => {
	it('records who approved the list, when, and the list itself', () => {
		const after = approved();
		expect(after.boundary.approval).toEqual({ by: 'Ann Lee', at: '2026-11-25T21:00:00.000Z', leftOut: leftOutFingerprint(scope()) });
		expect(scopeApprovalState(after)).toBe('current');
		expect(scopeApprovalState(scope())).toBe('none');
	});

	it('lapses when a capability left out, its disposition or its reason changes', () => {
		const after = approved();
		const [c1, c2, c3] = after.capabilities;
		expect(scopeApprovalState({ ...after, capabilities: [c1, c2, { ...c3, rationale: 'Never.' }] })).toBe('changed');
		expect(scopeApprovalState({ ...after, capabilities: [c1, c2, { ...c3, disposition: 'excluded' }] })).toBe('changed');
		expect(scopeApprovalState({ ...after, capabilities: [c1, c2, { ...c3, disposition: 'included' }] })).toBe('changed');
		expect(scopeApprovalState({ ...after, capabilities: [{ ...c1, disposition: 'excluded', rationale: app }, c2, c3] })).toBe('changed');
	});

	it('holds when only how the list reads changes: groups, summaries, covers, decision, inclusions', () => {
		const after = approved();
		const [c1, c2, c3] = after.capabilities;
		const reworded: ProjectScopeDraft = {
			...after,
			boundary: { ...after.boundary, covers: 'The app.', decision: 'Asked by the owner.', groups: [{ name: 'Later', summary: 'one line' }] },
			capabilities: [{ ...c1, name: 'Read any feature' }, { ...c2, group: 'Shipping' }, { ...c3, group: 'Later' }, createScopeCapability('c4', { disposition: 'included' })]
		};
		expect(scopeApprovalState(reworded)).toBe('current');
	});

	it('refuses an approval with nothing left out, one already current, and a list changed since it was shown', () => {
		const full = scope({ mode: 'full_product' });
		expect(approveLeftOut(full, leftOutFingerprint(full), 'A', 'now')).toEqual({ ok: false, refusal: 'nothing' });
		const after = approved();
		expect(approveLeftOut(after, leftOutFingerprint(after), 'A', 'now')).toEqual({ ok: false, refusal: 'already' });
		const shown = leftOutFingerprint(scope());
		const rewritten = scope({ capabilities: [...scope().capabilities, createScopeCapability('c5', { disposition: 'excluded', rationale: app })] });
		expect(approveLeftOut(rewritten, shown, 'A', 'now')).toEqual({ ok: false, refusal: 'changed' });
	});
});
