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

	it('counts a feature the engine did not finish as not checked yet, never as clean, and checks it again [criterion:29279fff]', async () => {
		const { useCase, advisor } = harness(3);
		// The engine ran out of its time on feat-1 once.
		advisor.verify.mockImplementation((async (fid: string) => (fid === 'feat-1' && advisor.verify.mock.calls.length <= 3 ? null : verdict)) as never);
		const first = await useCase.execute('p');
		expect(first).toEqual([
			expect.objectContaining({
				code: 'capped',
				unchecked: 1,
				title: '1 feature has not been checked yet',
				detail: "1 could not be checked within the engine's time and will be checked again; the behavior engine checks 40 features per pass."
			})
		]);
		// Nothing was remembered for it: the next pass asks the engine about it alone, and it reads clean once checked.
		const second = await useCase.execute('p');
		expect(advisor.verify).toHaveBeenCalledTimes(4);
		expect(advisor.verify).toHaveBeenLastCalledWith('feat-1', { modelCheck: true });
		expect(second).toEqual([]);
	});

	it('says nothing when everything fits in one pass', async () => {
		const { useCase, advisor } = harness(12);
		expect(await useCase.execute('p')).toEqual([]);
		expect(advisor.verify).toHaveBeenCalledTimes(12);
	});
});

