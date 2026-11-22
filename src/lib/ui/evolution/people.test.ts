import { describe, expect, it } from 'vitest';
import { personName } from './people';

/** A person as a request page names them: their roster name, never a raw id. */
describe('a person named on a request page', () => {
	const roster = [{ id: 'ana@example.test', name: 'Ana Diaz' }, { id: 'local-operator', name: 'Sam (this box)' }];

	it('reads the roster name', () => {
		expect(personName('ana@example.test', roster)).toBe('Ana Diaz');
	});

	it('reads the one operator of a box without sign-in as Local operator, unless the app gave them a name', () => {
		expect(personName('local-operator')).toBe('Local operator');
		expect(personName('local-operator', roster)).toBe('Sam (this box)');
	});

	it('falls back to the id of someone the roster does not hold', () => {
		expect(personName('bob@example.test', roster)).toBe('bob@example.test');
	});
});
