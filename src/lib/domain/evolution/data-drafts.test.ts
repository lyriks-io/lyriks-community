import { describe, expect, it } from 'vitest';
import { addDataDraftAct, removeDataDraftAct, updateDataDraftAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { dataChangeNodes, dataChangeView, dataReportLines, landingOfData, landRows, requestSourceId, requestSourceRow, sourcesCitedByRequest, toChangeErDiagram, type DataModelLike } from './data-drafts';
import { snapshotOf, versionDiff } from './versions';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { withSolutionValidated } from './solution-validated.fixture';

/**
 * The data a request changes. What these tests pin is ac-evo-draft-data,
 * ac-evo-draft-data-landing and ac-evo-imp-erd.
 */

const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
let n = 0;
const ctx: ActContext = { actor: ana, at: '2026-10-08T12:00:00.000Z', newId: () => `id${++n}`, soloWorkspace: true };
const ok = (o: ActOutcome): EvolutionRequest => {
	if (!o.ok) throw new Error(o.reason);
	return o.request;
};
const reason = (o: ActOutcome) => (o.ok ? '' : o.reason);

const model: DataModelLike = {
	entities: [
		{ id: 'client', name: 'Client' },
		{ id: 'order', name: 'Order' },
		{ id: 'slot', name: 'Slot' },
		{ id: 'legacy', name: 'Legacy' }
	],
	fields: [
		{ id: 'c-id', entityId: 'client', name: 'id', type: 'uuid', isId: true },
		{ id: 'c-phone', entityId: 'client', name: 'phone', type: 'string' },
		{ id: 'o-id', entityId: 'order', name: 'id', type: 'uuid', isId: true },
		{ id: 'o-client', entityId: 'order', name: 'client', type: 'relation', relationTargetEntityId: 'client', isRequired: true },
		{ id: 'o-slot', entityId: 'order', name: 'slot', type: 'relation', relationTargetEntityId: 'slot', isRequired: true },
		{ id: 'o-status', entityId: 'order', name: 'status', type: 'enum' },
		{ id: 's-id', entityId: 'slot', name: 'id', type: 'uuid', isId: true },
		{ id: 'l-id', entityId: 'legacy', name: 'id', type: 'uuid', isId: true },
		{ id: 'l-order', entityId: 'legacy', name: 'order', type: 'relation', relationTargetEntityId: 'order' }
	]
};

const open = () => withSolutionValidated(createEvolutionRequest({ id: 'r1', title: 'Tell the customer', origin: 'internal_idea', stage: 'specification' }));

/** A request that adds a table, amends two and removes one. */
function drafted(): EvolutionRequest {
	let r = ok(addDataDraftAct(ctx, open(), { kind: 'add', name: 'Notification', addFields: [{ name: 'order', type: 'relation', relationTo: 'order', required: true }, { name: 'sentAt', type: 'datetime' }] }, model));
	r = ok(addDataDraftAct(ctx, r, { kind: 'amend', entityId: 'order', addFields: [{ name: 'readyAt', type: 'datetime' }], changeFields: [{ fieldId: 'o-status', required: true }], removeFields: [] }, model));
	r = ok(addDataDraftAct(ctx, r, { kind: 'amend', entityId: 'client', removeFields: ['c-phone'] }, model));
	r = ok(addDataDraftAct(ctx, r, { kind: 'remove', entityId: 'legacy' }, model));
	return r;
}

describe('a request declares the data it changes', () => {
	it('carries tables to add, amend and remove, reopens no step of prose, and refuses what does not fit the model', () => {
		const r = drafted();
		expect(r.dataDrafts.map((d) => [d.kind, d.entityId ?? d.name])).toEqual([
			['add', 'Notification'],
			['amend', 'order'],
			['amend', 'client'],
			['remove', 'legacy']
		]);
		expect(r.history.at(-1)?.type).toBe('draft_change');

		expect(reason(addDataDraftAct(ctx, r, { kind: 'amend', entityId: 'order' }, model))).toBe('This request already carries a change for that table.');
		expect(reason(addDataDraftAct(ctx, open(), { kind: 'amend', entityId: 'slot', removeFields: ['c-phone'] }, model))).toBe('Field "c-phone" does not belong to this table.');
		expect(reason(addDataDraftAct(ctx, open(), { kind: 'add', name: 'X', addFields: [{ name: 'to', type: 'relation', relationTo: 'nowhere' }] }, model))).toBe('"nowhere" is not a table.');
		expect(reason(addDataDraftAct(ctx, open(), { kind: 'add', name: 'X', addFields: [{ name: 'n', type: 'number' }] }, model))).toBe('"number" is not a field type.');
		expect(reason(addDataDraftAct(ctx, { ...open(), frozen: true, specVersion: 1 }, { kind: 'add', name: 'X' }, model))).toContain('frozen');

		const notification = r.dataDrafts[0].id;
		expect(reason(removeDataDraftAct(ctx, ok(addDataDraftAct(ctx, r, { kind: 'add', name: 'Receipt', addFields: [{ name: 'about', type: 'relation', relationTo: notification }] }, model)), notification))).toBe(
			'Another data change of this request points at this new table.'
		);
		const renamed = ok(updateDataDraftAct(ctx, r, notification, { name: 'Message' }, model));
		expect(renamed.dataDrafts[0].name).toBe('Message');

		// Read at the Impact analysis: a table declared leaves the validations of the prose standing (ac-evo-draft-data, ac-evo-req-21).
		const validated = open();
		expect(ok(addDataDraftAct(ctx, validated, { kind: 'add', name: 'Receipt' }, model)).stepValidations).toEqual(validated.stepValidations);
	});
});

describe('the data a request touches, drawn like the Data model', () => {
	it('marks each table and field added, changed or removed, and shows the tables they link to in grey', () => {
		const view = dataChangeView(model, drafted().dataDrafts);
		const status = Object.fromEntries(view.tables.map((t) => [t.name, t.status]));
		expect(status).toEqual({ Notification: 'added', Order: 'changed', Client: 'changed', Legacy: 'removed', Slot: 'linked' });
		const order = view.tables.find((t) => t.name === 'Order')!;
		expect(order.fields.map((f) => [f.name, f.status])).toEqual([
			['id', 'kept'],
			['client', 'kept'],
			['slot', 'kept'],
			['status', 'changed'],
			['readyAt', 'added']
		]);
		expect(view.counts).toEqual({ tablesAdded: 1, tablesChanged: 2, tablesRemoved: 1, fieldsAdded: 3, fieldsChanged: 1, fieldsRemoved: 3 });

		const erd = toChangeErDiagram(view);
		expect(erd).toContain('Notification {');
		expect(erd).toContain('datetime readyAt "added"');
		expect(erd).toMatch(/class Notification added/);
		expect(erd).toMatch(/class Legacy removed/);
		expect(erd).toMatch(/class Slot linked/);
		expect(toChangeErDiagram(dataChangeView(model, []))).toContain('This request changes no data.');

		expect(dataChangeNodes(view).map((x) => `${x.status} ${x.kind} ${x.label}`)).toEqual([
			'added entity Notification',
			'changed field Order.status',
			'added field Order.readyAt',
			'removed field Client.phone',
			'removed entity Legacy'
		]);
	});
});

describe('the data change becomes official only when the change is declared live', () => {
	it('writes tables and fields under the ids the request gave them, with a key for a new table, and takes what a removed table held', () => {
		const r = drafted();
		const landing = landingOfData(model, r.dataDrafts);
		const notification = r.dataDrafts[0].id.slice('data:'.length);
		expect(landing.model.entities).toEqual([{ id: notification, name: 'Notification', description: '' }]);
		expect(landing.model.fields.map((f) => [f.entityId === notification ? 'Notification' : f.entityId, f.name, f.isId === true])).toEqual([
			['Notification', 'id', true],
			['Notification', 'order', false],
			['Notification', 'sentAt', false],
			['order', 'readyAt', false]
		]);
		expect(landing.removedEntityIds).toEqual(['legacy']);
		expect([...landing.removedFieldIds].sort()).toEqual(['c-phone', 'l-id', 'l-order']);
		expect(landing.changedFields).toEqual([{ fieldId: 'o-status', required: true }]);
		expect(landing.lines[0]).toBe('Created table "Notification" (2 fields added)');
	});
});

describe('a data change is kept, versioned and read back', () => {
	it('survives the dossier being saved and read back, and the version comparison lists it', () => {
		const r = drafted();
		const read = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [r], lastSavedAt: null })), 'p').requests[0];
		expect(read.dataDrafts).toEqual(r.dataDrafts);

		const before = snapshotOf(open() as EvolutionRequest);
		const after = snapshotOf(r);
		const changes = versionDiff(before, after, (id) => model.entities.find((e) => e.id === id)?.name ?? id).filter((c) => c.kind === 'data');
		expect(changes.map((c) => c.after)).toEqual([
			'Adds table "Notification": order (relation), sentAt (datetime)',
			'Amends table "Order": adds readyAt (datetime); changes 1 field',
			'Amends table "Client": removes 1 field',
			'Removes table "Legacy"'
		]);
	});
});