// Criterion 97f2df12: each flaw the solver proved is a problem of its own, written as the requirement it breaks.
describe('what the solver proved', () => {
	const proofWith = (findings: unknown[], solver: 'ran' | 'unavailable' = 'ran') => ({
		solver,
		reason: solver === 'ran' ? undefined : 'z3-solver is missing',
		questions: 4,
		unsettled: 0,
		paths: { maxSteps: 6, results: [] },
		leads: [],
		findings
	});
	const run = async (proof: unknown, gaps: unknown[] = []) => {
		const advisor = {
			available: true,
			verify: vi.fn(async () => ({ ...verdict, features: [{ featureId: 'feat-cart', featureName: 'Cart', passed: false }] })),
			getSpecGaps: vi.fn(async () => gaps),
			getSpecGapsAndProof: vi.fn(async () => ({ gaps, proof }))
		};
		const behavior = {
			loadProject: vi.fn(async () => ({ project: { featureIds: ['feat-cart'] } })),
			loadFeature: vi.fn(async () => ({
				feature: {
					id: 'feat-cart',
					name: 'Cart',
					updatedAt: '2026-09-29T10:00:00Z',
					featureInvariants: [{ id: 'inv', name: 'Stock never negative', condition: { left: 'stock', operator: 'greater_or_equal', right: 0 } }],
					surfaces: []
				}
			}))
		};
		return new ComputeBehaviorAdvisoriesUseCase(advisor as never, behavior as never).execute('p');
	};

	it('gives each proven flaw its own advisory, blocking when a statement breaks, with its proof', async () => {
		const advisories = await run(
			proofWith([
				{
					kind: 'reachable-violation',
					severity: 'critical',
					detail: 'breaks',
					invariantId: 'inv',
					invariantName: 'Stock never negative',
					path: [{ actionId: 'take', actionName: 'Take one', surfaceId: 's', parameters: { qty: 3 } }]
				},
				{ kind: 'reachable-deadlock', severity: 'recommended', detail: 'stuck', path: [{ actionId: 'take', actionName: 'Take one', surfaceId: 's', parameters: {} }] }
			]),
			[
				{ severity: 'critical', entityType: 'action', entityId: 'take', entityName: 'Take one', reason: 'breaks. Situation: ...', suggestedFix: '' },
				{ severity: 'recommended', entityType: 'action', entityId: 'take', entityName: 'Take one', reason: 'Action "Take one" has no ImplementationStatus entry.', suggestedFix: '' }
			]
		);
		expect(advisories).toHaveLength(2);
		expect(advisories[0]).toMatchObject({
			code: 'proven',
			blocking: true,
			kindLabel: 'Broken',
			featureName: 'Cart',
			title: 'The system shall always ensure that the stock is at least 0.',
			proof: { given: 'nothing has happened yet', when: ['Take one (qty 3)'], then: '"Stock never negative" no longer holds' }
		});
		expect(advisories[1]).toMatchObject({ code: 'proven', blocking: false, kindLabel: 'Dead end' });
	});

	// Criteria e7a2e177, 80c7447d and 2777eeed of feat-health-scores: what each card weighs is said where it is made.
	it('tags a broken rule as its cause, what was not reached as unverified, and the failing scenarios as its consequence', async () => {
		const advisor = {
			available: true,
			verify: vi.fn(async () => ({ ...verdict, scenariosFailed: 3, features: [{ featureId: 'feat-cart', featureName: 'Cart', passed: false }] })),
			getSpecGaps: vi.fn(async () => []),
			getSpecGapsAndProof: vi.fn(async () => ({
				gaps: [],
				proof: proofWith([
					{ kind: 'reachable-violation', severity: 'critical', detail: 'breaks', invariantId: 'inv', invariantName: 'Stock never negative', path: [{ actionId: 'take', actionName: 'Take one', surfaceId: 's', parameters: {} }] },
					{ kind: 'unreachable-action', severity: 'recommended', detail: 'never', actionId: 'refund', actionName: 'Refund' }
				])
			}))
		};
		const behavior = {
			loadProject: vi.fn(async () => ({ project: { featureIds: ['feat-cart'] } })),
			loadFeature: vi.fn(async () => ({
				feature: { id: 'feat-cart', name: 'Cart', updatedAt: '2026-09-29T10:00:00Z', featureInvariants: [{ id: 'inv', name: 'Stock never negative', condition: { left: 'stock', operator: 'greater_or_equal', right: 0 } }], surfaces: [] }
			}))
		};
		const read = (generated: string[]) =>
			new ComputeBehaviorAdvisoriesUseCase(advisor as never, behavior as never, undefined, { ids: async () => new Set(generated) }).execute('p');
		const advisories = await read([]);
		const broken = advisories.find((a) => a.kindLabel === 'Broken');
		expect(broken).toMatchObject({ cause: 'rule:inv', severity: 'high' });
		expect(advisories.find((a) => a.kindLabel === 'Not reached')).toMatchObject({ weighs: 'unverified' });
		expect(advisories.find((a) => a.code === 'verify')).toMatchObject({ weighs: 'consequence' });
		// The same rule generated from the data model: the spec disagrees with itself, a gap in the description.
		expect((await read(['inv'])).find((a) => a.kindLabel === 'Broken')).toMatchObject({ severity: 'low' });
	});

	it('reads the failing scenarios of a feature whose exploration breaks a rule as a consequence of that rule', async () => {
		const advisor = {
			available: true,
			verify: vi.fn(async () => ({ ...verdict, scenariosFailed: 8, features: [{ featureId: 'feat-cart', featureName: 'Cart', passed: false, brokenStatements: [{ name: 'Every link has an address', path: ['Shorten'] }] }] })),
			getSpecGaps: vi.fn(async () => []),
			getSpecGapsAndProof: vi.fn(async () => ({ gaps: [], proof: proofWith([]) }))
		};
		const behavior = {
			loadProject: vi.fn(async () => ({ project: { featureIds: ['feat-cart'] } })),
			loadFeature: vi.fn(async () => ({ feature: { id: 'feat-cart', name: 'Cart', updatedAt: '2026-09-29T10:00:00Z', surfaces: [] } }))
		};
		const advisories = await new ComputeBehaviorAdvisoriesUseCase(advisor as never, behavior as never).execute('p');
		expect(advisories.find((a) => a.code === 'verify')).toMatchObject({ weighs: 'consequence' });
	});

	it('reads failing scenarios that meet a broken rule as its consequence, asking the engine only then', async () => {
		const runScenarios = vi.fn(async () => ({ featureId: 'feat-cart', featureName: 'Cart', total: 3, passed: 2, failed: 1, results: [{ scenarioId: 's', scenarioName: 'Owner gets a link', actionName: 'Ask', personaName: null, pass: false, actualStatus: 'blocked' as const, expectedStatus: 'success' as const, summary: 'status was blocked but expected success (invariant violations: Every user has a password.)', assertions: [] }] }));
		const advisor = {
			available: true,
			verify: vi.fn(async () => ({ ...verdict, scenariosFailed: 1, features: [{ featureId: 'feat-cart', featureName: 'Cart', passed: false }] })),
			getSpecGaps: vi.fn(async () => []),
			getSpecGapsAndProof: vi.fn(async () => ({ gaps: [], proof: proofWith([]) })),
			runScenarios
		};
		const behavior = {
			loadProject: vi.fn(async () => ({ project: { featureIds: ['feat-cart'] } })),
			loadFeature: vi.fn(async () => ({ feature: { id: 'feat-cart', name: 'Cart', updatedAt: '2026-09-29T10:00:00Z', surfaces: [] } }))
		};
		const advisories = await new ComputeBehaviorAdvisoriesUseCase(advisor as never, behavior as never).execute('p');
		expect(advisories.find((a) => a.code === 'verify')).toMatchObject({ weighs: 'consequence' });
		expect(runScenarios).toHaveBeenCalledTimes(1);
	});

	it('never passes silently a feature the solver could not prove', async () => {
		const advisories = await run(proofWith([], 'unavailable'));
		expect(advisories).toEqual([
			expect.objectContaining({ code: 'unproven', title: 'Cart could not be proven', kindLabel: 'Not proven' })
		]);
	});
});

