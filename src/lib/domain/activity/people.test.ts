import { describe, expect, it } from 'vitest';
import { actorName, personColor, personLook, shortName } from './people';

const roster = [{ id: 'carmen@x.io', name: 'Carmen Roux' }];

describe('activity people', () => {
	it('shortens a full name to the first name and the last initial', () => {
		expect(shortName('Carmen Roux')).toBe('Carmen R.');
		expect(shortName('Jean Pierre de la Tour')).toBe('Jean T.');
		expect(shortName('Léa')).toBe('Léa');
	});

	it('gives a person the same colour every time', () => {
		expect(personColor('carmen@x.io')).toBe(personColor('carmen@x.io'));
	});

	it('names a person from the roster, else from their email', () => {
		expect(personLook('carmen@x.io', roster)).toMatchObject({ name: 'Carmen R.', initials: 'CR' });
		expect(personLook('jane.doe@x.io', roster).name).toBe('Jane D.');
	});

	it('says Lyriks for the reader\'s own AI and names the owner of another one [criterion:ccaa0784]', () => {
		expect(actorName({ id: 'me@x.io', kind: 'ai' }, 'me@x.io', roster)).toBe('Lyriks');
		expect(actorName({ id: 'carmen@x.io', kind: 'ai' }, 'me@x.io', roster)).toBe('Lyriks for Carmen R.');
		expect(actorName({ id: 'carmen@x.io', kind: 'person' }, 'me@x.io', roster)).toBe('Carmen R.');
		expect(actorName({ id: '', kind: 'lyriks' }, 'me@x.io', roster)).toBe('Lyriks');
	});
});