describe('the data changes in the Build report', () => {
	it('makes one line per table change, to build until a person validates it, with an id a rebuild keeps', () => {
		const r = drafted();
		const lines = dataReportLines(r.dataDrafts, { iteration: 1, specVersion: 2 }, (id) => model.entities.find((e) => e.id === id)?.name ?? id);
		expect(lines.map((l) => [l.verdict, l.requirement])).toEqual([
			['missing', 'Data change: adds table "Notification" (order, sentAt)'],
			['missing', 'Data change: amends table "Order": adds readyAt, changes 1 field'],
			['missing', 'Data change: amends table "Client": removes 1 field'],
			['missing', 'Data change: removes table "Legacy"']
		]);
		expect(lines[0].id).toBe(`data-line:${r.dataDrafts[0].id}`);
		expect(lines.every((l) => l.scope === 'request' && l.specVersion === 2 && l.decision === 'undecided')).toBe(true);
	});
});

describe('the landing writes a table once, and says where it comes from', () => {
	const merge = (held: { id: string; name: string }, landed: { id: string; name: string }) => ({ ...held, name: landed.name });

	it('merges a row whose id the model already holds, never adds it twice, and drops a second copy already there (EVO-001)', () => {
		const model = [
			{ id: 'orders', name: 'Orders' },
			{ id: 'active', name: 'Active project' },
			{ id: 'active', name: 'Active project' }
		];
		const out = landRows(model, [{ id: 'active', name: 'Active project' }, { id: 'carts', name: 'Carts' }], merge);
		expect(out.map((r) => r.id)).toEqual(['orders', 'active', 'carts']);
	});

	it('lands the same rows twice to the same model', () => {
		const landed = [{ id: 'carts', name: 'Carts' }];
		const once = landRows([{ id: 'orders', name: 'Orders' }], landed, merge);
		expect(landRows(once, landed, merge)).toEqual(once);
	});

	it('names the request as a source reachable through its own words, and the sources its drafts cite once each', () => {
		const row = requestSourceRow({ id: 'r1', title: 'One active project', need: { description: 'Community works on one project.' } }, 'EVO-001');
		expect(row).toEqual({ id: requestSourceId('r1'), title: 'Evolution EVO-001: One active project', kind: 'requirement', url: '', note: 'One active project. Community works on one project.' });
		expect(
			sourcesCitedByRequest({ drafts: [{ sourceIds: ['src-a'] }, { sourceIds: [] }], sectionDrafts: [{ sourceIds: ['src-a', 'src-b'] }], ruleDrafts: [], findingDrafts: [{ sourceIds: ['src-c'] }] })
		).toEqual(['src-a', 'src-b', 'src-c']);
	});
});
