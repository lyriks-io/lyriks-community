import { describe, expect, it, vi } from 'vitest';
import {
	createEmptyDataDraft,
	createEntity,
	createField,
	type DataRulesSetup,
	type ProjectDataDraft
} from '$domain/data';
import type { DataDraftRepositoryPort, EngineAnswer, ProjectBehavior } from '../ports';
import { ReadDataRulesUseCase } from './read-data-rules';
import { SyncDataRulesUseCase } from './sync-data-rules';
import { ReadDataLinksUseCase } from './read-data-links';
import { TieDataFieldUseCase } from './tie-data-field';

/**
 * The data model's rules reach the solver through the engine's project
 * invariants, and a field reaches a state through the engine's links. A fake
 * engine applies the operations it receives, so what is checked is what the
 * project holds afterwards, not which calls were made.
 */

type StateRow = Record<string, unknown>;

class FakeEngine {
	invariants: Record<string, unknown>[] = [];
	states: StateRow[] = [];
	registered = new Set<string>();
	batches: Record<string, unknown>[][] = [];
	#next = 0;

	readProjectBehavior = async (): Promise<ProjectBehavior> => ({
		projectInvariants: this.invariants,
		coreFeatures: [],
		stateVariables: { stateVariables: this.states },
		library: {},
		registeredStateIds: [...this.registered]
	});

	applyProjectBatch = async (_p: string, ops: readonly Record<string, unknown>[]): Promise<EngineAnswer> => {
		this.batches.push([...ops]);
		const refs: Record<string, string> = {};
		for (const op of ops) {
			if (op.kind === 'add_project_invariant') {
				const id = `pi-${++this.#next}`;
				refs[String(op.ref)] = id;
				this.invariants.push({ id, ...(op.invariant as object) });
			} else if (op.kind === 'update_project_invariant') {
				const row = this.invariants.find((i) => i.id === op.invariantId)!;
				Object.assign(row, { name: op.name, condition: op.condition, message: op.message, description: op.description });
			} else if (op.kind === 'remove_project_invariant') {
				this.invariants = this.invariants.filter((i) => i.id !== op.invariantId);
			} else if (op.kind === 'add_state_variable') {
				const row = this.states.find((s) => s.path === op.path)!;
				row.id = `sv-${++this.#next}`;
				refs[String(op.ref)] = String(row.id);
				this.registered.add(String(row.id));
			} else if (op.kind === 'link_state_variable') {
				const id = op.stateRef ? refs[String(op.stateRef)] : op.stateId;
				const row = this.states.find((s) => s.id === id)!;
				row.links = op.dataField ? { dataField: op.dataField } : {};
			}
		}
		return { kind: 'answer', value: { ok: true, refs } };
	};
}

class MemoryDrafts implements DataDraftRepositoryPort {
	constructor(public draft: ProjectDataDraft) {}
	load = async () => structuredClone(this.draft);
	save = async (draft: ProjectDataDraft) => {
		// A save keeps the server-owned parts (generated map, link record), as the kernel repository does.
		const kept = this.draft.rules;
		this.draft = {
			...structuredClone(draft),
			rules: {
				existence: draft.rules?.existence ?? {},
				generated: kept?.generated ?? {},
				...(kept?.linkedBy ? { linkedBy: kept.linkedBy } : {}),
				...(kept?.declined ? { declined: kept.declined } : {}),
				...(kept?.alsoCarriedBy ? { alsoCarriedBy: kept.alsoCarriedBy } : {})
			}
		};
	};
	saveGeneratedRules = async (_p: string, generated: DataRulesSetup['generated']) => {
		this.draft = { ...this.draft, rules: { ...this.draft.rules!, existence: this.draft.rules?.existence ?? {}, generated } };
	};
	saveLinkRecord = async (_p: string, record: Pick<DataRulesSetup, 'linkedBy' | 'declined' | 'alsoCarriedBy'>) => {
		const rules = this.draft.rules ?? { existence: {}, generated: {} };
		this.draft = {
			...this.draft,
			rules: { ...rules, linkedBy: record.linkedBy ?? {}, declined: record.declined ?? [], alsoCarriedBy: record.alsoCarriedBy ?? {} }
		};
	};
}

