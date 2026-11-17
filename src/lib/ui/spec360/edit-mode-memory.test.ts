import { describe, expect, it } from 'vitest';
import { EDIT_MODE_WAITS_MS, editModeStillOn } from './edit-mode-memory';

describe('the Edit mode waits for who left Knowledge (criterion 76d3a766)', () => {
	it('is off when the tab remembers nothing', () => {
		expect(editModeStillOn(null, 1000)).toBe(false);
	});

	it('is on again after a reload, the reader never having left', () => {
		expect(editModeStillOn({ leftAt: null }, 1000)).toBe(true);
	});

	it('waits five minutes, not one more', () => {
		expect(editModeStillOn({ leftAt: 1000 }, 1000 + EDIT_MODE_WAITS_MS)).toBe(true);
		expect(editModeStillOn({ leftAt: 1000 }, 1001 + EDIT_MODE_WAITS_MS)).toBe(false);
	});
});
