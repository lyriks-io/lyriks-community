import { describe, expect, it } from 'vitest';
import type { UnspaghettitAdvisorPort } from '../ports';
import { AssessFeatureUseCase } from './assess-feature';

/**
 * An advisor whose reads answer from a script: one entry per call, so a test
 * can make the first round drop a read the way a recycled subprocess does and
 * let the second round answer properly.
 */
function scriptedAdvisor(script: Partial<Record<string, unknown[]>>) {
	const calls: string[] = [];
	const next = (name: string, fallback: unknown) => {
		calls.push(name);
		const queue = script[name];
		if (!queue || queue.length === 0) return fallback;
		return queue.shift();
	};
	const advisor = {
		available: true,
		getFeatureBehavior: async () => next('behavior', { surfaces: ['Board'] }),
		scoreFeature: async () => next('score', { percentage: 90 }),
		findFeatureGaps: async () => [],
		getSpecGaps: async () => [],
		runScenarios: async () => next('scenarios', { total: 1, passed: 1, failed: 0 }),
		modelCheck: async () => next('modelCheck', { statesExplored: 3 }),
		verify: async () => next('verdict', { passed: true }),
		getImplementationCoverage: async () => null,
		getDigest: async () => next('digest', { hasContent: true, markdown: '# Board' })
	} as unknown as UnspaghettitAdvisorPort;
	return { advisor, calls };
}

describe('AssessFeatureUseCase', () => {
	it('asks again for a read that died beside a call that overran', async () => {
		// One call exceeding its budget drops the shared subprocess and every call
		// in flight with it, so a fully modelled feature comes back with holes.
		const { advisor, calls } = scriptedAdvisor({
			behavior: [null],
			verdict: [null],
			digest: [null]
		});

		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');

		expect(assessment.behavior).toEqual({ surfaces: ['Board'] });
		expect(assessment.verdict).toEqual({ passed: true });
		expect(assessment.digest).toMatchObject({ hasContent: true });
		expect(assessment.degraded).toEqual([]);
		expect(calls.filter((c) => c === 'behavior')).toHaveLength(2);
		// The reads that answered the first time are not asked twice.
		expect(calls.filter((c) => c === 'score')).toHaveLength(1);
	});

	it('names what stayed lost instead of showing it as unauthored', async () => {
		const { advisor } = scriptedAdvisor({ verdict: [null, null], digest: [null, null] });

		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');

		expect(assessment.verdict).toBeNull();
		expect(assessment.degraded).toEqual(['verdict', 'digest']);
	});

	it('reports a feature the engine does not hold as absent, not as degraded', async () => {
		// Every read empty is the honest shape of "no such feature": retrying it
		// would only spend the engine on a question already answered.
		const { advisor, calls } = scriptedAdvisor({
			behavior: [null],
			score: [null],
			scenarios: [null],
			modelCheck: [null],
			verdict: [null],
			digest: [null]
		});

		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-unknown');

		expect(assessment.degraded).toEqual([]);
		expect(calls.filter((c) => c === 'behavior')).toHaveLength(1);
	});

	it('leaves a complete reading exactly as it was', async () => {
		const { advisor, calls } = scriptedAdvisor({});

		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');

		expect(assessment.degraded).toEqual([]);
		expect(assessment.available).toBe(true);
		expect(calls).toHaveLength(6);
	});

	it('answers without touching the engine when it is unreachable', async () => {
		const advisor = { available: false } as unknown as UnspaghettitAdvisorPort;

		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');

		expect(assessment.available).toBe(false);
		expect(assessment.degraded).toEqual([]);
	});
});
