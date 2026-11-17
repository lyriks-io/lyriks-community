import { describe, expect, it } from 'vitest';
import { createEmptyUsersDraft } from '$domain/users';
import { buildUsersProjection, usersResidueFromDraft } from './users-projection';

describe('users projection [criterion:b1242208]', () => {
	const dismissal = {
		key: 'site manager',
		name: 'Site manager',
		rationale: 'Typed as an affected persona in the Foundation.',
		dismissedAt: '2026-10-15T12:00:00.000Z',
		dismissedBy: 'a@x.io'
	};

	it('keeps the dismissal history across a save and a reload', () => {
		const draft = { ...createEmptyUsersDraft('p1'), dismissedSuggestions: [dismissal] };
		const reloaded = buildUsersProjection('p1', usersResidueFromDraft(draft));
		expect(reloaded.dismissedSuggestions).toEqual([dismissal]);
	});

	it('reads a section saved before dismissals were kept as dismissing nothing', () => {
		const { dismissedSuggestions: _, ...older } = usersResidueFromDraft(createEmptyUsersDraft('p1'));
		const reloaded = buildUsersProjection('p1', older as never);
		expect(reloaded.dismissedSuggestions).toEqual([]);
	});

	it('keeps an older bare-name dismissal as a decision with no date or author', () => {
		const older = { ...usersResidueFromDraft(createEmptyUsersDraft('p1')), dismissedSuggestions: ['site manager'] };
		const reloaded = buildUsersProjection('p1', older as never);
		expect(reloaded.dismissedSuggestions).toEqual([
			{ key: 'site manager', name: 'site manager', rationale: '', dismissedAt: null, dismissedBy: null }
		]);
	});
});

describe('a Users section stored with verbs is read as accesses [criterion:8554bd0d]', () => {
	const stored = {
		...usersResidueFromDraft(createEmptyUsersDraft('p1')),
		permissions: [
			{ roleId: 'member', capabilityId: 'action:f1:a1', capabilitySource: 'feature', action: 'create' },
			{ roleId: 'member', capabilityId: 'action:f1:a1', capabilitySource: 'feature', action: 'read' },
			{ roleId: 'member', capabilityId: 'action:f1:a1', capabilitySource: 'feature', action: 'delete' },
			{ roleId: 'admin', capabilityId: 'action:f1:a1', capabilitySource: 'feature', action: 'update' }
		],
		capabilityProfiles: [{ capabilityId: 'action:f1:a1', kind: 'data', actions: ['read'] }]
	};

	it('folds the lines of one role and one capability into one access, with no migration', () => {
		const read = buildUsersProjection('p1', stored as never);
		expect(read.permissions).toEqual([
			{ roleId: 'member', capabilityId: 'action:f1:a1', capabilitySource: 'feature' },
			{ roleId: 'admin', capabilityId: 'action:f1:a1', capabilitySource: 'feature' }
		]);
		expect('capabilityProfiles' in read).toBe(false);
	});

	it('writes the section back folded at its next save', () => {
		const draft = { ...createEmptyUsersDraft('p1'), permissions: stored.permissions as never };
		expect(usersResidueFromDraft(draft).permissions).toHaveLength(2);
	});
});
