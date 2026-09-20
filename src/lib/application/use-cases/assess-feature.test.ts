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
		// Not logged in `calls`: that log counts the reads a lost call is asked again for,
		// and coverage is not one of them (null is what an un-adopted feature reads as).
		getImplementationCoverage: async () => script.implementation?.shift() ?? null,
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

	it('answers what is proven and what verifies each criterion under implementation, apart from every score', async () => {
		const implementation = {
			total: 8,
			implemented: 6,
			partial: 0,
			missing: 2,
			percentage: 75,
			proven: { actions: 1, total: 2 },
			criteria: [
				{
					id: 'crit-1',
					title: 'Footsteps are silent in deep water',
					standing: 'active',
					state: 'failing',
					stale: false,
					verification: { kind: 'integration', lastResult: { passed: false, at: '2026-09-20T09:00:00.000Z' } }
				}
			]
		};
		const { advisor } = scriptedAdvisor({ implementation: [implementation] });

		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');

		expect(assessment.implementation).toEqual(implementation);
		// A failing criterion is evidence for a reader: it moves neither the maturity
		// score nor the verdict, and it is not a lost read.
		expect(assessment.score).toEqual({ percentage: 90 });
		expect(assessment.verdict).toEqual({ passed: true });
		expect(assessment.degraded).toEqual([]);
	});

	it('answers plain coverage, with neither part, on an engine that reports neither', async () => {
		const implementation = { total: 4, implemented: 3, partial: 0, missing: 1, percentage: 75 };
		const { advisor } = scriptedAdvisor({ implementation: [implementation] });

		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');

		expect(assessment.implementation).toEqual(implementation);
		expect('proven' in assessment.implementation!).toBe(false);
		expect('criteria' in assessment.implementation!).toBe(false);
	});
});
