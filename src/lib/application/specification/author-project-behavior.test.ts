import { describe, expect, it, vi } from 'vitest';
import { AuthorProjectBehaviorUseCase } from './author-project-behavior';

const advisor = () => ({
	applyProjectBatch: vi.fn().mockResolvedValue({ kind: 'answer', value: { ok: true } }),
	promoteToProjectLibrary: vi.fn().mockResolvedValue({ kind: 'answer', value: { ok: true } })
});

describe('AuthorProjectBehaviorUseCase', () => {
	it('sends invariants and state variables to the engine batch, op spelled kind', async () => {
		const a = advisor();
		await new AuthorProjectBehaviorUseCase(a).execute({
			projectId: 'p1',
			operations: [{ op: 'add_project_invariant', invariant: { name: 'x' } }],
			dryRun: true
		});
		expect(a.applyProjectBatch).toHaveBeenCalledWith(
			'p1',
			[{ op: 'add_project_invariant', kind: 'add_project_invariant', invariant: { name: 'x' } }],
			true
		);
	});

	it('refuses a core written by hand: the feature tree declares them', async () => {
		const a = advisor();
		const result = await new AuthorProjectBehaviorUseCase(a).execute({
			projectId: 'p1',
			operations: [{ kind: 'declare_core_feature', value: 'billing', description: 'x' }],
			dryRun: false
		});
		expect(result).toMatchObject({ kind: 'refused' });
		expect(JSON.stringify(result)).toContain('patch_section features');
		expect(a.applyProjectBatch).not.toHaveBeenCalled();
	});

	it('runs a library promotion alone, never inside a batch nor as a dry run', async () => {
		const a = advisor();
		const useCase = new AuthorProjectBehaviorUseCase(a);
		const promote = {
			kind: 'promote_to_project_library',
			featureId: 'f1',
			definitionKind: 'entity',
			id: 'e1'
		};
		expect(
			await useCase.execute({
				projectId: 'p1',
				operations: [promote, { kind: 'add_state_variable' }],
				dryRun: false
			})
		).toMatchObject({ kind: 'refused' });
		expect(
			await useCase.execute({ projectId: 'p1', operations: [promote], dryRun: true })
		).toMatchObject({
			kind: 'refused'
		});
		await useCase.execute({ projectId: 'p1', operations: [promote], dryRun: false });
		expect(a.promoteToProjectLibrary).toHaveBeenCalledWith({
			expectedProjectId: 'p1',
			featureId: 'f1',
			definitionKind: 'entity',
			id: 'e1'
		});
	});
});
