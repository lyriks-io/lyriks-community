import { describe, expect, it } from 'vitest';
import { RUN_FOUND_NOTHING, codeChangesSaid, noMismatch, noMismatchInTheCode } from './mismatch-words';

describe('Mismatch says in words whether there is a mismatch [criterion:20b41c3a]', () => {
	it('says there is none and everything is in order, and when it compares again', () => {
		expect(noMismatch('Kutt')).toEqual({
			title: 'No mismatch: everything is in order',
			text: 'The code of Kutt does what its specification says: nothing was changed in the code outside the spec and the evolutions.',
			next: 'Lyriks compares them again each time the code is synced.'
		});
	});

	it('says the code matches when only hand edits are listed', () => {
		expect(noMismatchInTheCode('Kutt').title).toBe('No mismatch in the code');
		expect(noMismatchInTheCode('Kutt').text).toContain('the next Reverse-Specification reads the code against each one');
	});

	it('says a later run that found nothing has nothing to write [criterion:87af30d2]', () => {
		expect(RUN_FOUND_NOTHING).toBe('No mismatch: this run found nothing that differs from the specification. Close this report: there is nothing to write.');
	});
});

describe('the counts of the code changes say what is expected [criterion:d10bd6a6]', () => {
	it('asks for a decision while one waits, and says where things stand once none does', () => {
		expect(codeChangesSaid({ pending: 1, accepted: 0, rejected: 0 })).toBe('1 change made in the code outside the spec and the evolutions waits for a decision: accept each one as it is, or reject it and restore the previous behaviour.');
		expect(codeChangesSaid({ pending: 3, accepted: 0, rejected: 0 })).toMatch(/^3 changes .* wait for a decision/);
		expect(codeChangesSaid({ pending: 0, accepted: 2, rejected: 1 })).toBe('Every change is decided: 2 accepted as it is, 1 waiting for the code to follow the spec.');
	});
});
