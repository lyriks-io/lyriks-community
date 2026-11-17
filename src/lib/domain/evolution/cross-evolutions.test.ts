import { describe, expect, it } from 'vitest';
import { concurrentImpact, createDraftLeaf, createEvolutionRequest, crossEvolutions, type DataDraft, type EvolutionRequest } from '.';

const amend = (leafId: string) => createDraftLeaf({ kind: 'amend', baseLeafId: leafId, name: '' });
const remove = (leafId: string) => createDraftLeaf({ kind: 'remove', baseLeafId: leafId, name: '' });
const table = (kind: DataDraft['kind'], entityId: string | null, name = ''): DataDraft => ({
	id: `data:${entityId ?? name}`,
	kind,
	entityId,
	name,
	description: '',
	addFields: [],
	changeFields: [],
	removeFields: [],
	materialisedAs: null,
	materialisedAt: null
});

/** A request as the page reads it: its drafts name the features they stand for. */
const request = (id: string, overrides: Partial<EvolutionRequest> = {}): EvolutionRequest => {
	const drafts = overrides.drafts ?? [];
	return createEvolutionRequest({
		id,
		stage: 'specification',
		leafIds: [...(overrides.leafIds ?? []), ...drafts.flatMap((d) => (d.baseLeafId ? [d.baseLeafId] : [d.id]))],
		...overrides,
		drafts
	});
};
const using = (r: EvolutionRequest, featureId: string): EvolutionRequest => ({
	...r,
	stepAnswers: { ...r.stepAnswers, functional_spec: { diagram: `use case Payer: Client @[Feature](feature:${featureId})` } }
});

