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
					contractualConstraints: ['Data stays in the EU'],
					risks: ['Clicking on the Approve button marks the invoice as paid']
				}
			}
		});

		expect(issues.map((issue) => issue.path)).toEqual([
			'definition.businessObjective.successCriteria[1]',
			'definition.businessObjective.failureCriteria[0]',
			'definition.business.objectives[0]',
			'definition.business.risks[0]'
		]);
		expect(issues[0].message).toContain('Given/When/Then');
		expect(issues[0].message).toContain('the `rules` section');
		expect(issues[1].message).toContain('the `features` section');
		expect(issues[3].message).toContain('the `experience` section');
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
						contractualConstraints: ['The vendor shall provide support within 4 business hours'],
						risks: ['Assumes finance teams will trust auto-approval']
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
