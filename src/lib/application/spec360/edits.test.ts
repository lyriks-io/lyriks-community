import { describe, expect, it } from 'vitest';
import { createEmptyUsersDraft } from '$domain/users';
import { createEmptyFeaturesDraft } from '$domain/features';
import { parseSpecEdit } from '../specification/parse-spec-edit';
import { createEmptyDataDraft, createEntity, type ProjectDataDraft } from '$domain/data';
import { NEW_CORE_NAME, NEW_FEATURE_NAME, NEW_USER_NAME, addCore, addFeature, addUser, addedLast, editData, editShapeOf, editedFields, isProposedId, validatedElementOf } from './edits';

const ID = '4b8f2c1e-6a3d-4e2b-9c7f-1a2b3c4d5e6f';

describe('an edit shown before the server answers', () => {
	it('reads as the section will: a blank title keeps the old one, the description trimmed, tags once', () => {
		expect(editedFields({ text: 'Invoice', desc: 'Old', tags: ['Bill'] }, { text: '  ', desc: ' A bill. ', tags: ['Bill', ' Bill ', '', 'Note'] })).toEqual({
			text: 'Invoice',
			desc: 'A bill.',
			tags: ['Bill', 'Note']
		});
	});

	it('keeps what the edit does not carry', () => {
		expect(editedFields({ text: 'Problem', tags: ['Slow'] }, { text: 'New problem' })).toEqual({ text: 'New problem', desc: '', tags: ['Slow'] });
	});
});

describe('a user or a core feature added under the id the page minted', () => {
	it('takes a UUID the page proposed, and only that', () => {
		expect(isProposedId(ID)).toBe(true);
		expect(isProposedId('role:1')).toBe(false);
		expect(isProposedId(42)).toBe(false);
		expect(parseSpecEdit({ op: 'add_user', id: ID })).toEqual({ ok: true, request: { op: 'add_user', id: ID } });
		expect(parseSpecEdit({ op: 'add_core', id: 'x' })).toMatchObject({ ok: false });
		expect(parseSpecEdit({ op: 'add_core' })).toEqual({ ok: true, request: { op: 'add_core' } });
	});

	it('adds a feature to a core feature by hand, and refuses a core feature gone [criterion:042ee8c0]', () => {
		const core = addCore(createEmptyFeaturesDraft('p1'), ID);
		const added = addFeature(core.draft, ID, '11111111-1111-4111-8111-111111111111');
		expect(added?.anchor).toBe('feature:11111111-1111-4111-8111-111111111111');
		expect(added?.draft.features[0]).toMatchObject({ coreId: ID, name: NEW_FEATURE_NAME, parentFamilyId: null });
		expect(addFeature(added!.draft, ID, '11111111-1111-4111-8111-111111111111')?.draft.features).toHaveLength(1);
		expect(addFeature(core.draft, 'gone')).toBeNull();
	});

	it('adds under that id, and an add sent twice adds once', () => {
		const once = addUser(createEmptyUsersDraft('p1'), ID);
		expect(once.anchor).toBe(`role:${ID}`);
		expect(once.draft.roles).toHaveLength(1);
		expect(once.draft.roles[0]).toMatchObject({ id: ID, name: NEW_USER_NAME });
		expect(addUser(once.draft, ID).draft.roles).toHaveLength(1);

		const core = addCore(createEmptyFeaturesDraft('p1'), ID);
		expect(core.anchor).toBe(`core:${ID}`);
		expect(core.draft.cores[0]).toMatchObject({ id: ID, name: NEW_CORE_NAME });
		expect(addCore(core.draft, ID).draft.cores).toHaveLength(1);
	});
});

describe('an element just added is named at the foot of its list [criterion:4b3d2b4d]', () => {
	const names = ['Administrator', 'Guest', 'New user', 'User'];
	it('sits last while its editor is open, the others still from A to Z', () => {
		expect(addedLast(names, (n) => n === 'New user')).toEqual(['Administrator', 'Guest', 'User', 'New user']);
	});
	it('takes its alphabetical place once its editor closes', () => {
		expect(addedLast(names, () => false)).toEqual(names);
	});
});

describe('every text of a draft is a field of the Edit mode, a table of the data map included [criterion:41514698]', () => {
	const draft = (): ProjectDataDraft => ({
		...createEmptyDataDraft('p'),
		entities: [createEntity({ id: 't1', name: 'Link', description: 'A short link.' })]
	});

	it('edits a table by its name and what it holds, a blank name keeping the one before', () => {
		expect(editShapeOf('entity:t1')).toEqual({ section: 'data', text: 'Name', desc: 'What it holds', tags: null });
		const next = editData(draft(), 'entity:t1', { text: '  Short link ', desc: ' What a visitor follows. ' });
		expect(next?.entities[0]).toMatchObject({ name: 'Short link', description: 'What a visitor follows.' });
		expect(editData(draft(), 'entity:t1', { text: '   ' })?.entities[0].name).toBe('Link');
	});

	it('refuses a table that is no longer in the data model, and anything that is not a table', () => {
		expect(editData(draft(), 'entity:gone', { text: 'X' })).toBeNull();
		expect(editData(draft(), 'core:t1', { text: 'X' })).toBeNull();
	});

	it('hands what a table edit changed to the data map, validated as one block', () => {
		expect(validatedElementOf('entity:t1')).toBe('datamap');
		expect(validatedElementOf('feature:f1')).toBe('feature:f1');
	});

	it('takes a table edit from the page', () => {
		expect(parseSpecEdit({ op: 'edit', anchor: 'entity:t1', text: 'Short link', desc: 'x' })).toMatchObject({ ok: true });
	});
});
