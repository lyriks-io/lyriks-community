import { describe, expect, it } from 'vitest';
import { readableName, sortByName } from '.';

const named = (...names: string[]) => names.map((name) => ({ name }));
const names = (items: { name: string }[]) => items.map((i) => i.name);

describe('sortByName (criterion 7b327ca1)', () => {
	it('reads A to Z whatever the order rows were added in', () => {
		expect(names(sortByName(named('Search', 'Billing', 'Onboarding')))).toEqual([
			'Billing',
			'Onboarding',
			'Search'
		]);
	});

	it('ignores case and accents', () => {
		expect(names(sortByName(named('zones', 'Étapes', 'billing', 'Accounts')))).toEqual([
			'Accounts',
			'billing',
			'Étapes',
			'zones'
		]);
	});

	it('reads numbers as numbers', () => {
		expect(names(sortByName(named('Feature 10', 'Feature 2', 'Feature 1')))).toEqual([
			'Feature 1',
			'Feature 2',
			'Feature 10'
		]);
	});

	it('sorts actions by the name they read in, not the stored identifier', () => {
		// Stored, `_cancel_booking` would come first; it reads "Cancel Booking".
		const actions = named('searchRooms', '_cancel_booking', 'Book a room');
		expect(names(sortByName(actions, (a) => readableName(a.name)))).toEqual([
			'Book a room',
			'_cancel_booking',
			'searchRooms'
		]);
	});

	it('leaves the list it was given in its own order', () => {
		const stored = named('b', 'a');
		sortByName(stored);
		expect(names(stored)).toEqual(['b', 'a']);
	});
});
