import { describe, expect, it } from 'vitest';
import { parseUsersDraft } from './parse-users-draft';
import { buildUsersProjection, usersResidueFromDraft } from './projection/users-projection';

describe('parseUsersDraft — capability profiles', () => {
	it('keeps a well-formed profile and its explicit verb list', () => {
		const draft = parseUsersDraft(
			{
				capabilityProfiles: [
					{ capabilityId: 'screen:scr-1', kind: 'surface', actions: ['view', 'read', 'export'] }
				]
			},
			'p1'
		);

		expect(draft.capabilityProfiles).toEqual([
			{ capabilityId: 'screen:scr-1', kind: 'surface', actions: ['view', 'read', 'export'] }
		]);
	});

	it('drops unknown kinds, unknown verbs and duplicate rows', () => {
		const draft = parseUsersDraft(
			{
				capabilityProfiles: [
					{ capabilityId: 'cap-1', kind: 'data', actions: ['read', 'teleport'] },
					// A second profile for the same row would make its verb list ambiguous.
					{ capabilityId: 'cap-1', kind: 'surface' },
					{ capabilityId: 'cap-2', kind: 'not-a-kind' },
					{ capabilityId: '', kind: 'data' }
				]
			},
			'p1'
		);

		expect(draft.capabilityProfiles).toEqual([
			{ capabilityId: 'cap-1', kind: 'data', actions: ['read'] }
		]);
	});

	it('round-trips through the residue projection', () => {
		const draft = parseUsersDraft(
			{ capabilityProfiles: [{ capabilityId: 'feat-1', kind: 'governance' }] },
			'p1'
		);

		const restored = buildUsersProjection('p1', usersResidueFromDraft(draft));

		expect(restored.capabilityProfiles).toEqual(draft.capabilityProfiles);
	});

	it('gives a draft saved before row typing existed an empty profile list', () => {
		expect(parseUsersDraft({ roles: [] }, 'p1').capabilityProfiles).toEqual([]);
		expect(
			buildUsersProjection('p1', {
				roles: [],
				offStructureCapabilities: [],
				permissions: [],
				lastSavedAt: null
			} as unknown as Parameters<typeof buildUsersProjection>[1]).capabilityProfiles
		).toEqual([]);
	});
});
