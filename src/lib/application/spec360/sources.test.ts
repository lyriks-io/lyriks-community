import { describe, expect, it } from 'vitest';
import { codePlacesByAnchor, specSources, type SpecSourcesInput } from './sources';

const input: SpecSourcesInput = {
	features: {
		features: [
			{ id: 'feat-shorten', name: 'Shorten a link' },
			{ id: 'feat-stats', name: 'See a link’s statistics' }
		],
		leafMeta: { 'feat-shorten': { sourceIds: ['src-routes', 'src-handler', 'src-routes'] } }
	},
	identity: { sourceIds: ['src-about', 'src-docs-site'] },
	roles: [{ id: 'visitor', name: 'Visitor', sourceIds: ['src-handler'] }],
	terms: [{ id: 'short-link', term: 'Short link', sourceIds: ['src-view'] }],
	definition: { businessObjective: { sourceIds: ['src-readme'] }, market: { sourceIds: ['src-env'] }, security: { sourceIds: ['src-auth'] }, technical: { sourceIds: [] } },
	architecture: {
		sourceIds: ['src-repo'],
		techChoices: [
			{ id: 'tc-express', name: 'Express', referenceDocId: 'src-package' },
			{ id: 'tc-redis', name: 'Redis', referenceDocId: null }
		]
	},
	tables: [
		{ id: 'users', name: 'Users', sourceIds: ['src-model-user', 'src-migration'] },
		{ id: 'links', name: 'Links', sourceIds: ['src-model-link', 'src-migration'] },
		{ id: 'ips', name: 'IPs' }
	],
	coverage: {
		'feat-shorten': {
			featureId: 'feat-shorten',
			found: 3,
			expected: 4,
			percent: 75,
			updatedAt: null,
			specUpdatedAt: null,
			actions: {
				a1: {
					found: 3,
					expected: 4,
					percent: 75,
					elements: [
						{ kind: 'action', id: 'a1', name: 'Shorten a link', location: { file: 'server/handlers/links.handler.js', line: 99 } },
						{ kind: 'rule', id: 'r1', name: 'Only accounts may shorten', location: { file: 'server/handlers/links.handler.js', line: 112 } },
						{ kind: 'rule', id: 'r2', name: 'Not located yet', location: null },
						{ kind: 'invariant', id: 'i1', name: 'A banned account loses every right', location: { file: 'server/handlers/auth.handler.js', line: null } },
						{ kind: 'event', id: 'e1', name: 'link.created', location: { file: 'server/handlers/links.handler.js', line: 135 } }
					]
				}
			}
		}
	}
};