describe('the evolutions in progress, read against one request', () => {
	const here = request('here', { stage: 'coherence', drafts: [amend('feat-pickup')], dataDrafts: [table('amend', 'ent-order')] });

	it('reads an overlap when both change the same feature or the same table', () => {
		const onFeature = request('a', { drafts: [amend('feat-pickup')], specVersion: 1, stage: 'implementation' });
		const onTable = request('b', { drafts: [amend('feat-other')], dataDrafts: [table('amend', 'ent-order')] });
		const [a, b] = crossEvolutions(here, [here, onFeature, onTable]);
		expect(a).toMatchObject({ requestId: 'a', verdict: 'overlap', shared: [{ kind: 'feature', id: 'feat-pickup', here: 'amend', there: 'amend', conflict: false }] });
		expect(b).toMatchObject({ requestId: 'b', verdict: 'overlap', shared: [{ kind: 'table', id: 'ent-order', here: 'amend', there: 'amend' }] });
	});

	it('reads a conflict when one removes what the other amends or uses, whichever side removes', () => {
		const removesMine = request('a', { drafts: [remove('feat-pickup')] });
		const usedHere = using(request('mine', { stage: 'coherence', drafts: [amend('feat-x')] }), 'feat-shared');
		const removesUsed = request('b', { drafts: [remove('feat-shared')] });
		const dropsTable = request('c', { drafts: [amend('feat-y')], dataDrafts: [table('remove', 'ent-order')] });
		expect(crossEvolutions(here, [removesMine])[0]).toMatchObject({ verdict: 'conflict', shared: [{ id: 'feat-pickup', here: 'amend', there: 'remove', conflict: true }] });
		expect(crossEvolutions(usedHere, [removesUsed])[0]).toMatchObject({ verdict: 'conflict', shared: [{ id: 'feat-shared', here: 'use', there: 'remove', conflict: true }] });
		expect(crossEvolutions(here, [dropsTable])[0]).toMatchObject({ verdict: 'conflict', shared: [{ kind: 'table', id: 'ent-order', conflict: true }] });
	});

	it('does not count a feature both only use, nor one used here and amended there, as shared', () => {
		const usedHere = using(request('mine', { stage: 'coherence', drafts: [amend('feat-x')] }), 'feat-shared');
		const usedThere = using(request('a', { drafts: [amend('feat-z')], specVersion: 1, stage: 'implementation' }), 'feat-shared');
		const amendedThere = request('b', { drafts: [amend('feat-shared')], specVersion: 1, stage: 'implementation' });
		expect(crossEvolutions(usedHere, [usedThere, amendedThere]).map((c) => [c.requestId, c.verdict, c.shared.length])).toEqual([
			['a', 'compatible', 0],
			['b', 'compatible', 0]
		]);
	});

	it('never shares what a request adds: a new feature or table is its own', () => {
		const addsHere = request('mine', { stage: 'coherence', drafts: [createDraftLeaf({ name: 'Pay online' })], dataDrafts: [table('add', null, 'Payment')] });
		const addsThere = request('a', { drafts: [createDraftLeaf({ name: 'Pay online' })], dataDrafts: [table('add', null, 'Payment')], specVersion: 1, stage: 'implementation' });
		const [reading] = crossEvolutions(addsHere, [addsThere]);
		expect(reading.verdict).toBe('compatible');
		expect(reading.theirs.map((t) => [t.kind, t.change, t.name])).toEqual([
			['feature', 'add', 'Pay online'],
			['table', 'add', 'Payment']
		]);
	});

	it('reads compatible only against a frozen spec, and spec pending while the other has no frozen version', () => {
		const frozen = request('a', { drafts: [amend('feat-other')], specVersion: 1, stage: 'implementation' });
		const notFrozen = request('b', { drafts: [amend('feat-other')], stage: 'coherence' });
		expect(crossEvolutions(here, [notFrozen, frozen]).map((c) => [c.requestId, c.verdict])).toEqual([
			['a', 'compatible'],
			['b', 'spec_pending']
		]);
		expect(crossEvolutions(here, [frozen])[0].theirs).toEqual([{ kind: 'feature', id: 'feat-other', change: 'amend', name: null }]);
	});

	it('still names an overlap with a request whose spec is not frozen yet', () => {
		const notFrozen = request('a', { drafts: [amend('feat-pickup')] });
		expect(crossEvolutions(here, [notFrozen])[0].verdict).toBe('overlap');
	});

	it('reads a feature named as touched without a draft as changed', () => {
		const touchedOnly = request('a', { leafIds: ['feat-pickup'], drafts: [createDraftLeaf({ name: 'New' })] });
		expect(crossEvolutions(here, [touchedOnly])[0]).toMatchObject({ verdict: 'overlap', shared: [{ id: 'feat-pickup', there: 'amend' }] });
	});

	it('says what each side writes into a shared feature or table, and which rules or fields both write', () => {
		const mine = request('m', {
			drafts: [
				createDraftLeaf({
					kind: 'amend',
					baseLeafId: 'feat-pickup',
					changeSummary: ' Paid orders are refunded. ',
					acceptanceCriteria: [{ id: 'c-new', text: 'A refund is made in full.' }],
					changeCriteria: [{ id: 'c-cancel', text: 'A classic order is cancelled until ready.' }],
					retireCriteria: ['c-old']
				})
			],
			dataDrafts: [{ ...table('amend', 'ent-order'), addFields: [{ id: 'f-paid', name: 'paid', type: 'boolean', required: false, list: false, relationTo: null }], removeFields: ['f-note'] }]
		});
		const theirs = request('t', {
			specVersion: 1,
			stage: 'implementation',
			drafts: [createDraftLeaf({ kind: 'amend', baseLeafId: 'feat-pickup', name: '', acceptanceCriteria: [{ id: 'c-cancel', text: 'An order is cancelled until ready.' }] })],
			dataDrafts: [{ ...table('amend', 'ent-order'), changeFields: [{ fieldId: 'f-status', name: 'state' }] }]
		});
		const [reading] = crossEvolutions(mine, [theirs]);
		expect(reading.verdict).toBe('overlap');
		expect(reading.shared[0]).toMatchObject({
			kind: 'feature',
			hereWrites: {
				summary: 'Paid orders are refunded.',
				items: [
					{ id: 'c-new', act: 'add', text: 'A refund is made in full.' },
					{ id: 'c-cancel', act: 'reword', text: 'A classic order is cancelled until ready.' },
					{ id: 'c-old', act: 'retire', text: '' }
				]
			},
			thereWrites: { summary: null, items: [{ id: 'c-cancel', act: 'add', text: 'An order is cancelled until ready.' }] },
			common: ['c-cancel']
		});
		expect(reading.shared[1]).toMatchObject({
			kind: 'table',
			hereWrites: { items: [{ id: 'f-paid', act: 'add', text: 'paid' }, { id: 'f-note', act: 'retire', text: '' }] },
			thereWrites: { items: [{ id: 'f-status', act: 'reword', text: 'state' }] },
			common: []
		});
	});

	it('writes nothing for a side that only names, uses or removes the element', () => {
		const removes = request('r', { drafts: [remove('feat-pickup')] });
		const touched = request('t', { leafIds: ['feat-pickup'] });
		expect(crossEvolutions(here, [removes])[0].shared[0]).toMatchObject({ hereWrites: { summary: null, items: [] }, thereWrites: null, common: [] });
		expect(crossEvolutions(touched, [here])[0].shared[0]).toMatchObject({ hereWrites: null, common: [] });
	});

	it('reads only the evolutions in progress, conflicts first, and nothing for a request no longer open', () => {
		const delivered = request('d', { drafts: [remove('feat-pickup')], stage: 'delivered', status: 'closed', specVersion: 1 });
		const idea = request('i', { leafIds: ['feat-pickup'] });
		const overlap = request('o', { drafts: [amend('feat-pickup')] });
		const conflict = request('c', { drafts: [remove('feat-pickup')] });
		const pending = request('p', { drafts: [amend('feat-elsewhere')] });
		expect(crossEvolutions(here, [here, delivered, idea, pending, overlap, conflict]).map((c) => [c.requestId, c.verdict])).toEqual([
			['c', 'conflict'],
			['o', 'overlap'],
			['p', 'spec_pending']
		]);
		expect(crossEvolutions({ ...here, status: 'closed' }, [overlap])).toEqual([]);
	});
});

