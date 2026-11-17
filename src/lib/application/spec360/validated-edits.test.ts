import { describe, expect, it } from 'vitest';
import { validatedSpecRefusal } from './validated-edits';

describe('editing a validated Specification 360° waits for Code drift [criterion:9b3e04e1]', () => {
	it('refuses an edit, an add, a delete or a tick on a validated specification', () => {
		for (const op of ['edit', 'add_user', 'add_core', 'tick_permission', 'delete'])
			expect(validatedSpecRefusal(true, op)).toBe('The specification is validated: change it through an evolution.');
	});

	it('keeps decisions on noticed points, the operations target and cancelling an earlier hand edit open', () => {
		for (const op of ['keep_finding', 'reopen_finding', 'set_operations_target', 'cancel_hand_edit']) expect(validatedSpecRefusal(true, op)).toBeNull();
	});

	it('changes nothing on a draft', () => {
		expect(validatedSpecRefusal(false, 'edit')).toBeNull();
		expect(validatedSpecRefusal(false, 'delete')).toBeNull();
	});
});
