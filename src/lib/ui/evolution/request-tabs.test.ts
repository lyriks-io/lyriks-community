import { describe, expect, it } from 'vitest';
import { REQUEST_TABS, nothingWaitsOnPeople, tabLocks, tabOfStep, tabStates } from './request-tabs';

const step = (s: string, progress: string, validated: boolean | null) => ({
	step: s,
	progress,
	validation: validated === null ? null : { validated, given: [], expected: [], gone: [] }
}) as never;

describe('the six tabs of a request page', () => {
	it('group the eight steps of the path, the Impact analysis read in two tabs', () => {
		expect(REQUEST_TABS.map((t) => t.id)).toEqual(['briefing', 'solutioning', 'specification', 'impact', 'development', 'final_report']);
		expect(REQUEST_TABS.flatMap((t) => t.steps)).toEqual([
			'need',
			'solution',
			'functional_spec',
			'technical_spec',
			'impact_analysis',
			'impact_analysis',
			'build',
			'approval',
			'deployment'
		]);
	});

	it('open the Impact analysis on what the change touches while it still owes answers', () => {
		expect(tabOfStep('need')).toBe('briefing');
		expect(tabOfStep('technical_spec')).toBe('solutioning');
		expect(tabOfStep('impact_analysis', true)).toBe('specification');
		expect(tabOfStep('impact_analysis', false)).toBe('impact');
		expect(tabOfStep('build')).toBe('development');
		expect(tabOfStep('deployment')).toBe('final_report');
	});

	it('read a tab done only when every step it groups asks nothing more', () => {
		const path = [
			step('need', 'done', true),
			step('solution', 'done', true),
			step('functional_spec', 'not_applicable', false),
			step('technical_spec', 'done', false),
			step('impact_analysis', 'todo', null),
			step('build', 'todo', null),
			step('approval', 'todo', false),
			step('deployment', 'todo', null)
		];
		const states = tabStates(path, 'impact');
		expect(states.briefing).toBe('done');
		// The Technical spec holds what it should but nobody validated it yet.
		expect(states.solutioning).toBe('ahead');
		expect(states.specification).toBe('done');
		expect(states.impact).toBe('current');
		expect(states.final_report).toBe('ahead');
	});
});

describe('a step reads ticked once it asks nothing more [criterion:ac-leaf-ac-evo-form-tab-ticked]', () => {
	const settled = [
		step('need', 'done', true),
		step('solution', 'done', true),
		step('functional_spec', 'done', true),
		step('technical_spec', 'done', true),
		step('impact_analysis', 'done', null),
		step('build', 'done', null),
		step('approval', 'done', true)
	];

	it('the Verification the request stands on stays current until the change is live', () => {
		expect(tabStates([...settled, step('deployment', 'in_progress', null)], 'final_report').final_report).toBe('current');
	});

	it('once live, every step reads done, the Verification included', () => {
		const states = tabStates([...settled, step('deployment', 'done', null)], 'final_report');
		expect(Object.values(states)).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
	});
});

describe('no tab waits for a validation before the build', () => {
	const byPerson = { filled: true, validation: 'validated', humanValidated: true };
	const facts = { current: 'briefing' as const, atImpactAnalysis: false, versionFrozen: false, codeRead: false };

	it('opens the Solution and the Specification with nothing validated', () => {
		const locks = tabLocks(facts);
		expect(locks.briefing).toBeNull();
		expect(locks.solutioning).toBeNull();
		expect(locks.specification).toBeNull();
	});

	it('opens the later steps only once the request reaches them', () => {
		expect(tabLocks(facts).impact).toMatch(/Impact analysis/);
		expect(tabLocks({ ...facts, atImpactAnalysis: true }).impact).toBeNull();
		expect(tabLocks({ ...facts, atImpactAnalysis: true }).development).toMatch(/froze a version/);
		expect(tabLocks({ ...facts, versionFrozen: true }).development).toBeNull();
		expect(tabLocks({ ...facts, versionFrozen: true }).final_report).toMatch(/code was read/);
		expect(tabLocks({ ...facts, codeRead: true }).final_report).toBeNull();
	});

	it('opens the Simulation at the Impact analysis whether or not a person validated the Specification', () => {
		expect(tabLocks({ ...facts, current: 'specification', atImpactAnalysis: true }).impact).toBeNull();
	});

	it('still reads which written answers wait on a person, an AI client validating itself aside', () => {
		const typedByAi = { filled: true, validation: 'unvalidated' };
		expect(nothingWaitsOnPeople([byPerson, typedByAi])).toBe(false);
		expect(nothingWaitsOnPeople([byPerson, { filled: true, validation: 'validated', humanValidated: false }])).toBe(false);
		expect(nothingWaitsOnPeople([byPerson, { filled: false }])).toBe(true);
		expect(nothingWaitsOnPeople([])).toBe(true);
	});

	it('reads the Impact analysis at the Specification while it waits for a person', () => {
		expect(tabOfStep('impact_analysis', true)).toBe('specification');
	});

	it('always opens what the request already stands at or went past', () => {
		const locks = tabLocks({ ...facts, current: 'development', atImpactAnalysis: true, versionFrozen: true });
		expect(locks.solutioning).toBeNull();
		expect(locks.specification).toBeNull();
		expect(locks.development).toBeNull();
	});
});
