import { describe, expect, it } from 'vitest';
import { legacyFeatureId, legacyPageTarget, type LegacyPage } from './legacy-addresses';

const to = (page: LegacyPage, query = '', knownFeature = false) => legacyPageTarget('p-1', page, new URLSearchParams(query), knownFeature);

describe('an old address of a project page (criterion 84162c34)', () => {
	it('opens the Overview for Foundation and the pages folded into it, Requirements for its requirements tabs', () => {
		for (const page of ['foundation', 'initialization', 'framing', 'scope'] as const) expect(to(page)).toBe('/projects/p-1/spec');
		expect(to('foundation', 'tab=brief')).toBe('/projects/p-1/spec');
		expect(to('foundation', 'tab=security')).toBe('/projects/p-1/spec/tech/requirements');
	});

	it('opens Features, or the page of the feature it named while the specification holds it', () => {
		for (const page of ['features', 'functional', 'rules', 'reuse'] as const) expect(to(page)).toBe('/projects/p-1/spec/features');
		expect(to('features', 'leaf=f%2F1', true)).toBe('/projects/p-1/spec/features/f%2F1');
		expect(to('features', 'tab=tree&feature=core-1&node=core-1', true)).toBe('/projects/p-1/spec/features/core-1');
		expect(to('features', 'feature=gone', false)).toBe('/projects/p-1/spec/features');
	});

	it('opens Changes for the Evolution tab and the retired Roadmap tab of the old Features', () => {
		expect(to('features', 'tab=roadmap')).toBe('/projects/p-1/evolution');
		expect(to('features', 'tab=evolution')).toBe('/projects/p-1/evolution');
		expect(to('features', 'tab=evolution&request=req-9&at=proposal__x')).toBe('/projects/p-1/evolution?request=req-9&at=proposal__x');
	});

	it('opens Users, and Who can do what for the permissions', () => {
		expect(to('users')).toBe('/projects/p-1/spec/users');
		expect(to('users', 'tab=permissions')).toBe('/projects/p-1/spec/users/matrix');
		expect(to('permissions')).toBe('/projects/p-1/spec/users/matrix');
	});

	it('opens the views of Technology & data for Infrastructure and Data', () => {
		expect(to('infrastructure')).toBe('/projects/p-1/spec/tech/data-map');
		expect(to('data', 'node=x')).toBe('/projects/p-1/spec/tech/data-map');
		expect(to('infrastructure', 'tab=map&database=db-1')).toBe('/projects/p-1/spec/tech/data-map?database=db-1');
		expect(to('infrastructure', 'tab=requirements')).toBe('/projects/p-1/spec/tech/requirements');
		expect(to('infrastructure', 'tab=stack')).toBe('/projects/p-1/spec/tech/architecture');
	});

	it('opens Experience, Sources and the Glossary, keeping what those pages read', () => {
		expect(to('experience', 'tab=screens&screen=s-1')).toBe('/projects/p-1/spec/experience');
		expect(to('documents', 'source=src-1&from=%2Fprojects%2Fp-1%2Fspec&kind=x')).toBe('/projects/p-1/spec/tech/sources?source=src-1&from=%2Fprojects%2Fp-1%2Fspec');
		expect(to('glossary', 'term=t-1')).toBe('/projects/p-1/spec/glossary?term=t-1');
	});

	it('opens what the retired Traceability, Generate specs and Kickoff held where it lives now (rules b995ffb1, 20f14192, 8bc8522a, 32a16816, 3dfded38)', () => {
		expect(to('approvals', '')).toBe('/projects/p-1/spec#kb-scope');
		expect(to('baselines', '')).toBe('/projects/p-1/spec');
		expect(to('traceability', 'tab=approvals')).toBe('/projects/p-1/spec#kb-scope');
		expect(to('traceability', 'tab=baselines')).toBe('/projects/p-1/spec');
		expect(to('traceability', '')).toBe('/projects/p-1/spec/features');
		expect(to('generate', '')).toBe('/projects/p-1/spec/noticed');
		expect(to('kickoff', '')).toBe('/projects/p-1/retrospec');
	});

	it('names the feature an old Features address pointed at', () => {
		expect(legacyFeatureId(new URLSearchParams('leaf=l-1'))).toBe('l-1');
		expect(legacyFeatureId(new URLSearchParams('feature=f-1&leaf=l-1'))).toBe('f-1');
		expect(legacyFeatureId(new URLSearchParams('tab=behavior&node=f-1'))).toBeNull();
	});
});
