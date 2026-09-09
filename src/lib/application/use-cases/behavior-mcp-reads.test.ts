import { describe, expect, it, vi } from 'vitest';
import { ReadBehaviorFeatureUseCase } from './read-behavior-feature';
import { ReadBehaviorOperationsUseCase } from './read-behavior-operations';
import { ScoreBehaviorFeatureUseCase } from './score-behavior-feature';

describe('behavior MCP read use-cases', () => {
	it('reads a project-scoped canonical feature snapshot', async () => {
		const snapshot = {
			format: 'unspaghettit' as const,
			version: 1 as const,
			feature: { id: 'feature-1', surfaces: [{ id: 'surface-1' }] }
		};
		const readFeature = vi.fn().mockResolvedValue(snapshot);
		const useCase = new ReadBehaviorFeatureUseCase({ readFeature });

		await expect(useCase.execute('project-1', 'feature-1')).resolves.toBe(snapshot);
		expect(readFeature).toHaveBeenCalledWith('project-1', 'feature-1');
	});

	it('preserves detailed maturity filters', async () => {
		const report = { percentage: 42, issues: [{ area: 'scenarios' }] };
		const scoreFeatureDetailed = vi.fn().mockResolvedValue(report);
		const useCase = new ScoreBehaviorFeatureUseCase({ scoreFeatureDetailed });

		await expect(
			useCase.execute({
				featureId: 'feature-1',
				includeIssues: true,
				area: 'scenarios',
				severity: 'critical'
			})
		).resolves.toBe(report);
		expect(scoreFeatureDetailed).toHaveBeenCalledWith('feature-1', {
			featureId: 'feature-1',
			includeIssues: true,
			area: 'scenarios',
			severity: 'critical'
		});
	});

	it('reads operation guidance from the engine adapter', async () => {
		const getOperationsReference = vi.fn().mockResolvedValue('# Operations');
		const describeOperations = vi.fn();
		const useCase = new ReadBehaviorOperationsUseCase({ getOperationsReference, describeOperations });

		await expect(useCase.execute()).resolves.toBe('# Operations');
	});

	it('reads one operation schema without loading the full reference', async () => {
		const getOperationsReference = vi.fn();
		const describeOperations = vi.fn().mockResolvedValue({
			ok: true,
			kind: 'add_action_rule',
			schema: 'add_action_rule { surfaceId, actionId, rule }'
		});
		const useCase = new ReadBehaviorOperationsUseCase({ getOperationsReference, describeOperations });

		await expect(useCase.execute('add_action_rule')).resolves.toMatchObject({ ok: true });
		expect(describeOperations).toHaveBeenCalledWith('add_action_rule');
		expect(getOperationsReference).not.toHaveBeenCalled();
	});
});
