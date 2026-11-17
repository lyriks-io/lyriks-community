import { describe, expect, it, vi } from 'vitest';
import { ResolveBehaviorContextUseCase } from './resolve-behavior-context';

describe('ResolveBehaviorContextUseCase', () => {
	it('reports the adapter availability for a feature-id-only lookup', async () => {
		const getBehaviorContext = vi.fn();
		const useCase = new ResolveBehaviorContextUseCase({ available: true, getBehaviorContext });

		const result = await useCase.execute({ projectId: 'project-1' });

		expect(result.engineAvailable).toBe(true);
		expect(result.featureId).toBe('project-1__experience');
		expect(getBehaviorContext).not.toHaveBeenCalled();
	});

	it('uses the neighborhood result as the availability signal for entity lookups', async () => {
		const getBehaviorContext = vi.fn().mockResolvedValue(null);
		const useCase = new ResolveBehaviorContextUseCase({ available: true, getBehaviorContext });

		const result = await useCase.execute({ projectId: 'project-1', stepId: 'step-1' });

		expect(result.engineAvailable).toBe(false);
		expect(result.actionId).toBe('act-step-1');
	});

	const miss = (featureId: string, rootKey: string) => ({
		featureId,
		rootKey,
		found: false,
		kind: 'action' as const,
		surfaceId: null,
		surfaceName: null,
		actionId: null,
		name: null,
		depth: null
	});

	it('finds a kernel action id in the leaf feature that owns it', async () => {
		const getBehaviorContext = vi.fn(async (featureId: string, rootKey: string) =>
			featureId === 'feat-materials'
				? {
						...miss(featureId, rootKey),
						found: true,
						surfaceId: '5bc80c6d',
						surfaceName: 'Materials',
						actionId: '8305a7af',
						name: 'Settle Cacao Tree'
					}
				: miss(featureId, rootKey)
		);
		const useCase = new ResolveBehaviorContextUseCase(
			{ available: true, getBehaviorContext },
			async () => ['feat-ecology', 'feat-materials', 'feat-never-read']
		);

		const result = await useCase.execute({ projectId: 'project-1', actionId: '8305a7af' });

		expect(result).toMatchObject({
			featureId: 'feat-materials',
			surfaceId: '5bc80c6d',
			actionId: '8305a7af',
			name: 'Settle Cacao Tree',
			found: true
		});
		// Stops at the owner: the features after it are never read.
		expect(getBehaviorContext.mock.calls.map(([featureId]) => featureId)).toEqual([
			'project-1__experience',
			'feat-ecology',
			'feat-materials'
		]);
	});

	it('keeps the Experience answer when no leaf feature holds the id', async () => {
		const getBehaviorContext = vi.fn(async (featureId: string, rootKey: string) => miss(featureId, rootKey));
		const useCase = new ResolveBehaviorContextUseCase(
			{ available: true, getBehaviorContext },
			async () => ['feat-ecology']
		);

		const result = await useCase.execute({ projectId: 'project-1', actionId: 'nope' });

		expect(result.featureId).toBe('project-1__experience');
		expect(result.found).toBe(false);
	});

	it('never searches the leaves for a wizard id, which only the Experience can hold', async () => {
		const getBehaviorContext = vi.fn(async (featureId: string, rootKey: string) => miss(featureId, rootKey));
		const leafFeatureIds = vi.fn(async () => ['feat-ecology']);
		const useCase = new ResolveBehaviorContextUseCase({ available: true, getBehaviorContext }, leafFeatureIds);

		await useCase.execute({ projectId: 'project-1', stepId: 'step-1' });

		expect(leafFeatureIds).not.toHaveBeenCalled();
	});
});
