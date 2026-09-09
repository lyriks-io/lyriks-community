import { describe, expect, it, vi } from 'vitest';
import { ComputeBehaviorAdvisoriesUseCase } from './compute-behavior-advisories';

const verdict = { passed: true, featuresChecked: 1, featuresPassed: 1, featuresFailed: 0, scenariosRun: 0, scenariosFailed: 0, invariantViolations: 0, features: [] };

function harness(featureCount: number) {
	const ids = Array.from({ length: featureCount }, (_, i) => `feat-${i}`);
	const advisor = {
		available: true,
		verify: vi.fn(async () => verdict),
		getSpecGaps: vi.fn(async () => [])
	};
	const behavior = {
		loadProject: vi.fn(async () => ({ project: { featureIds: ids } })),
		loadFeature: vi.fn(async (_p: string, fid: string) => ({ feature: { id: fid, updatedAt: '2026-09-03T10:00:00Z' } }))
	};
	return { useCase: new ComputeBehaviorAdvisoriesUseCase(advisor as never, behavior as never), advisor };
}

describe('the behavior check budget', () => {
	it('checks 40 features per pass and says how many still wait, then finishes them on the next pass', async () => {
		const { useCase, advisor } = harness(45);
		const first = await useCase.execute('p');
		expect(advisor.verify).toHaveBeenCalledTimes(40);
		expect(first.map((a) => a.title)).toEqual(['5 features have not been checked yet']);

		const second = await useCase.execute('p');
		// Only what was never checked goes to the engine; the 40 remembered cost nothing.
		expect(advisor.verify).toHaveBeenCalledTimes(45);
		expect(second).toEqual([]);
	});

	it('says nothing when everything fits in one pass', async () => {
		const { useCase, advisor } = harness(12);
		expect(await useCase.execute('p')).toEqual([]);
		expect(advisor.verify).toHaveBeenCalledTimes(12);
	});
});