const setup = () => {
	const draft = createEmptyDataDraft('shop');
	const order = createEntity({ name: 'Order' });
	draft.entities.push(order);
	const status = createField(order.id, {
		name: 'status',
		type: 'enum',
		isRequired: true,
		enumValues: ['draft', 'paid', 'shipped'],
		defaultValue: 'draft'
	});
	const total = createField(order.id, { name: 'total', type: 'decimal', isRequired: true });
	draft.fields.push(status, total);
	const engine = new FakeEngine();
	engine.states = [
		{ id: 'd-status', path: 'order.status', type: 'enum', enumValues: ['draft', 'paid', 'shipped'], defaultValue: 'draft', owner: { featureId: 'checkout', surfaceId: 's1' }, description: 'The order status.' },
		{ id: 'd-total', path: 'order.totalAmount', type: 'number', defaultValue: 0, owner: { featureId: 'checkout', surfaceId: 's1' }, description: 'Total.' },
		{ id: 'd-placed', path: 'order.placed', type: 'boolean', defaultValue: false, owner: { featureId: 'checkout', surfaceId: 's1' }, description: 'Placed.' },
		{ id: 'd-label', path: 'order.label', type: 'string', defaultValue: '', owner: { featureId: 'checkout', surfaceId: 's1' }, description: 'Label.' }
	];
	const drafts = new MemoryDrafts(draft);
	const sync = new SyncDataRulesUseCase(drafts, engine);
	const tie = new TieDataFieldUseCase(drafts, engine, sync);
	const read = new ReadDataRulesUseCase(drafts, { ...engine, proveProjectRules: undefined });
	return { draft, order, status, total, engine, drafts, sync, tie, read };
};

describe('tying a field to the state that carries it', () => {
	it('registers a state a feature only declares, links it, and gives the solver the rules it now can check', async () => {
		const t = setup();
		const result = await t.tie.tie('shop', t.status.id, 'order.status');
		expect(result.ok).toBe(true);
		const linked = t.engine.states.find((s) => s.path === 'order.status')!;
		expect(t.engine.registered.has(String(linked.id))).toBe(true);
		expect(linked.links).toEqual({
			dataField: { featureId: 'shop__data_model', entityId: `ent-${t.order.id}`, fieldId: `fld-${t.status.id}` }
		});
		// The choice needs only the link; "required" also waits for the table's existence state.
		expect(t.engine.invariants.map((i) => i.name)).toEqual([
			'The system shall restrict the status of an Order to draft, paid or shipped.'
		]);
		expect(Object.values(t.drafts.draft.rules!.generated)).toEqual([
			{ entityId: t.order.id, fieldId: t.status.id, kind: 'choice' }
		]);
	});

	it('refuses another kind of value, and a state that already carries another field', async () => {
		const t = setup();
		const wrong = await t.tie.tie('shop', t.total.id, 'order.label');
		expect(wrong).toMatchObject({ ok: false, status: 400, error: 'That state holds a string, the field a number.' });
		await t.tie.tie('shop', t.status.id, 'order.status');
		const other = createField(t.order.id, { name: 'phase', type: 'enum', enumValues: ['draft', 'paid', 'shipped'] });
		t.drafts.draft.fields.push(other);
		const taken = await t.tie.tie('shop', other.id, 'order.status');
		expect(taken).toMatchObject({ ok: false, status: 409 });
	});

	it('refuses an existence state that is not yes-or-no', async () => {
		const t = setup();
		expect(await t.tie.nameExistence('shop', t.order.id, 'order.totalAmount')).toMatchObject({ ok: false, status: 400 });
	});
});

