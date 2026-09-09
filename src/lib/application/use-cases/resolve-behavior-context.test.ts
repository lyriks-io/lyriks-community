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
});
