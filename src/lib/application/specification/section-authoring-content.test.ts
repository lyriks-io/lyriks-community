import { describe, expect, it } from 'vitest';
import { validateSectionContent } from './section-authoring-content';

describe('foundation stays at business altitude', () => {
	// The reported failure: a project authored from another machine came back with
	// the Business tabs full of feature rules — the first page a customer reads.
	it('rejects feature rules in every high-level business list, with the section that owns them', () => {
		const issues = validateSectionContent('foundation', {
			definition: {
				businessObjective: {
					successCriteria: [
						'40% of quotes go through the product by Q4',
						'Given an overdue invoice, when 30 days pass, then a reminder is sent'
					],
					failureCriteria: ['The user must be able to filter invoices by status']
				},
				business: {
					objectives: ['The system shall validate the invoice number format'],
					risks: ['Clicking on the Approve button marks the invoice as paid']
				},
				constraints: {
					items: [
						{ id: 'c1', theme: 'Compliance', description: 'Data stays in the EU' },
						{ id: 'c2', theme: 'Technical', description: 'Given a paid invoice, when it is exported, then a CSV is produced' }
					]
				}
			}
		});

		expect(issues.map((issue) => issue.path)).toEqual([
			'definition.businessObjective.successCriteria[1]',
			'definition.businessObjective.failureCriteria[0]',
			'definition.business.objectives[0]',
			'definition.constraints.items[1]',
			'definition.business.risks[0]'
		]);
		expect(issues[0].message).toContain('Given/When/Then');
		expect(issues[0].message).toContain('the `rules` section');
		expect(issues[1].message).toContain('the `features` section');
		expect(issues[3].message).toContain('the `rules` section');
		expect(issues[4].message).toContain('the `experience` section');
	});

	it('sees through the loose item shapes the foundation parser tolerates', () => {
		const issues = validateSectionContent('foundation', {
			definition: {
				business: { objectives: [{ text: 'The system shall retry the ERP sync' }] }
			}
		});

		expect(issues).toHaveLength(1);
		expect(issues[0].path).toBe('definition.business.objectives[0]');
	});

	it('leaves a well-authored foundation payload — and every other section — untouched', () => {
		expect(
			validateSectionContent('foundation', {
				definition: {
					businessObjective: {
						mainProblem: 'When the ERP sync fails, invoices are re-keyed by hand.',
						successCriteria: ['DSO down from 54 to 32 days within two quarters'],
						failureCriteria: ['Adoption < 10% of target after 3 months']
					},
					business: {
						objectives: ['Cut the cost of processing one invoice by half'],
						risks: ['Assumes finance teams will trust auto-approval']
					},
					constraints: {
						items: [{ id: 'c1', theme: 'Business', description: 'The vendor shall provide support within 4 business hours' }]
					}
				}
			})
		).toEqual([]);

		expect(
			validateSectionContent('rules', {
				scenarios: [{ id: 'edge-1', given: 'An overdue invoice', whenText: '30 days pass' }]
			})
		).toEqual([]);
	});
});

describe('the glossary governs words, not identifiers', () => {
	it('rejects code identifiers authored as governed terms', () => {
		const issues = validateSectionContent('glossary', {
			terms: [
				{ id: 't1', term: 'Invoice status' },
				{ id: 't2', term: 'invoiceStatus' },
				{ id: 't3', term: 'user_role' },
				{ id: 't4', term: 'MAX_RETRIES' },
				{ id: 't5', term: 'getInvoice()' }
			]
		});

		expect(issues.map((issue) => issue.path)).toEqual([
			'terms[1].term',
			'terms[2].term',
			'terms[3].term',
			'terms[4].term'
		]);
		expect(issues[0].message).toContain('camelCase');
		expect(issues[0].message).toContain('synonymsAvoid');
	});

	it('keeps real vocabulary — including product names and multi-word terms', () => {
		expect(
			validateSectionContent('glossary', {
				terms: [
					{ id: 't1', term: 'Conversation' },
					{ id: 't2', term: 'Invoice-to-cash' },
					{ id: 't3', term: 'Node.js' },
					{ id: 't4', term: 'Bon de commande' },
					{ id: 't5', term: 'SLA' }
				]
			})
		).toEqual([]);
	});
});

describe('a glossary term with nothing to name it by (criterion c7afe419)', () => {
	it('is refused naming its position, while a bare term with a word passes', () => {
		const issues = validateSectionContent('glossary', {
			terms: [{ term: 'Bookmark' }, { term: '  ' }, { id: 't3', term: '' }, { definition: 'orphan' }, { term: '!!!' }]
		});
		expect(issues.map((issue) => issue.path)).toEqual(['terms[1]', 'terms[3]', 'terms[4]']);
		expect(issues[0].message).toBe('has no id and no letter or digit in its word to make one from: give it an id, or a word');
	});

	it('says it in French on a French spec', () => {
		const [issue] = validateSectionContent('glossary', { terms: [{ term: '' }] }, 'fr');
		expect(issue.message).toContain("n'a ni id ni lettre ou chiffre");
	});
});

describe('content checks in French (spec language)', () => {
	const NB = ' ';
	it('writes the glossary verdict in French, quoting the term as it is', () => {
		const [issue] = validateSectionContent('glossary', { terms: [{ term: 'invoiceStatus' }] }, 'fr');
		expect(issue.path).toBe('terms[0].term');
		expect(issue.message).toBe(
			`«${NB}invoiceStatus${NB}» est un identifiant de code en camelCase. Le glossaire régit les mots que le produit et ses utilisateurs DISENT${NB}: écrivez le concept en toutes lettres («${NB}Statut de facture${NB}»), gardez l'identifiant dans le modèle de données et listez-le dans synonymsAvoid[] si l'équipe continue de l'employer`
		);
	});

	it('writes the Foundation altitude verdict in French', () => {
		const [issue] = validateSectionContent(
			'foundation',
			{ definition: { business: { risks: ['Clicking on the Approve button marks the invoice as paid'] } } },
			'fr'
		);
		expect(issue.message).toContain("se lit comme une règle fonctionnelle, pas comme un signal métier (elle décrit la mécanique d'un écran)");
		expect(issue.message).toContain(`La liste «${NB}Foundation › Key risks & assumptions (stored, not shown)${NB}» reste de haut niveau${NB};`);
		expect(issue.message).toContain('la section `experience` (parcours et écrans)');
	});

	it('keeps English byte-identical when no language is given', () => {
		const input = { terms: [{ term: 'USER_ROLE' }] };
		expect(validateSectionContent('glossary', input)).toEqual(validateSectionContent('glossary', input, 'en'));
	});
});
