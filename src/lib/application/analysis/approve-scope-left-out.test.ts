import { describe, expect, it } from 'vitest';
import { createEmptyScopeDraft, createScopeCapability, leftOutFingerprint, type ProjectScopeDraft } from '$domain/scope';
import { ApproveScopeLeftOutUseCase } from './approve-scope-left-out';
import { SaveScopeDraftUseCase } from './project-completion';

function store(initial: ProjectScopeDraft | null) {
	let current = initial;
	return {
		port: {
			load: async () => current,
			save: async (draft: ProjectScopeDraft) => {
				current = draft;
				return 2;
			},
			currentRevision: async () => 1
		},
		current: () => current
	};
}

const clock = { nowIso: () => '2026-11-25T21:00:00.000Z' };
const scope: ProjectScopeDraft = {
	...createEmptyScopeDraft('p1'),
	mode: 'selected_scope',
	capabilities: [createScopeCapability('c2', { name: 'Issue licence keys', disposition: 'excluded', rationale: 'App only.' })]
};

describe('A person approves what the spec leaves out, as it stands [criterion:d16b352d]', () => {
	it('stamps the approval with the person given and the server clock', async () => {
		const repo = store(scope);
		const result = await new ApproveScopeLeftOutUseCase(repo.port, clock).execute('p1', leftOutFingerprint(scope), 'Ann Lee');
		expect(result).toEqual({ ok: true, approval: { by: 'Ann Lee', at: '2026-11-25T21:00:00.000Z', leftOut: leftOutFingerprint(scope) } });
		expect(repo.current()?.boundary.approval?.by).toBe('Ann Lee');
	});

	it('refuses a list rewritten since the drawer showed it, and writes nothing', async () => {
		const repo = store(scope);
		const result = await new ApproveScopeLeftOutUseCase(repo.port, clock).execute('p1', 'fnv1a-00000000', 'Ann Lee');
		expect(result).toEqual({ ok: false, refusal: 'changed' });
		expect(repo.current()?.boundary.approval).toBeNull();
	});

	it('is never written nor erased by a scope save', async () => {
		const approval = { by: 'Ann Lee', at: '2026-11-25T21:00:00.000Z', leftOut: leftOutFingerprint(scope) };
		const repo = store({ ...scope, boundary: { ...scope.boundary, approval } });
		await new SaveScopeDraftUseCase(repo.port, clock).execute({ ...scope, boundary: { ...scope.boundary, approval: null } });
		expect(repo.current()?.boundary.approval).toEqual(approval);
		const fresh = store(scope);
		await new SaveScopeDraftUseCase(fresh.port, clock).execute({ ...scope, boundary: { ...scope.boundary, approval: { ...approval, by: 'an AI' } } });
		expect(fresh.current()?.boundary.approval).toBeNull();
	});
});
