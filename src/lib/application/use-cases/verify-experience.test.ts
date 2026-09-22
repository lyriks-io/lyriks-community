import { describe, it, expect, vi } from 'vitest';
import {
	addNode,
	createElementNode,
	createEmptyExperienceDraft,
	createJourney,
	createStep,
	ensureScreenRoot,
	type ProjectExperienceDraft,
	type SimAction
} from '$domain/experience';
import { createEmptyUsersDraft } from '$domain/users';
import { createEmptyDataDraft } from '$domain/data';
import type { UnspaghettitAdvisorPort } from '../ports';
import {
	DEFAULT_ENGINE_READ_BUDGETS,
	explorationCap,
	reconcileReachability,
	VerifyExperienceUseCase
} from './verify-experience';

const s = (id: string) => ({ surfaceId: id, surfaceName: id });

describe('reconcileReachability', () => {
	it('never lists a screen as both unreachable and terminal', () => {
		const r = reconcileReachability([s('a'), s('b')], [s('a'), s('c')]);
		expect(r.unreachableScreens.map((x) => x.surfaceId)).toEqual(['a', 'b']);
		expect(r.terminalScreens.map((x) => x.surfaceId)).toEqual(['c']); // 'a' dropped
	});

	it('leaves disjoint lists untouched', () => {
		const r = reconcileReachability([s('a')], [s('b'), s('c')]);
		expect(r.terminalScreens.map((x) => x.surfaceId)).toEqual(['b', 'c']);
	});
});


describe('explorationCap', () => {
	const work = DEFAULT_ENGINE_READ_BUDGETS.explorationWork;

	it('leaves the engine default in place on a model small enough to afford it', () => {
		expect(explorationCap(10, work)).toBeNull();
		expect(explorationCap(0, work)).toBeNull();
	});

	it('narrows the cap as the number of actions grows, so the cost stays flat', () => {
		const medium = explorationCap(104, work);
		const large = explorationCap(300, work);
		expect(medium).toBe(577);
		expect(large).toBe(200);
		expect(large!).toBeLessThan(medium!);
	});

	it('never narrows so far that exploring stops being worth it', () => {
		expect(explorationCap(100_000, work)).toBe(120);
	});
});

/** An advisor that answers every read, and records the order they arrived in. */
function advisorSpy(overrides: Partial<UnspaghettitAdvisorPort> = {}) {
	const calls: string[] = [];
	const advisor = {
		available: true,
		verify: async () => {
			calls.push('verify');
			return { passed: true, features: [] };
		},
		runScenarios: async () => {
			calls.push('scenarios');
			return { total: 0, passed: 0, failed: 0, results: [] };
		},
		getSpecGaps: async () => {
			calls.push('gaps');
			return [];
		},
		scoreFeature: async () => {
			calls.push('score');
			return { percentage: 90 };
		},
		modelCheck: async () => {
			calls.push('modelCheck');
			return { invariantViolations: [], deadActions: [] };
		},
		...overrides
	} as unknown as UnspaghettitAdvisorPort;
	return { advisor, calls };
}

function useCase(advisor: UnspaghettitAdvisorPort) {
	const loader = <T>(value: T) => ({ execute: async () => value }) as never;
	return new VerifyExperienceUseCase(
		loader(createEmptyExperienceDraft('project-1')),
		loader(createEmptyUsersDraft('project-1')),
		loader(createEmptyDataDraft('project-1')),
		advisor
	);
}

