import { describe, expect, it } from 'vitest';
import type { BehaviorRepositoryPort } from '../ports';
import { DetectFeatureIdCollisionUseCase } from './detect-feature-id-collision';

const repository = (over: Partial<BehaviorRepositoryPort> = {}): BehaviorRepositoryPort =>
	({
		loadProject: async () => null,
		saveProject: async () => {},
		loadFeature: async () => null,
		saveFeature: async () => {},
		deleteProject: async () => {},
		workspaceRoot: () => '/tmp',
		...over
	}) as BehaviorRepositoryPort;

describe('DetectFeatureIdCollisionUseCase', () => {
	it('names the projects that claim the same id', async () => {
		const useCase = new DetectFeatureIdCollisionUseCase(
			repository({ projectsHoldingFeature: async () => ['other-project'] })
		);

		await expect(useCase.execute('p1', 'feat-glossary')).resolves.toEqual(['other-project']);
	});

	it('stays silent on a store that cannot enumerate the workspace', async () => {
		// An HTTP-backed store omits the capability. Not knowing must read as "no
		// known clash": refusing every write on a store that cannot answer would
		// take the whole authoring path down.
		const useCase = new DetectFeatureIdCollisionUseCase(repository());

		await expect(useCase.execute('p1', 'feat-glossary')).resolves.toEqual([]);
	});

	it('stays silent when the scan itself fails', async () => {
		const useCase = new DetectFeatureIdCollisionUseCase(
			repository({
				projectsHoldingFeature: async () => {
					throw new Error('EACCES');
				}
			})
		);

		await expect(useCase.execute('p1', 'feat-glossary')).resolves.toEqual([]);
	});
});
