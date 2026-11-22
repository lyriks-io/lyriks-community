import { describe, expect, it } from 'vitest';
import { editModeStillOn } from './edit-mode-memory';

// The five minutes it waits are proved on EditMode itself (edit-mode.svelte.test.ts).
describe('the Edit mode waits for who left Knowledge (criterion 76d3a766)', () => {
	it('is off when the tab remembers nothing', () => {
		expect(editModeStillOn(null, 1000)).toBe(false);
	});

	it('is on again after a reload, the reader never having left', () => {
		expect(editModeStillOn({ leftAt: null }, 1000)).toBe(true);
	});
});
