import { describe, expect, it } from 'vitest';
import { projectTabs, type ProjectTabFacts } from './project-tabs';

const facts = (f: Partial<ProjectTabFacts>): ProjectTabFacts => ({ start: null, retro: null, retroComplementary: false, hasSpec: false, spec: null, specCount: null, evolutions: 0, ...f });

describe('projectTabs', () => {
	it('opens an existing product on its retrospecification while the specification is rebuilt', () => {
		for (const retro of ['start', 'source', 'running', 'bilan'] as const) {
			expect(projectTabs(facts({ start: 'code', retro })).tabs).toEqual(['retro']);
		}
	});

	it('swaps the retrospecification for the Specification 360° once the team opens it for validation', () => {
		expect(projectTabs(facts({ start: 'code', retro: 'review', hasSpec: true, spec: 'draft' }))).toEqual({ tabs: ['spec'], specBadge: 'draft', specProgress: null, reversed: true , laterRunOpen: false });
	});

	it('adds Evolutions once the Specification 360° is validated, the tab then wearing VALIDATED', () => {
		expect(projectTabs(facts({ retro: 'done', hasSpec: true, spec: 'validated' }))).toEqual({ tabs: ['spec', 'evolutions'], specBadge: 'validated', specProgress: null, reversed: true , laterRunOpen: false });
	});

	it('carries how far a DRAFT specification is validated, and nothing once it is VALIDATED', () => {
		const specCount = { validated: 12, total: 40 };
		expect(projectTabs(facts({ start: 'manual', hasSpec: true, spec: 'draft', specCount })).specProgress).toEqual(specCount);
		expect(projectTabs(facts({ retro: 'done', hasSpec: true, spec: 'validated', specCount })).specProgress).toBeNull();
		expect(projectTabs(facts({ start: 'code', retro: 'running', specCount })).specProgress).toBeNull();
	});

	it('puts no badge on a project with no Specification 360° tab', () => {
		expect(projectTabs(facts({ start: 'code', retro: 'running' })).specBadge).toBeNull();
	});

	it('opens a product the team describes itself on its Specification 360°', () => {
		expect(projectTabs(facts({ start: 'manual' })).tabs).toEqual(['spec']);
	});

	it('opens a product built from scratch on its Specification 360°, its evolutions once it holds a feature [criterion:ac-leaf-40bef6da]', () => {
		expect(projectTabs(facts({ start: 'scratch' }))).toEqual({ tabs: ['spec'], specBadge: 'draft', specProgress: null, reversed: false , laterRunOpen: false });
		expect(projectTabs(facts({ start: 'scratch', hasSpec: true, spec: 'draft' })).tabs).toEqual(['spec', 'evolutions']);
	});

	it('keeps the whole Specification 360° while a later run reads the product, the run shown above it [criterion:9359cb3c]', () => {
		for (const retro of ['source', 'running', 'bilan'] as const) {
			expect(projectTabs(facts({ start: 'code', retro, retroComplementary: true, hasSpec: true, spec: 'validated', evolutions: 2 }))).toEqual({
				tabs: ['retro', 'spec', 'evolutions'],
				specBadge: 'validated',
				specProgress: null,
				reversed: true,
				laterRunOpen: true
			});
		}
		expect(projectTabs(facts({ start: 'docs', retro: 'running', retroComplementary: true, hasSpec: true, spec: 'draft' })).tabs).toEqual(['retro', 'spec']);
		// Its review is held in the Specification 360°: the run's entry leaves.
		expect(projectTabs(facts({ start: 'code', retro: 'review', retroComplementary: true, hasSpec: true, spec: 'draft' })).tabs).toEqual(['spec']);
	});

	it('remembers a project had a Reverse-Specification, never one that never ran [criterion:b2f17eef]', () => {
		expect(projectTabs(facts({ retro: 'done', hasSpec: true, spec: 'validated' })).reversed).toBe(true);
		expect(projectTabs(facts({ start: 'code', retro: 'source' })).reversed).toBe(true);
		expect(projectTabs(facts({ retro: 'start', hasSpec: true, spec: 'draft' })).reversed).toBe(false);
		expect(projectTabs(facts({ start: 'manual' })).reversed).toBe(false);
	});

	it('reads a specification written without a retrospecification as open', () => {
		expect(projectTabs(facts({ retro: 'start', hasSpec: true, spec: 'draft' })).tabs).toEqual(['spec']);
	});

	it('never hides the evolutions a project already has', () => {
		expect(projectTabs(facts({ retro: 'start', hasSpec: true, spec: 'draft', evolutions: 3 })).tabs).toEqual(['spec', 'evolutions']);
		expect(projectTabs(facts({ start: 'code', retro: 'running', evolutions: 1 })).tabs).toEqual(['retro', 'evolutions']);
	});
});
