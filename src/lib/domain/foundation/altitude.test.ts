import { describe, expect, it } from 'vitest';
import { classifyBusinessAltitude } from './altitude';

describe('foundation business altitude', () => {
	it('accepts the business signals the page actually asks for', () => {
		const accepted = [
			'40% of quotes go through the product by Q4',
			'Adoption < 10% of target after 3 months',
			'DSO down from 54 to 32 days within two quarters',
			'Cut the cost of processing one invoice by half',
			'Data stays in the EU',
			'The vendor shall provide support within 4 business hours',
			'Uptime commitment of 99.9% with a 5% credit per 0.1% missed',
			'Assumes finance teams will trust auto-approval',
			'Users save three hours a week on invoice entry',
			'If adoption stays below 10% after two quarters we stop the programme'
		];

		for (const entry of accepted) {
			expect(classifyBusinessAltitude(entry), entry).toBeNull();
		}
	});

	it('rejects feature rules, user stories, system requirements and screen mechanics', () => {
		const rejected = [
			'Given an overdue invoice, when 30 days pass, then a reminder is sent',
			'When the invoice is approved then the ledger is updated',
			'As a finance manager, I want to bulk-approve invoices',
			'The user must be able to filter invoices by status',
			'The system shall validate the invoice number format',
			'The API must return the invoice list paginated',
			'Clicking on the Approve button marks the invoice as paid',
			'The reference must be unique across the workspace',
			'Returns a 422 when the amount is negative'
		];

		for (const entry of rejected) {
			expect(classifyBusinessAltitude(entry), entry).not.toBeNull();
		}
	});

	it('names why the entry was rejected and where it belongs', () => {
		expect(
			classifyBusinessAltitude('Given an overdue invoice, when 30 days pass, then a reminder is sent')
		).toEqual({
			reason: 'it is phrased as a Given/When/Then scenario',
			belongsTo: 'the `rules` section (Features › Rules)'
		});
		expect(classifyBusinessAltitude('As a finance manager, I want to bulk-approve invoices')?.belongsTo).toBe(
			'the `features` section (Features › Tree)'
		);
		expect(
			classifyBusinessAltitude('Clicking on the Approve button marks the invoice as paid')?.belongsTo
		).toBe('the `experience` section (journeys and screens)');
	});

	it('ignores empty entries', () => {
		expect(classifyBusinessAltitude('   ')).toBeNull();
	});
});
