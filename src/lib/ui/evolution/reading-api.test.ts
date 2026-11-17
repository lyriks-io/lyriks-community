import { describe, expect, it } from 'vitest';
import { failureMessage } from './reading-api';

describe('a save that fails says what was not saved and why [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	it('names the act first, then the reason the server gave', () => {
		expect(failureMessage('your validation of “Request origin”', 'A viewer reads and comments.')).toBe('Your validation of “Request origin” was not saved: A viewer reads and comments.');
	});

	it('says the reason alone when the act has no name', () => {
		expect(failureMessage(undefined, 'The change failed (500).')).toBe('The change failed (500).');
	});
});