describe('the rules the solver is given follow the model', () => {
	it('plans an explicit link after an automatic link in flight has landed', async () => {
		const t = setup();
		let release!: () => void;
		let started!: () => void;
		const waiting = new Promise<void>((resolve) => { release = resolve; });
		const entered = new Promise<void>((resolve) => { started = resolve; });
		const apply = t.engine.applyProjectBatch;
		let registrations = 0;
		t.engine.applyProjectBatch = async (projectId, ops) => {
			if (ops.some((op) => op.kind === 'add_state_variable')) {
				registrations += 1;
				started();
				await waiting;
			}
			return apply(projectId, ops);
		};
		const reads = vi.spyOn(t.engine, 'readProjectBehavior');
		const automatic = t.sync.execute('shop');
		await entered;
		const before = reads.mock.calls.length;
		const explicit = t.tie.tie('shop', t.status.id, 'order.status');
		try {
			await new Promise((resolve) => setImmediate(resolve));
			expect(reads).toHaveBeenCalledTimes(before);
		} finally { release(); }
		expect((await automatic).ok).toBe(true);
		expect((await explicit).ok).toBe(true);
		expect(registrations).toBe(1);
		expect(t.engine.registered.size).toBe(1);
	});

	it('propagates a failed read once and allows the next sync to recover', async () => {
		const t = setup();
		vi.spyOn(t.drafts, 'load').mockRejectedValueOnce(new Error('temporary read failure'));
		await expect(t.sync.execute('shop')).rejects.toThrow('temporary read failure');
		// Let any accidentally detached rejected promise reach the test runner.
		await new Promise((resolve) => setImmediate(resolve));
		expect((await t.sync.execute('shop')).ok).toBe(true);
	});

	it('adds the required rule once the table names its existence, rewrites nothing unchanged, removes an untied one', async () => {
		const t = setup();
		await t.tie.tie('shop', t.status.id, 'order.status');
		await t.tie.nameExistence('shop', t.order.id, 'order.placed');
		expect(t.engine.invariants.map((i) => i.name).sort()).toEqual([
			'The system shall restrict the status of an Order to draft, paid or shipped.',
			'While an Order exists, the system shall ensure that it has a status.'
		]);
		const batchesBefore = t.engine.batches.length;
		expect(await t.sync.execute('shop')).toEqual({ ok: true, added: 0, updated: 0, removed: 0 });
		expect(t.engine.batches.length).toBe(batchesBefore);

		await t.tie.untie('shop', t.status.id);
		expect(t.engine.invariants).toEqual([]);
		expect(t.drafts.draft.rules!.generated).toEqual({});
	});

	it('never touches a rule a person wrote', async () => {
		const t = setup();
		t.engine.invariants.push({ id: 'hand', name: 'Written by a person', condition: {}, message: 'x' });
		await t.tie.tie('shop', t.status.id, 'order.status');
		await t.tie.untie('shop', t.status.id);
		expect(t.engine.invariants.map((i) => i.id)).toEqual(['hand']);
	});

	it('changes nothing when the engine refuses, and says why', async () => {
		const t = setup();
		t.engine.applyProjectBatch = async () => ({ kind: 'answer', value: { ok: false, errors: ['a path no feature declares'] } });
		t.drafts.draft.rules = { existence: {}, generated: {} };
		const links = t.engine.states.find((s) => s.path === 'order.status')!;
		links.links = { dataField: { featureId: 'shop__data_model', entityId: `ent-${t.order.id}`, fieldId: `fld-${t.status.id}` } };
		expect(await t.sync.execute('shop')).toMatchObject({ ok: false, error: 'a path no feature declares' });
		expect(t.drafts.draft.rules!.generated).toEqual({});
	});
});

describe('the Rules reading', () => {
	it('says per rule what it is tied to, what it waits for, and where it opens', async () => {
		const t = setup();
		await t.tie.tie('shop', t.status.id, 'order.status');
		const reading = (await t.read.read('shop'))!;
		const required = reading.rules.find((r) => r.shape === 'required' && r.fieldId === t.status.id)!;
		expect(required).toMatchObject({ tiedTo: 'order.status', missing: 'existence', invariantId: null });
		const choice = reading.rules.find((r) => r.shape === 'choice')!;
		expect(choice.invariantId).toMatch(/^pi-/);
		expect(choice.href).toBe(`/projects/shop/infrastructure?tab=model&view=rules&rule=choice%3A${t.status.id}`);
		const startsAs = reading.rules.find((r) => r.shape === 'starts-as')!;
		expect(startsAs.startsAs).toEqual({ behaviour: 'draft', same: true });
		expect(reading.rules.find((r) => r.fieldId === t.total.id)!.missing).toBe('link');
		expect(reading.suggestions[t.total.id]).toEqual([{ path: 'order.totalAmount', type: 'number' }]);
		expect(reading.tables[0]).toMatchObject({ existence: null, candidates: ['order.placed'] });
	});
});

