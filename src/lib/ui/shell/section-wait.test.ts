import { describe, expect, it } from 'vitest';
import { projectTabs, type ProjectTabFacts } from '$domain/portfolio/project-tabs';
import { sectionWait } from './section-wait';

const facts = (over: Partial<ProjectTabFacts>): ProjectTabFacts => ({
	start: null,
	retro: null,
	retroComplementary: false,
	hasSpec: false,
	spec: null,
	specCount: null,
	evolutions: 0,
	...over
});

describe('a section with nothing to show yet says why, and the one step that fills it [criterion:6213ef4c]', () => {
	it('sends a project with nothing yet to get started, from Knowledge, Health, Changes and Mismatch alike', () => {
		const tabs = projectTabs(facts({}));
		expect(sectionWait('knowledge', tabs, 'p')).toEqual({
			lines: ["No knowledge yet. A Reverse-Specification writes it from the product's code, or the team describes the product itself."],
			step: { label: 'Get started', href: '/projects/p' }
		});
		expect(sectionWait('notices', tabs, 'p')?.step.label).toBe('Get started');
		expect(sectionWait('changes', tabs, 'p')).toEqual({
			lines: ['A change starts from the validated knowledge of the product.', 'There is no knowledge yet.'],
			step: { label: 'Get started', href: '/projects/p' }
		});
		expect(sectionWait('mismatch', tabs, 'p')?.lines[0]).toBe('Mismatch compares the code with the validated knowledge of the product.');
	});

	it('sends Knowledge to the run while the first Reverse-Specification writes it', () => {
		const tabs = projectTabs(facts({ retro: 'running' }));
		expect(sectionWait('knowledge', tabs, 'p')).toEqual({
			lines: ['No knowledge yet. The Reverse-Specification under way writes it; it opens here once its analysis is ready to review.'],
			step: { label: 'Open the run', href: '/projects/p/retrospec' }
		});
	});

	it('says how far a draft knowledge went, and opens Knowledge, from Changes and Mismatch', () => {
		const tabs = projectTabs(facts({ retro: 'review', hasSpec: true, spec: 'draft', specCount: { validated: 25, total: 512 } }));
		expect(sectionWait('knowledge', tabs, 'p')).toBeNull();
		expect(sectionWait('notices', tabs, 'p')).toBeNull();
		expect(sectionWait('changes', tabs, 'p')).toEqual({
			lines: ['A change starts from the validated knowledge of the product.', '25 of 512 elements validated so far.'],
			step: { label: 'Open Knowledge', href: '/projects/p/spec' }
		});
		expect(sectionWait('mismatch', tabs, 'p')?.lines[1]).toBe('25 of 512 elements validated so far.');
	});

	it('opens every section of a validated knowledge, and Changes of a project that already has evolutions', () => {
		const validated = projectTabs(facts({ retro: 'done', hasSpec: true, spec: 'validated' }));
		for (const s of ['knowledge', 'notices', 'changes', 'mismatch'] as const) expect(sectionWait(s, validated, 'p'), s).toBeNull();
		expect(sectionWait('changes', projectTabs(facts({ hasSpec: true, spec: 'draft', evolutions: 2 })), 'p')).toBeNull();
	});

	it('shows the page as it is when what the project holds is not known', () => {
		expect(sectionWait('changes', null, 'p')).toBeNull();
	});
});

describe('Mismatch holds the report of a later Reverse-Specification [criterion:f61f8c94]', () => {
	const later = (retro: ProjectTabFacts['retro'], spec: ProjectTabFacts['spec'] = 'draft') => projectTabs(facts({ retro, retroComplementary: true, hasSpec: true, spec }));

	it('opens while a later run is not validated, whatever the validation of the specification', () => {
		for (const stage of ['source', 'running', 'bilan', 'review'] as const) expect(sectionWait('mismatch', later(stage), 'p'), stage).toBeNull();
	});

	it('still waits for a validated specification on a first run', () => {
		const first = projectTabs(facts({ retro: 'review', hasSpec: true, spec: 'draft' }));
		expect(first.laterRunOpen).toBe(false);
		expect(sectionWait('mismatch', first, 'p')?.lines[0]).toBe('Mismatch compares the code with the validated knowledge of the product.');
	});

	it('leaves the report once the run is validated', () => {
		expect(later('done', 'validated').laterRunOpen).toBe(false);
	});
});
