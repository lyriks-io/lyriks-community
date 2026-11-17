import { describe, expect, it } from 'vitest';
import { createEmptyDataDraft, createEntity, createField, type EntityField, type ProjectDataDraft } from '$domain/data';
import { fieldAccepts, tableRelations } from './table-details';

/** Linkding's data model, the part the built-in AI read on 2026-11-05. */
function linkding(onDelete: Partial<Record<string, EntityField['onDelete']>> = {}): ProjectDataDraft {
	const data = createEmptyDataDraft('linkding');
	const table = (id: string, name: string) => ({ ...createEntity(), id, name });
	data.entities = [table('user', 'User'), table('bookmark', 'Bookmark'), table('tag', 'Tag'), table('asset', 'Asset')];
	const relation = (id: string, entityId: string, name: string, target: string, flags: Partial<EntityField> = {}): EntityField => ({
		...createField(entityId),
		id,
		name,
		type: 'relation',
		relationTargetEntityId: target,
		...flags,
		...(onDelete[id] ? { onDelete: onDelete[id] } : {})
	});
	data.fields = [
		relation('bm-owner', 'bookmark', 'owner', 'user', { isRequired: true }),
		relation('bm-snapshot', 'bookmark', 'latest_snapshot', 'asset'),
		relation('bm-tags', 'bookmark', 'tags', 'tag', { isList: true }),
		relation('asset-bookmark', 'asset', 'bookmark', 'bookmark', { isRequired: true })
	];
	return data;
}

const said = (r: ReturnType<typeof tableRelations>[number]) => `Each ${r.holder.name} ${r.verb} ${r.target?.name ?? 'missing table'} (${r.field})`;

describe('a table drawer says what each field accepts [criterion:a7ca2255]', () => {
	it('a choice lists its values in the product words', () => {
		expect(fieldAccepts({ type: 'enum', enumValues: ['pending', 'complete', 'failure'], defaultValue: '' })).toEqual({ values: 'pending · complete · failure', default: null });
	});

	it('a choice listing no value says so, never invents one', () => {
		expect(fieldAccepts({ type: 'enum', enumValues: [], defaultValue: '' }).values).toBe('values not stated');
	});

	it('a stated default reads, an unstated one says nothing', () => {
		expect(fieldAccepts({ type: 'boolean', defaultValue: 'false' })).toEqual({ values: null, default: 'Default: false' });
		expect(fieldAccepts({ type: 'string', defaultValue: '  ' })).toEqual({ values: null, default: null });
	});
});

describe('a table drawer says how it relates, in sentences [criterion:51dd6218]', () => {
	it('Bookmark says its own relations first, then those pointing at it', () => {
		expect(tableRelations(linkding(), 'bookmark').map(said)).toEqual([
			'Each Bookmark belongs to one User (owner)',
			'Each Bookmark may point at one Asset (latest_snapshot)',
			'Each Bookmark points at zero or many Tag (tags)',
			'Each Asset belongs to one Bookmark (bookmark)'
		]);
	});

	it('the tables named carry their ids, so each one is a link', () => {
		const [owner] = tableRelations(linkding(), 'bookmark');
		expect(owner).toMatchObject({ own: true, holder: { id: 'bookmark' }, target: { id: 'user', name: 'User' } });
	});

	it('a relation to a table that is not in the model reads broken', () => {
		const data = linkding();
		data.fields.push({ ...createField('tag'), id: 'tag-ghost', name: 'ghost', type: 'relation', relationTargetEntityId: 'gone' });
		expect(tableRelations(data, 'tag').find((r) => r.id === 'tag-ghost')).toMatchObject({ target: null, deletion: null });
	});

	it('a table pointing at itself is said once, and a table related to none has no sentence', () => {
		const data = linkding();
		data.fields.push({ ...createField('tag'), id: 'tag-parent', name: 'parent', type: 'relation', relationTargetEntityId: 'tag' });
		expect(tableRelations(data, 'tag').filter((r) => r.id === 'tag-parent')).toHaveLength(1);
		data.entities.push({ ...createEntity(), id: 'setting', name: 'Setting' });
		expect(tableRelations(data, 'setting')).toEqual([]);
	});
});

describe('a relation says what deleting the record it points at does [criterion:99e7cc77]', () => {
	const data = linkding({ 'bm-owner': 'cascade', 'bm-snapshot': 'set_null', 'asset-bookmark': 'restrict' });

	it('the table pointed at says what deleting it does', () => {
		expect(tableRelations(data, 'user').map((r) => r.deletion)).toEqual(['Deleting a User deletes each Bookmark that points at it.']);
		expect(tableRelations(data, 'asset').find((r) => r.id === 'bm-snapshot')?.deletion).toBe('Deleting an Asset leaves each Bookmark that points at it without one.');
		expect(tableRelations(data, 'bookmark').find((r) => r.id === 'asset-bookmark')?.deletion).toBe('A Bookmark is not deleted while an Asset points at it.');
	});

	it('the table holding it says it from its side', () => {
		const bookmark = tableRelations(data, 'bookmark');
		expect(bookmark.find((r) => r.id === 'bm-owner')?.deletion).toBe('Deleted with its User.');
		expect(bookmark.find((r) => r.id === 'bm-snapshot')?.deletion).toBe('Left without its Asset when that Asset is deleted.');
		expect(tableRelations(data, 'asset').find((r) => r.id === 'asset-bookmark')?.deletion).toBe('Keeps its Bookmark from being deleted.');
	});

	it('a relation recording nothing says it is not stated, never a guess', () => {
		const tags = tableRelations(data, 'bookmark').find((r) => r.id === 'bm-tags');
		expect(tags).toMatchObject({ deletion: 'What deleting it does is not stated.', deletionStated: false });
	});
});

describe('a deletion sentence names a table with the article its sound takes [criterion:99e7cc77]', () => {
	const pointedAt = (name: string) => {
		const data = linkding({ 'bm-owner': 'cascade' });
		data.entities = data.entities.map((e) => (e.id === 'user' ? { ...e, name } : e));
		return tableRelations(data, 'user')[0].deletion;
	};

	it.each([
		['User', 'a User'],
		['Unit', 'a Unit'],
		['Update', 'an Update'],
		['Order', 'an Order'],
		['Euro rate', 'a Euro rate'],
		['Event', 'an Event']
	])('%s reads "%s"', (name, named) => {
		expect(pointedAt(name)).toBe(`Deleting ${named} deletes each Bookmark that points at it.`);
	});
});