describe('a block of the Specification 360° shows what it rests on [criterion:b0ea9889]', () => {
	const sources = specSources('kutt', input);
	const places = codePlacesByAnchor(input.coverage);

	it('gives each block the sources its element cites, once each, and none to a block that cites nothing', () => {
		expect(sources.byAnchor['feature:feat-shorten']).toEqual(['src-routes', 'src-handler']);
		expect(sources.byAnchor['role:visitor']).toEqual(['src-handler']);
		expect(sources.byAnchor['term:short-link']).toEqual(['src-view']);
		expect(sources.byAnchor['feature:feat-stats']).toBeUndefined();
	});

	it('reads the problem and the target from the business objective, a group of requirements from the sections it reads', () => {
		expect(sources.byAnchor.problem).toEqual(['src-readme']);
		expect(sources.byAnchor.target).toEqual(['src-readme']);
		expect(sources.byAnchor['requirements:compliance']).toEqual(['src-env', 'src-auth']);
		expect(sources.byAnchor['requirements:runtime']).toBeUndefined();
	});

	it('names, for each source, every block that cites it, each a link to where it stands', () => {
		expect(sources.citedBy['src-handler']).toEqual([
			{ anchor: 'feature:feat-shorten', label: 'Feature · Shorten a link', href: '/projects/kutt/spec/features/feat-shorten#kbt-feature_feat-shorten' },
			{ anchor: 'role:visitor', label: 'User · Visitor', href: '/projects/kutt/spec/users/visitor#kbt-role_visitor' }
		]);
		expect(sources.citedBy['src-readme'].map((c) => c.href)).toEqual(['/projects/kutt/spec#kbt-problem', '/projects/kutt/spec#kbt-target']);
	});

	it('gives a technical choice the documentation it cites, nothing to one that cites none', () => {
		expect(sources.byAnchor['stack:tc-express']).toEqual(['src-package']);
		expect(sources.byAnchor['stack:tc-redis']).toBeUndefined();
		expect(sources.citedBy['src-package']).toEqual([{ anchor: 'stack:tc-express', label: 'Architecture · Express', href: '/projects/kutt/spec/tech/architecture#kbt-stack_tc-express' }]);
	});

	it('gives an action and a rule the places in the code they were located at, a rule of the whole product its own', () => {
		expect(sources.codeCounts['action:feat-shorten:a1']).toBe(places['action:feat-shorten:a1']?.length);
		expect(places['action:feat-shorten:a1']).toEqual([
			{ featureId: 'feat-shorten', kind: 'Action', name: 'Shorten a link', place: 'server/handlers/links.handler.js:99', file: 'server/handlers/links.handler.js', line: 99, elementId: 'a1' }
		]);
		expect(places['rule:feat-shorten:r1']?.map((p) => p.place)).toEqual(['server/handlers/links.handler.js:112']);
		expect(places['rule:project:i1']?.map((p) => p.place)).toEqual(['server/handlers/auth.handler.js']);
		// Not located, or no block of its own on the page: nothing is shown for it.
		expect(places['rule:feat-shorten:r2']).toBeUndefined();
		expect(Object.keys(places).some((a) => a.includes('e1'))).toBe(false);
	});

	it('gives the data map what its tables cite, each table named with its own, a citer opening the map on it [criterion:3918b2ea]', () => {
		expect(sources.byAnchor.datamap).toEqual(['src-model-user', 'src-migration', 'src-model-link']);
		expect(sources.groupsByAnchor.datamap).toEqual([
			{ id: 'links', label: 'Links', sourceIds: ['src-model-link', 'src-migration'] },
			{ id: 'users', label: 'Users', sourceIds: ['src-model-user', 'src-migration'] }
		]);
		expect(sources.citedBy['src-model-user']).toEqual([{ anchor: 'datamap:users', label: 'Table · Users', href: '/projects/kutt/spec/tech/data-map?table=users#kbt-datamap' }]);
		expect(sources.citedBy['src-migration'].map((c) => c.label)).toEqual(['Table · Links', 'Table · Users']);
		expect(sources.groupsByAnchor['feature:feat-shorten']).toBeUndefined();
	});

	it('names the architecture among the citers, with no block of its own to carry an icon', () => {
		expect(sources.citedBy['src-repo']).toEqual([{ anchor: 'stack', label: 'Architecture', href: '/projects/kutt/spec/tech/architecture' }]);
		expect(sources.byAnchor.stack).toBeUndefined();
	});

	it('cites the sources the product summary was written from on its block [criterion:ac-leaf-ac-brief-identity-sources]', () => {
		const sources = specSources('kutt', input);
		expect(sources.byAnchor.product).toEqual(['src-about', 'src-docs-site']);
		expect(sources.citedBy['src-about']).toEqual([{ anchor: 'product', label: 'Product summary', href: '/projects/kutt/spec#kbt-product' }]);
		expect(specSources('kutt', { ...input, identity: { sourceIds: [] } }).byAnchor.product).toBeUndefined();
	});

	it('cites the sources of the branding and of each journey on their blocks [criterion:ac-leaf-ac-brand-sources] [criterion:ac-leaf-ac-journey-sources]', () => {
		const sources = specSources('kutt', {
			...input,
			experience: { brand: { sourceIds: ['src-styles'] }, journeys: [{ id: 'j-shorten', name: 'Shorten a link', sourceIds: ['src-view-shortener', 'src-links-handler'] }, { id: 'j-none', name: 'Read the terms' }] }
		});
		expect(sources.byAnchor.branding).toEqual(['src-styles']);
		expect(sources.byAnchor['journey:j-shorten']).toEqual(['src-view-shortener', 'src-links-handler']);
		expect(sources.byAnchor['journey:j-none']).toBeUndefined();
		expect(sources.citedBy['src-styles'].map((c) => c.label)).toEqual(['Branding']);
	});
});
