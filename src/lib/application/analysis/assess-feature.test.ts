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

describe('AssessFeatureUseCase: the solver answer', () => {
	it('carries the proof beside the gaps from one read', async () => {
		const { advisor } = scriptedAdvisor({});
		const proof = { solver: 'ran' as const, questions: 3, unsettled: 1, leads: [] };
		let reads = 0;
		const withProof = {
			...advisor,
			available: true,
			getSpecGaps: async () => {
				throw new Error('the gaps are read with the proof');
			},
			getSpecGapsAndProof: async () => {
				reads += 1;
				return { gaps: [], proof };
			}
		} as unknown as UnspaghettitAdvisorPort;

		const assessment = await new AssessFeatureUseCase(withProof).execute('feat-1');

		expect(assessment.proof).toEqual(proof);
		expect(reads).toBe(1);
	});

	it('shows no proof for an adapter that cannot read one', async () => {
		const { advisor } = scriptedAdvisor({});
		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');
		expect(assessment.proof).toBeNull();
	});
});

describe('AssessFeatureUseCase: the exploration as a fallback', () => {
	const proof = (outcome: 'reached' | 'unsettled') => ({
		solver: 'ran' as const,
		questions: 5,
		unsettled: 0,
		paths: { maxSteps: 6, results: [] },
		actions: { maxSteps: 6, results: [{ actionId: 'a1', actionName: 'Open', outcome }] },
		deadlocks: { maxSteps: 6, outcome: 'none-within-bound' as const },
		leads: []
	});
	const withProof = (outcome: 'reached' | 'unsettled') => {
		const { advisor, calls } = scriptedAdvisor({});
		let explored = 0;
		const withIt = {
			...advisor,
			available: true,
			getSpecGapsAndProof: async () => ({ gaps: [], proof: proof(outcome) }),
			modelCheck: async () => {
				explored += 1;
				return { statesExplored: 3, truncated: false, invariantViolations: [], deadActions: [], deadlockStates: 0, unreachableSurfaces: [], terminalSurfaces: [] };
			}
		} as unknown as UnspaghettitAdvisorPort;
		return { advisor: withIt, calls, explored: () => explored };
	};

	it('does not run the exploration when the solver settled everything, says why, and never asks for it again', async () => {
		const { advisor, explored } = withProof('reached');
		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');
		expect(explored()).toBe(0);
		expect(assessment.modelCheck).toBeNull();
		expect(assessment.exploration).toEqual({ run: false, reasons: ['the solver settled every statement, action, goal and dead end within 6 steps'] });
		expect(assessment.degraded).not.toContain('modelCheck');
		expect(assessment.evidence.explorationStatus).toBe('solver');
	});

	it('runs it as soon as the solver leaves one element open', async () => {
		const { advisor, explored } = withProof('unsettled');
		const assessment = await new AssessFeatureUseCase(advisor).execute('feat-1');
		expect(explored()).toBe(1);
		expect(assessment.exploration.run).toBe(true);
		expect(assessment.modelCheck).not.toBeNull();
	});
});

describe('AssessFeatureUseCase: the first pass', () => {
	it('asks the first pass by default and the full proof when asked complete', async () => {
		const { advisor } = scriptedAdvisor({});
		const asked: unknown[] = [];
		const withProof = {
			...advisor,
			available: true,
			getSpecGapsAndProof: async (...args: unknown[]) => {
				asked.push(args[3]);
				return { gaps: [], proof: { solver: 'ran' as const, questions: 3, unsettled: 2, leads: [], moreToCome: args[3] !== undefined } };
			}
		} as unknown as UnspaghettitAdvisorPort;

		const first = await new AssessFeatureUseCase(withProof).execute('feat-1');
		const full = await new AssessFeatureUseCase(withProof).execute('feat-1', undefined, { complete: true });

		expect(asked).toEqual([undefined, { complete: true }]);
		expect(first.proof?.moreToCome).toBe(false);
		expect(full.proof?.moreToCome).toBe(true);
	});
});

describe('the language of an assessment', () => {
	it('reads the declared language only, beside the engine calls, and asks the gaps and the findings in it', async () => {
		const { advisor } = scriptedAdvisor({});
		const asked: unknown[] = [];
		const withProof = {
			...advisor,
			getSpecGapsAndProof: async (...args: unknown[]) => {
				asked.push(args);
				return {
					gaps: [],
					proof: {
						solver: 'ran',
						questions: 1,
						unsettled: 0,
						leads: [],
						findings: [
							{ kind: 'always-blocked', severity: 'recommended', detail: 'refused', actionName: 'Pay' }
						]
					}
				};
			}
		} as unknown as UnspaghettitAdvisorPort;
		const specLanguage = {
			generated: async () => 'fr' as const,
			execute: async () => {
				throw new Error('an assessment never reads the whole prose');
			}
		};
		const assessment = await new AssessFeatureUseCase(withProof, undefined, specLanguage).execute(
			'feat-1',
			'p'
		);
		expect(asked).toEqual([['feat-1', undefined, 'fr']]);
		expect(assessment.language).toBe('fr');
		expect(assessment.provenFindings[0]?.label).toBe('Toujours refusée');
	});

	it('stays in English without a project', async () => {
		const { advisor } = scriptedAdvisor({});
		const specLanguage = { generated: async () => 'fr' as const };
		const assessment = await new AssessFeatureUseCase(advisor, undefined, specLanguage).execute('feat-1');
		expect(assessment.language).toBeUndefined();
	});
});