describe('VerifyExperienceUseCase engine reads', () => {
	it('takes the cheap readings first and the state-space exploration last', async () => {
		const { advisor, calls } = advisorSpy();

		await useCase(advisor).execute('project-1');

		expect(calls.indexOf('modelCheck')).toBe(calls.length - 1);
		expect(calls).toContain('verify');
	});

	it('gives every read a deadline, and the exploration its own', async () => {
		const modelCheck = vi.fn(async (_featureId: string, _opts?: Record<string, unknown>) => ({
			invariantViolations: [],
			deadActions: []
		}));
		const verify = vi.fn(async (_featureId?: string, _opts?: Record<string, unknown>) => ({
			passed: true,
			features: []
		}));
		const { advisor } = advisorSpy({
			modelCheck: modelCheck as never,
			verify: verify as never
		});

		await useCase(advisor).execute('project-1');

		expect(verify.mock.calls[0][1]).toEqual({ timeoutMs: DEFAULT_ENGINE_READ_BUDGETS.readMs });
		expect(modelCheck.mock.calls[0][1]).toMatchObject({
			timeoutMs: DEFAULT_ENGINE_READ_BUDGETS.explorationMs
		});
	});

	it('lists interactions the exploration did not reach, without letting them fail the verdict', async () => {
		const unreachedActions = [
			{ surfaceId: 'srf-a', actionId: 'act-1', actionName: 'Turn Lively', reason: 'exploration stopped at 2000 states' }
		];
		const withList = await useCase(
			advisorSpy({
				modelCheck: (async () => ({ invariantViolations: [], deadActions: [], unreachedActions })) as never
			}).advisor
		).execute('project-1');
		const without = await useCase(advisorSpy().advisor).execute('project-1');

		expect(withList.engine.unreachedInteractions).toEqual(unreachedActions);
		expect('unreachedInteractions' in without.engine).toBe(false);
		// Nothing about the verdict reads the list.
		expect(withList.engine.passed).toBe(without.engine.passed);
		expect(withList.blockers).toEqual(without.blockers);
	});

	it('says so when a reading did not come back, instead of passing quietly', async () => {
		const { advisor } = advisorSpy({ modelCheck: (async () => null) as never });

		const result = await useCase(advisor).execute('project-1');

		expect(result.engine.available).toBe(true);
		expect(result.engine.degraded).toBe(true);
		expect(result.engine.incomplete).toEqual(['model check']);
		expect(result.advisories.join(' ')).toContain('model check');
	});

	it('reports a full verdict as complete', async () => {
		const { advisor } = advisorSpy();

		const result = await useCase(advisor).execute('project-1');

		expect(result.engine.degraded).toBe(false);
		expect(result.engine.incomplete).toEqual([]);
	});

	it('does not explore at all when the engine cannot see the feature', async () => {
		const modelCheck = vi.fn(async () => null);
		const { advisor } = advisorSpy({
			verify: (async () => null) as never,
			runScenarios: (async () => null) as never,
			scoreFeature: (async () => null) as never,
			modelCheck: modelCheck as never
		});

		const result = await useCase(advisor).execute('project-1');

		expect(modelCheck).not.toHaveBeenCalled();
		expect(result.engine.available).toBe(false);
		expect(result.engine.degraded).toBe(false);
	});
});

/**
 * One journey whose two stops sit on the SAME screen, the shape that made a lost
 * step script invisible: no navigation is needed, so a run with nothing to do
 * reaches the "final" screen and passes.
 */
function sameScreenJourney(actions?: SimAction[]): ProjectExperienceDraft {
	const draft = createEmptyExperienceDraft('project-1');
	draft.screens = [
		{
			id: 'scr-world',
			name: 'World',
			templateId: null,
			description: '',
			category: null,
			parentScreen: null,
			path: '/world',
			device: 'auto',
			deviceW: 1024,
			deviceH: 768
		}
	];
	const root = ensureScreenRoot(draft.builder, 'scr-world');
	const choose = createElementNode('scr-world', root, 'button');
	choose.label = 'Choose this region';
	choose.wiring.transitions.push({
		id: 't1',
		trigger: 'click',
		effect: { kind: 'setState', target: 'world.chosen', value: 'true' }
	});
	addNode(draft.builder, { ...choose, id: 'choose-region' });

	draft.journeys = [createJourney('core-world', 0, { id: 'J1', name: 'Choose a region' })];
	draft.steps = [
		createStep('J1', 0, { id: 'S1', name: 'Pick a region', linkedScreenId: 'scr-world' }),
		createStep('J1', 1, { id: 'S2', name: 'See it selected', linkedScreenId: 'scr-world' })
	];
	if (actions) draft.steps[0].actions = actions;
	return draft;
}

function useCaseOn(draft: ProjectExperienceDraft, advisor: UnspaghettitAdvisorPort) {
	const loader = <T>(value: T) => ({ execute: async () => value }) as never;
	return new VerifyExperienceUseCase(
		loader(draft),
		loader(createEmptyUsersDraft('project-1')),
		loader(createEmptyDataDraft('project-1')),
		advisor
	);
}

describe('VerifyExperienceUseCase journey honesty', () => {
	it('never lets a journey that executed nothing pass for a proven one', async () => {
		const { advisor } = advisorSpy();

		const result = await useCaseOn(sameScreenJourney(), advisor).execute('project-1');

		const journey = result.journeys[0];
		expect(journey.reachedFinal).toBe(true); // the stops share a screen, so it "arrives"
		expect(journey.actionCount).toBe(0);
		expect(journey.authoredActionCount).toBe(0);
		expect(journey.exercised).toBe(false);
		expect(result.advisories.join(' ')).toContain('"Choose a region" was verified without executing any interaction');
	});

	it('counts the interactions a step scripts, and stops warning once they run', async () => {
		const { advisor } = advisorSpy();
		const draft = sameScreenJourney([{ nodeId: 'choose-region', trigger: 'click' }]);

		const result = await useCaseOn(draft, advisor).execute('project-1');

		const journey = result.journeys[0];
		expect(journey.actionCount).toBe(1);
		expect(journey.authoredActionCount).toBe(1);
		expect(journey.exercised).toBe(true);
		expect(journey.ok).toBe(true);
		expect(result.advisories.join(' ')).not.toContain('without executing any interaction');
	});
});