describe('links made as the product is captured', () => {
	it('links by itself a field only one state can hold, and says it did', async () => {
		const t = setup();
		expect(await t.sync.execute('shop')).toMatchObject({ ok: true, linked: 1 });
		const status = t.engine.states.find((s) => s.path === 'order.status')!;
		expect(status.links).toEqual({
			dataField: { featureId: 'shop__data_model', entityId: `ent-${t.order.id}`, fieldId: `fld-${t.status.id}` }
		});
		expect(t.drafts.draft.rules!.linkedBy).toEqual({ [t.status.id]: 'lyriks' });
		expect(t.engine.invariants.map((i) => i.name)).toEqual([
			'The system shall restrict the status of an Order to draft, paid or shipped.'
		]);
		const reading = (await t.read.read('shop'))!;
		expect(reading.rules.find((r) => r.shape === 'choice')).toMatchObject({ tiedTo: 'order.status', linkedBy: 'lyriks' });
		// order.totalAmount says more than "total": left to an AI client or a person.
		expect(reading.rules.find((r) => r.fieldId === t.total.id)!.tiedTo).toBeNull();
	});

	it('leaves a field alone when two states could hold it', async () => {
		const t = setup();
		t.engine.states.push({ id: 'd-s2', path: 'shipping.order.status', type: 'enum', enumValues: ['draft', 'paid', 'shipped'], defaultValue: 'draft', owner: { featureId: 'shipping', surfaceId: 's2' }, description: 'Shipping view of the status.' });
		expect(await t.sync.execute('shop')).toEqual({ ok: true, added: 0, updated: 0, removed: 0 });
		expect(t.drafts.draft.rules!.linkedBy).toBeUndefined();
	});

	it('never makes again a link a person took back; only a person makes it again', async () => {
		const t = setup();
		await t.sync.execute('shop');
		await t.tie.untie('shop', t.status.id);
		expect(t.drafts.draft.rules!.declined).toEqual([t.status.id]);
		await t.sync.execute('shop');
		expect(t.engine.states.find((s) => s.path === 'order.status')!.links).toEqual({});
		const byClient = await t.tie.linkByNames('shop', { links: [{ table: 'Order', field: 'status', statePath: 'order.status' }] }, 'ai-client');
		expect(byClient.ok && byClient.outcomes[0]).toMatchObject({ ok: false, status: 409, error: 'A person unlinked "status": only a person links it again.' });
		expect((await t.tie.tie('shop', t.status.id, 'order.status')).ok).toBe(true);
		expect(t.drafts.draft.rules).toMatchObject({ linkedBy: { [t.status.id]: 'person' }, declined: [] });
	});

	it('lets an AI client link many fields and name existence by names, each refusal on its own line', async () => {
		const t = setup();
		const result = await t.tie.linkByNames(
			'shop',
			{
				links: [
					{ table: 'order', field: 'Total', statePath: 'order.totalAmount' },
					{ table: 'Order', field: 'discount', statePath: 'order.totalAmount' },
					{ table: 'Order', field: 'status', statePath: 'order.label' }
				],
				existence: [{ table: 'Order', statePath: 'order.placed' }]
			},
			'ai-client'
		);
		if (!result.ok) throw new Error(result.error);
		expect(result.outcomes.map((o) => o.ok)).toEqual([true, false, false]);
		expect(result.outcomes.find((o) => !o.ok && o.status === 404)!.error).toBe('No field "discount" in "Order".');
		expect(result.existence).toEqual([{ table: 'Order', ok: true }]);
		expect(t.drafts.draft.rules!.existence).toEqual({ [t.order.id]: 'order.placed' });
		// The sync after the call also linked status by itself: the certain one needs nobody.
		expect(t.drafts.draft.rules!.linkedBy).toEqual({ [t.total.id]: 'ai-client', [t.status.id]: 'lyriks' });
		expect(t.engine.invariants.map((i) => i.name).sort()).toEqual([
			'The system shall restrict the status of an Order to draft, paid or shipped.',
			'While an Order exists, the system shall ensure that it has a status.',
			'While an Order exists, the system shall ensure that it has a total.'
		]);
	});

	it('lists what remains to link with the states that could hold it, and counts it per table', async () => {
		const t = setup();
		const links = new ReadDataLinksUseCase(t.drafts, t.engine);
		const reading = (await links.read('shop', { unlinkedOnly: true }))!;
		expect(reading).toMatchObject({ total: 2, linked: 0, unlinkedCheckable: 2 });
		const total = reading.rows.find((r) => r.field === 'total')!;
		expect(total).toMatchObject({ table: 'Order', kind: 'decimal', required: true, linkedTo: null });
		expect(total.candidates).toEqual([{ path: 'order.totalAmount', type: 'number', description: 'Total.' }]);
		expect(await links.unlinkedCheckable('shop')).toEqual([{ table: 'Order', count: 2 }]);
	});
});

