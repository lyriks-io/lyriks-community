import { describe, expect, it } from 'vitest';
import type { GraphNode } from './graph';
import { ruleSearchEntries, specSearchEntries } from './spec-search';

const node = (id: string, kind: GraphNode['kind'], label: string, context: GraphNode['context'] = 'features'): GraphNode => ({ id, kind, label, context });

describe('spec search', () => {
	it('opens cores and features on their Specification 360° page, a feature named after its core', () => {
		const graph = {
			nodes: [node('core:inv', 'core', 'Invoicing'), node('family:iss', 'family', 'Issuance'), node('feature:create', 'feature', 'Create an invoice')],
			edges: [
				{ id: 'e1', from: 'core:inv', to: 'family:iss', kind: 'contains' as const },
				{ id: 'e2', from: 'family:iss', to: 'feature:create', kind: 'contains' as const }
			]
		};
		expect(specSearchEntries('fac', graph, [])).toEqual([
			{ t: 'Invoicing', k: 'Feature', href: '/projects/fac/spec/features/inv' },
			{ t: 'Create an invoice', k: 'Invoicing', href: '/projects/fac/spec/features/create' }
		]);
	});

	it('sends roles, journeys, data, tech and terms to their page, and leaves the finer grains out', () => {
		const graph = {
			nodes: [
				node('role:acc', 'role', 'Accountant', 'users'),
				node('journey:j1', 'journey', 'Create and send an invoice', 'experience'),
				node('element:e1', 'element', 'Save button', 'experience'),
				node('entity:inv', 'entity', 'Invoice', 'data'),
				node('field:f1', 'field', 'number', 'data'),
				node('gap:g1', 'gap', 'Missing rule', 'coherence')
			],
			edges: []
		};
		expect(specSearchEntries('fac', graph, [{ id: 't1', term: 'Credit note' }]).map((e) => `${e.t} > ${e.href}`)).toEqual([
			'Accountant > /projects/fac/spec/users',
			'Create and send an invoice > /projects/fac/spec/experience',
			'Invoice > /projects/fac/spec/tech/data-map',
			'Credit note > /projects/fac/spec/glossary?term=t1'
		]);
	});

	it('finds a rule by its sentence and its reason, opening its feature on the action that holds it [criterion:e11bf80b]', () => {
		const rules = [
			{ featureId: 'f-short', featureName: 'Shorten a link', actionName: 'Create a link', ruleId: 'r1', sentence: 'When the URL is empty, the system shall refuse to create the link.', reason: 'An empty link leads nowhere.' },
			{ featureId: 'f-short', featureName: 'Shorten a link', actionName: 'Create a link', ruleId: 'r2', sentence: 'The system shall always allow a link.', reason: 'The system shall always allow a link.' },
			{ featureId: 'f-short', featureName: 'Shorten a link', actionName: 'Create a link', ruleId: 'r3', sentence: '  ', reason: '' }
		];
		expect(ruleSearchEntries('kutt', rules)).toEqual([
			{
				t: 'When the URL is empty, the system shall refuse to create the link.',
				k: 'Rule',
				href: '/projects/kutt/spec/features/f-short#kbt-rule_f-short_r1',
				at: 'Shorten a link · Create a link',
				body: 'An empty link leads nowhere.'
			},
			// A reason that only repeats the sentence adds nothing to search.
			{ t: 'The system shall always allow a link.', k: 'Rule', href: '/projects/kutt/spec/features/f-short#kbt-rule_f-short_r2', at: 'Shorten a link · Create a link' }
		]);
	});
});