describe('the concurrent impact of evolutions picked [criterion:f70b2e9f]', () => {
	const a = request('a', { drafts: [amend('f1')] });
	const b = request('b', { drafts: [remove('f1')] });
	const c = request('c', { drafts: [amend('f2')], specVersion: 1 });
	const d = request('d', { drafts: [amend('f3')], specVersion: 1 });

	it('reads several against each other, each pair once, conflicts first', () => {
		const { pairs } = concurrentImpact([c, a, b], [a, b, c, d]);
		expect(pairs.map((p) => [p.hereId, p.reading.requestId])).toEqual([['a', 'b'], ['c', 'a'], ['c', 'b']]);
		expect(pairs[0].reading.verdict).toBe('conflict');
	});

	it('reads one alone against every other evolution in progress', () => {
		const { pairs } = concurrentImpact([a], [a, b, c, d]);
		expect(pairs.map((p) => p.reading.requestId).sort()).toEqual(['b', 'c', 'd']);
		expect(pairs.every((p) => p.hereId === 'a')).toBe(true);
	});
});

describe('the concurrent impact says what it cannot compare [criterion:0922523f]', () => {
	const a = request('a', { drafts: [amend('f1')] });
	const b = request('b', { drafts: [amend('f2')] });
	const empty = request('e');
	const cancelled = request('x', { status: 'cancelled' });

	it('names a picked evolution with nothing drafted, and keeps it out of the pairs', () => {
		const report = concurrentImpact([a, b, empty], [a, b, empty]);
		expect(report.undrafted.map((r) => r.id)).toEqual(['e']);
		expect(report.pairs.flatMap((p) => [p.hereId, p.reading.requestId])).not.toContain('e');
	});

	it('reads nothing for an evolution picked alone with nothing drafted', () => {
		expect(concurrentImpact([empty], [a, empty]).pairs).toEqual([]);
	});

	it('names the other open evolutions in that case when one is read against the rest, never a closed one', () => {
		expect(concurrentImpact([a], [a, empty, cancelled]).undrafted.map((r) => r.id)).toEqual(['e']);
	});
});
