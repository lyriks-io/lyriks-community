import { describe, expect, it, vi } from 'vitest';
import type {
	BehaviorRepositoryPort,
	FeaturesDraftRepositoryPort,
	UnspaghettitAdvisorPort
} from '../ports';
import { ScoreFeaturesUseCase } from './score-features';

const draft = {
	projectId: 'p1',
	features: [
		{ id: 'feat-a', name: 'A', parentId: null },
		{ id: 'feat-b', name: 'B', parentId: null }
	]
};

function advisor(summary = true) {
	return {
		available: true,
		getFeatureSummary: vi.fn(async (id: string) => (summary ? { featureId: id } : null)),
		scoreFeature: vi.fn(async () => ({ percentage: 80 })),
		findFeatureGaps: vi.fn(async () => [])
	} as unknown as UnspaghettitAdvisorPort & {
		getFeatureSummary: ReturnType<typeof vi.fn>;
	};
}

function behavior(stamps: Record<string, string | undefined>): BehaviorRepositoryPort {
	return {
		loadFeature: async (_p: string, id: string) =>
			stamps[id] === undefined ? null : ({ feature: { id, updatedAt: stamps[id] } } as never)
	} as unknown as BehaviorRepositoryPort;
}

const drafts = { load: async () => draft } as unknown as FeaturesDraftRepositoryPort;

describe('ScoreFeaturesUseCase', () => {
	it('asks the engine once per leaf, then serves unchanged leaves from memory', async () => {
		const engine = advisor();
		const useCase = new ScoreFeaturesUseCase(drafts, engine, behavior({ 'feat-a': 'v1', 'feat-b': 'v1' }));

		const first = await useCase.execute('p1');
		const second = await useCase.execute('p1');

		expect(first.map((a) => a.featureId)).toEqual(['feat-a', 'feat-b']);
		expect(second).toEqual(first);
		expect(engine.getFeatureSummary).toHaveBeenCalledTimes(2);
	});

	it('asks again for a leaf whose spec stamp moved', async () => {
		const engine = advisor();
		const stamps: Record<string, string> = { 'feat-a': 'v1', 'feat-b': 'v1' };
		const useCase = new ScoreFeaturesUseCase(drafts, engine, behavior(stamps));

		await useCase.execute('p1');
		stamps['feat-b'] = 'v2';
		await useCase.execute('p1');

		expect(engine.getFeatureSummary).toHaveBeenCalledTimes(3);
		expect(engine.getFeatureSummary).toHaveBeenLastCalledWith('feat-b');
	});

	it('does not remember a reading the engine could not complete', async () => {
		const engine = advisor(false);
		const useCase = new ScoreFeaturesUseCase(drafts, engine, behavior({ 'feat-a': 'v1', 'feat-b': 'v1' }));

		await useCase.execute('p1');
		await useCase.execute('p1');

		expect(engine.getFeatureSummary).toHaveBeenCalledTimes(4);
	});

	it('still scores without a behavior repository, just without the memory', async () => {
		const engine = advisor();
		const useCase = new ScoreFeaturesUseCase(drafts, engine);

		await useCase.execute('p1');
		await useCase.execute('p1');

		expect(engine.getFeatureSummary).toHaveBeenCalledTimes(4);
	});
});