describe('the language of the cards', () => {
	const setup = (featureIds: string[], language: { current: 'en' | 'fr' }) => {
		const advisor = {
			available: true,
			verify: vi.fn(async () => verdict),
			getSpecGaps: vi.fn(async () => []),
			getSpecGapsAndProof: vi.fn(async () => ({
				gaps: [],
				proof: { solver: 'unavailable', reason: 'z3-solver is missing', questions: 0, unsettled: 0, leads: [] }
			}))
		};
		const behavior = {
			loadProject: vi.fn(async () => ({ project: { featureIds } })),
			loadFeature: vi.fn(async (_p: string, fid: string) => ({
				feature: { id: fid, name: 'Cart', updatedAt: '2026-09-29T10:00:00Z', surfaces: [] }
			}))
		};
		const specLanguage = {
			generated: vi.fn(async () => language.current),
			execute: vi.fn(async () => {
				throw new Error('the cards only need the declared language');
			})
		};
		return {
			useCase: new ComputeBehaviorAdvisoriesUseCase(advisor as never, behavior as never, specLanguage),
			advisor
		};
	};

	it('remembers a card per language: declaring another one rewrites it, the same one is served from memory', async () => {
		const language = { current: 'en' as 'en' | 'fr' };
		const { useCase, advisor } = setup(['feat-cart'], language);
		expect((await useCase.execute('p'))[0]?.kindLabel).toBe('Not proven');
		language.current = 'fr';
		const french = await useCase.execute('p');
		expect(advisor.verify).toHaveBeenCalledTimes(2);
		expect(advisor.getSpecGapsAndProof).toHaveBeenLastCalledWith('feat-cart', undefined, 'fr');
		expect(french[0]).toMatchObject({
			kindLabel: 'Non prouvé',
			title: "La fonctionnalité « Cart » n'a pas pu être prouvée",
			detail: "Le solveur n'a pas démarré (le solveur Z3 n'est pas installé) : rien n'est prouvé sur cette fonctionnalité."
		});
		await useCase.execute('p');
		expect(advisor.verify).toHaveBeenCalledTimes(2);
	});

	it('writes the capped note in French', async () => {
		const ids = Array.from({ length: 41 }, (_, i) => `feat-${i}`);
		const { useCase } = setup(ids, { current: 'fr' });
		const out = await useCase.execute('p');
		expect(out.at(-1)).toMatchObject({
			code: 'capped',
			title: "1 fonctionnalité n'a pas encore été vérifiée"
		});
		expect(JSON.stringify(out)).not.toMatch(/could not be proven|not been checked/);
	});
});
