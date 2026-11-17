import { describe, expect, it } from 'vitest';
import { personaMentions } from './persona-mentions';

describe('personaMentions [criterion:98d98033]', () => {
	it('offers nothing when the project names nobody (no generic starter list)', () => {
		expect(personaMentions([{ where: 'brief', text: 'A fast way to track invoices.' }])).toEqual([]);
		expect(personaMentions([])).toEqual([]);
	});

	it('reads the people the brief names, quoting where each came from', () => {
		const out = personaMentions([
			{
				where: 'brief',
				text: 'Restaurant owners publish menus. Delivery drivers pick up orders. Support agents handle refunds.'
			}
		]);
		expect(out.map((s) => [s.name, s.userClass])).toEqual([
			['Restaurant Owner', 'end-user'],
			['Driver', 'end-user'],
			['Support Agent', 'back-office']
		]);
		expect(out[1].rationale).toBe('Named in the brief: "Delivery drivers pick up orders."');
	});

	it('ignores vague person words without a qualifier', () => {
		expect(personaMentions([{ where: 'brief', text: 'Our users and the team love it.' }])).toEqual([]);
	});

	it('reads French text and dedupes across passages', () => {
		const out = personaMentions([
			{ where: 'brief', text: 'Les patients prennent rendez-vous avec leur médecin.' },
			{ where: 'pain point', text: 'Les patients attendent trop longtemps.' }
		]);
		expect(out.map((s) => s.name)).toEqual(['Patient', 'Doctor']);
	});

	it('offers a persona the author typed as written', () => {
		const out = personaMentions([{ where: 'affected persona', text: 'Night-shift nurse' }]);
		expect(out).toEqual([
			{ name: 'Night-shift nurse', rationale: 'Typed as an affected persona in the Foundation.', userClass: 'end-user' }
		]);
	});

	it('offers an identifier typed as a persona under a readable name [criterion:6b26cc3b]', () => {
		const out = personaMentions([
			{ where: 'affected persona', text: 'site_manager' },
			{ where: 'affected persona', text: 'office__manager ' }
		]);
		expect(out.map((s) => s.name)).toEqual(['Site manager', 'Office manager']);
	});
});