describe('a field carried by further states [criterion:3238573b]', () => {
	const withShipping = () => {
		const t = setup();
		t.engine.states.push({ id: 'd-s2', path: 'shipping.order.status', type: 'enum', enumValues: ['draft', 'paid', 'shipped'], defaultValue: 'draft', owner: { featureId: 'shipping', surfaceId: 's2' }, description: 'Shipping view of the status.' });
		t.engine.registered.add('d-status').add('d-s2');
		return t;
	};

	it('keeps the first state for the solver and records the further one beside it', async () => {
		const t = withShipping();
		const result = await t.tie.linkByNames(
			'shop',
			{
				links: [
					{ table: 'Order', field: 'status', statePath: 'order.status' },
					{ table: 'Order', field: 'status', statePath: 'shipping.order.status', also: true }
				]
			},
			'ai-client'
		);
		if (!result.ok) throw new Error(result.error);
		expect(result.outcomes.map((o) => o.ok)).toEqual([true, true]);
		expect(t.drafts.draft.rules!.alsoCarriedBy).toEqual({ [t.status.id]: ['shipping.order.status'] });
		// The engine holds the first link only, and the solver checks the choice once.
		expect(t.engine.states.find((s) => s.path === 'shipping.order.status')!.links).toBeUndefined();
		expect(t.engine.invariants.filter((i) => String(i.name).includes('status'))).toHaveLength(1);
		const rows = (await new ReadDataLinksUseCase(t.drafts, t.engine).read('shop'))!.rows;
		expect(rows.find((r) => r.field === 'status')).toMatchObject({ linkedTo: 'order.status', alsoCarriedBy: ['shipping.order.status'] });
	});

	it('refuses a further state that already carries another field', async () => {
		const t = withShipping();
		await t.tie.linkByNames('shop', { links: [{ table: 'Order', field: 'status', statePath: 'order.status' }, { table: 'Order', field: 'status', statePath: 'shipping.order.status', also: true }] }, 'ai-client');
		const label = createField(t.order.id, { name: 'label', type: 'enum', enumValues: ['draft', 'paid', 'shipped'] });
		t.drafts.draft.fields.push(label);
		const result = await t.tie.linkByNames('shop', { links: [{ table: 'Order', field: 'label', statePath: 'shipping.order.status' }] }, 'ai-client');
		expect(result.ok && result.outcomes[0]).toMatchObject({ ok: false, status: 409, error: 'That state already carries the field "status"; unlink it first.' });
	});

	it('takes the further carriers back on their own, or with the field', async () => {
		const t = withShipping();
		const link = (links: { table: string; field: string; statePath: string | null; also?: boolean }[]) => t.tie.linkByNames('shop', { links }, 'ai-client');
		await link([{ table: 'Order', field: 'status', statePath: 'order.status' }, { table: 'Order', field: 'status', statePath: 'shipping.order.status', also: true }]);
		await link([{ table: 'Order', field: 'status', statePath: null, also: true }]);
		expect(t.drafts.draft.rules!.alsoCarriedBy).toEqual({});
		expect(t.engine.states.find((s) => s.path === 'order.status')!.links).toMatchObject({ dataField: { fieldId: `fld-${t.status.id}` } });
		await link([{ table: 'Order', field: 'status', statePath: 'shipping.order.status', also: true }]);
		await t.tie.untie('shop', t.status.id);
		expect(t.drafts.draft.rules!.alsoCarriedBy).toEqual({});
	});
});

describe('a choice written in another case [criterion:c8ff60f9]', () => {
	it('links USER to user and has the solver check the values as the state spells them', async () => {
		const t = setup();
		t.drafts.draft.fields.find((f) => f.id === t.status.id)!.enumValues = ['DRAFT', 'PAID', 'SHIPPED'];
		const result = await t.tie.linkByNames('shop', { links: [{ table: 'Order', field: 'status', statePath: 'order.status' }] }, 'ai-client');
		expect(result.ok && result.outcomes[0]!.ok).toBe(true);
		const choice = t.engine.invariants.find((i) => String(i.name).includes('status'))!;
		const values = JSON.stringify(choice.condition);
		expect(values).toContain('"right":"draft"');
		expect(values).not.toContain('"right":"DRAFT"');
	});
});
