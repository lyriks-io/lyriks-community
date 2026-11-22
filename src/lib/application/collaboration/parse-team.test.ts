import { describe, expect, it } from 'vitest';
import { parseTeam } from './parse-team';

const member = { id: 'c1', name: 'Ana', email: 'ana@acme.io', color: 'violet', role: 'owner', seniority: 'manager', expertise: ['data'], scope: ['Cart'], joinedAt: '2026-11-01' };

describe('a team read from an untrusted payload', () => {
	it('keeps a well-formed collaborator as sent', () => {
		expect(parseTeam({ collaborators: [member] })).toEqual({ collaborators: [member] });
	});

	it('brings every closed vocabulary back into range and drops what is not text', () => {
		const [c] = parseTeam({ collaborators: [{ id: 'c1', name: 3, color: 'neon', role: 'god', seniority: 'intern', expertise: ['data', 1], scope: 'all' }] })!.collaborators;
		expect(c).toEqual({ id: 'c1', name: '', email: '', color: 'slate', role: 'contributor', seniority: 'ic', expertise: ['data'], scope: [], joinedAt: '' });
	});

	it('drops a collaborator without an id or repeating one, keeping the first', () => {
		const parsed = parseTeam({ collaborators: [{ name: 'No id' }, { ...member, id: '' }, member, { ...member, name: 'Twin' }, 'c2'] });
		expect(parsed?.collaborators.map((c) => c.name)).toEqual(['Ana']);
	});

	it('reads no team from anything but an object, and an empty team from an object without a list', () => {
		expect(parseTeam(null)).toBeNull();
		expect(parseTeam('team')).toBeNull();
		expect(parseTeam({ collaborators: 'all' })).toEqual({ collaborators: [] });
	});
});
