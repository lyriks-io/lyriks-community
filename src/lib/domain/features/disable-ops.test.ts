import { describe, expect, it } from 'vitest';
import { stampDisableOps, touchesDisabling, validatedSpecRefusal } from './disable-ops';

const disable = { kind: 'disable_element', elementId: 'r1', reason: 'Testing', by: 'a client says so' };
const enable = { kind: 'enable_element', elementId: 'r1' };
const other = { kind: 'add_action_rule', actionId: 'a' };

describe('the operations that disable and enable an element', () => {
	it('are recognised among the others', () => {
		expect(touchesDisabling([other])).toBe(false);
		expect(touchesDisabling([other, enable])).toBe(true);
	});

	it('go through a change request once the specification is validated definitively [criterion:ac-leaf-975c851b-f554-47e6-bb43-8840d6845d20] [rule:840b0846] [rule:dc50bf71]', () => {
		expect(validatedSpecRefusal([disable], true)).toBe('The specification is validated: disable it through a change request.');
		expect(validatedSpecRefusal([enable], true)).toBe('The specification is validated: enable it through a change request.');
		expect(validatedSpecRefusal([disable], false)).toBeNull();
		expect(validatedSpecRefusal([other], true)).toBeNull();
	});

	it('are stamped with the person signed in, never with what a client claims', () => {
		expect(stampDisableOps([disable, enable, other], 'Sam', '2026-11-18T10:00:00.000Z')).toEqual([
			{ ...disable, by: 'Sam', at: '2026-11-18T10:00:00.000Z' },
			enable,
			other
		]);
	});
});
