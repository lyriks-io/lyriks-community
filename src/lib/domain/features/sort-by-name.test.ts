import { describe, expect, it } from 'vitest';
import { readableName, sortByName } from '.';

const named = (...names: string[]) => names.map((name) => ({ name }));
const names = (items: { name: string }[]) => items.map((i) => i.name);

describe('sortByName (criterion 7b327ca1)', () => {

	it('sorts actions by the name they read in, not the stored identifier', () => {
		// Stored, `_cancel_booking` would come first; it reads "Cancel Booking".
		const actions = named('searchRooms', '_cancel_booking', 'Book a room');
		expect(names(sortByName(actions, (a) => readableName(a.name)))).toEqual([
			'Book a room',
			'_cancel_booking',
			'searchRooms'
		]);
	});
});
