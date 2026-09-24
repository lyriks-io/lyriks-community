import { describe, expect, it } from 'vitest';
import {
	ALL_ROWS,
	dossierFieldRows,
	fieldsPart,
	proposalsPart,
	readingsPart,
	requestSummary,
	filledInlineKeys,
	proposedKinds,
	inheritanceOf,
	type EvolutionView
} from './evolution-view.server';
import {
	createDraftLeaf,
	createEvolutionRequest,
	createProposal,
	type Actor,
	type EvolutionRequest
} from '$domain/evolution';
import { createEmptyFeaturesDraft, createFeature } from '$domain/features';

/**
 * What an answer costs a reader.
 *
 * A dossier holds one row per field per touched feature: the fields, the
 * readings and the proposals all grow the same way, so a request touching
 * twenty features used to answer twenty times a one-feature request and blew
 * the result cap an agent runtime reads through. What these tests pin: the
 * summary counts those lists instead of carrying them, so it is the same size
 * whatever the request touches, and each list is read on its own, narrowed to
 * one feature and paged.
 */

const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };

const leafId = (n: number) => `leaf-${n}`;

function viewWith(leaves: number): { view: EvolutionView; request: EvolutionRequest } {
	const features = createEmptyFeaturesDraft('proj');
	for (let n = 0; n < leaves; n++) {
		features.features.push(createFeature('core', null, { id: leafId(n), name: `Feature ${n}` }));
	}
	const request = createEvolutionRequest({
		id: 'req-1',
		title: 'Offer a gift wrap at checkout',
		stage: 'specification',
		leafIds: Array.from({ length: leaves }, (_, n) => leafId(n))
	});
	const view: EvolutionView = {
		projectId: 'proj',
		draft: { projectId: 'proj', requests: [request], lastSavedAt: null },
		features,
		leaves: features.features.map((f) => ({ id: f.id, name: f.name })),
		sources: [],
		glossaryTerms: [],
		productName: 'Test',
		revision: 1,
		held: {},
		coverage: {},
		filled: {},
		trlByLeaf: {},
		readings: {
			'req-1': features.features.map((f) => ({
				key: `01-origin.objective|${f.id}`,
				fieldPath: '01-origin.objective',
				leafId: f.id,
				filled: false,
				summary: `nothing authored on ${f.name} yet`,
				names: [],
				moving: []
			}))
		},
		members: []
	};
	return { view, request };
}

describe('a dossier summary is the same size whatever the request touches', () => {
	it('counts the fields, the readings and the proposals instead of listing them', () => {
		const { view, request } = viewWith(3);
		const summary = requestSummary(view, request, person);

		expect(summary.fields.total).toBe(dossierFieldRows(view, request).length);
		expect(summary.fields.total).toBeGreaterThan(0);
		expect(summary.readings.total).toBe(3);
		expect(summary.proposals.pending).toBe(0);
		// The lists themselves are one part away.
		expect(Array.isArray(summary.fields)).toBe(false);
		expect(Array.isArray(summary.readings)).toBe(false);
		expect(Array.isArray(summary.proposals)).toBe(false);
	});

	it('stays far under the answer cap, where the rows alone would blow it', () => {
		const one = viewWith(1);
		const twenty = viewWith(20);
		const sizeOf = (v: typeof one) => JSON.stringify(requestSummary(v.view, v.request, person)).length;
		const rowsOf = (v: typeof one) =>
			JSON.stringify(fieldsPart(v.view, v.request, { limit: ALL_ROWS }).fields.entries).length;

		// What still grows is the index of touched features, which is what a
		// reader needs in order to ask for the rest: about a hundred bytes each,
		// where a row costs that much per field per feature.
		expect(sizeOf(twenty) - sizeOf(one)).toBeLessThan(3000);
		expect(sizeOf(twenty)).toBeLessThan(10_000);
		expect(rowsOf(twenty)).toBeGreaterThan(sizeOf(twenty));
		expect(dossierFieldRows(twenty.view, twenty.request).length).toBeGreaterThan(
			dossierFieldRows(one.view, one.request).length * 10
		);
	});
});

describe('every list of a dossier is read on its own', () => {
	it('narrows the fields to one touched feature', () => {
		const { view, request } = viewWith(4);
		const all = fieldsPart(view, request);
		const one = fieldsPart(view, request, { leaf: leafId(2) });

		expect(one.fields.total).toBe(all.fields.total);
		expect(one.fields.matched).toBeLessThan(all.fields.matched);
		expect(one.fields.entries.every((f) => f.leafId === leafId(2))).toBe(true);
		expect(one.fields.leaf).toBe(leafId(2));
	});

	it('pages the fields and says what it did not return', () => {
		const { view, request } = viewWith(4);
		const page = fieldsPart(view, request, { offset: 2, limit: 3 });

		expect(page.fields.entries).toHaveLength(3);
		expect(page.fields.offset).toBe(2);
		expect(page.fields.limit).toBe(3);
		expect(page.fields.matched).toBeGreaterThan(3);
	});

	it('narrows and pages the readings the same way', () => {
		const { view, request } = viewWith(4);
		const all = readingsPart(view, request);
		const one = readingsPart(view, request, { leaf: leafId(1) });

		expect(all.readings.total).toBe(4);
		expect(one.readings.matched).toBe(1);
		expect(one.readings.entries[0].leafId).toBe(leafId(1));
		expect(readingsPart(view, request, { limit: 2 }).readings.entries).toHaveLength(2);
	});

	it('narrows the proposals to one touched feature', () => {
		const { view, request } = viewWith(3);
		const withProposals: EvolutionRequest = {
			...request,
			proposals: [0, 1].map((n) =>
				createProposal({
					id: `prop-${n}`,
					targetField: '01-origin.objective',
					canonicalPath: `features.leafMeta.${leafId(n)}.objective`,
					value: 'A value',
					reasoning: 'READ from the interview; INFERRED nothing.',
					decision: 'pending'
				})
			)
		};
		const one = proposalsPart(view, withProposals, person, { leaf: leafId(0) });

		expect(one.proposals.total).toBe(2);
		expect(one.proposals.matched).toBe(1);
		expect(one.proposals.entries[0].id).toBe('prop-0');
	});
});

/**
 * A draft's own values count as filled.
 *
 * Proven on the studio on 2026-09-23: a draft opened with a problem, a value and
 * acceptance criteria still reported four critical fields empty, because the
 * count read only the owning section. So the maturity understated what had been
 * written, and a person was asked to sign values that already existed.
 */
describe('filled fields include the ones the draft carries', () => {
	const features = createEmptyFeaturesDraft('p1');

	it('counts a value typed on the draft, with nothing written in the section', () => {
		const request = createEvolutionRequest({
			id: 'r1',
			leafIds: ['draft:d1'],
			drafts: [
				createDraftLeaf({
					id: 'draft:d1',
					kind: 'add',
					name: 'Rappel',
					objective: 'Typed on the draft.',
					acceptanceCriteria: [{ id: 'c1', text: 'Une ligne verifiable.' }]
				})
			]
		});
		const keys = filledInlineKeys(features, request);
		expect(keys).toContain('01-origin.objective@draft:d1');
		expect(keys).toContain('05-functional.acceptance@draft:d1');
		expect(keys).not.toContain('02-problem.statement@draft:d1');
	});

	it('still reads the owning section first, so a signed value is what counts', () => {
		const request = createEvolutionRequest({
			id: 'r2',
			leafIds: ['draft:d2'],
			drafts: [createDraftLeaf({ id: 'draft:d2', kind: 'add', name: 'Rappel' })]
		});
		const signed = {
			...features,
			leafMeta: { 'draft:d2': { objective: 'Signed in the section.' } }
		};
		expect(filledInlineKeys(signed, request)).toContain('01-origin.objective@draft:d2');
	});
});

/**
 * Reported from the screen on 2026-09-24 (request 9c15b7d2): an acceptance
 * criterion was displayed cut in mid-word, ending in three dots, because the page
 * was served the excerpt a tool answer needs.
 */
describe('excerpting is the caller decision, not the reading', () => {
	const long = 'x'.repeat(400);
	const longValue = () => {
		const { view, request } = viewWith(1);
		view.features.leafMeta = { [leafId(0)]: { objective: long } };
		return { view, request };
	};

	it('shortens by default, so a tool answer stays one size', () => {
		const { view, request } = longValue();
		const objective = dossierFieldRows(view, request).find((r) => r.path === '01-origin.objective');
		expect(objective?.value.endsWith('...')).toBe(true);
		expect(objective?.value.length).toBeLessThan(long.length);
	});

	it('gives the value whole when the caller asks for it', () => {
		const { view, request } = longValue();
		const objective = dossierFieldRows(view, request, { excerpt: false }).find(
			(r) => r.path === '01-origin.objective'
		);
		expect(objective?.value).toBe(long);
	});
});

/**
 * One row per touched FEATURE.
 *
 * A request holds both sides of an amendment internally, because the readings
 * start from what is proposed and have to reach what rests on the leaf. A
 * person must never be shown that twice: two rows of the same name, one of them
 * empty, read as two features, they ask the same five questions twice, and they
 * count the same hole twice in the maturity.
 */
describe('a touched feature is read once, whichever side of it the request holds', () => {
	const withDrafts = (base: EvolutionRequest): EvolutionRequest => {
		const amend = createDraftLeaf({
			id: 'draft:amend',
			kind: 'amend',
			baseLeafId: leafId(0),
			name: 'Feature 0, amended'
		});
		const add = createDraftLeaf({ id: 'draft:add', kind: 'add', name: 'A capability that does not exist' });
		return { ...base, drafts: [amend, add], leafIds: [amend.id, leafId(0), add.id, leafId(1)] };
	};

	it('folds an amendment onto the leaf it stands for, and keeps an addition of its own', () => {
		const { view, request } = viewWith(2);
		const summary = requestSummary(view, withDrafts(request), person);

		expect(summary.leaves.map((l) => l.id)).toEqual([leafId(0), 'draft:add', leafId(1)]);
		expect(summary.leaves.map((l) => l.name)).toEqual([
			'Feature 0, amended',
			'A capability that does not exist',
			'Feature 1'
		]);
		// What the request would do to each one, so a feature that exists is never
		// read as a proposal, nor a proposal as a feature that exists.
		expect(summary.leaves.map((l) => l.change)).toEqual(['amend', 'add', null]);
		expect(summary.leaves.map((l) => l.drafted)).toEqual([false, true, false]);
	});

	it('asks the five questions once per feature, not once per side', () => {
		const { view, request } = viewWith(2);
		const drafted = withDrafts(request);
		const rows = dossierFieldRows(view, drafted);

		expect([...new Set(rows.map((r) => r.leafId))]).toEqual([leafId(0), 'draft:add', leafId(1)]);
		// The answers of an amended feature are the ones the leaf already holds,
		// which is where the freeze patches them: never an empty second set.
		expect(rows.some((r) => r.leafId === 'draft:amend')).toBe(false);
	});
});

/**
 * The impact report is ONE reading, derived from what the request proposes.
 *
 * Reported from the screen on 2026-09-24 (request d17092da): three columns, "if
 * we add it / change it / remove it", on a request that had already declared
 * what it does. On a request that both adds and amends, none of the three
 * described it, and the reader was asked to redo an arbitration the dossier had
 * already made.
 */
describe('the verb of a row comes from the draft that stands for it', () => {
	const requestWith = (drafts: Parameters<typeof createDraftLeaf>[0][]) =>
		createEvolutionRequest({ id: 'r', drafts: drafts.map((d) => createDraftLeaf(d)) });

	it('reads an amendment as a change and an addition as an addition, on the same request', () => {
		const { byLeaf, main } = proposedKinds(
			requestWith([
				{ id: 'draft:new', kind: 'add', name: 'Une capacite neuve' },
				{ id: 'draft:amended', kind: 'amend', baseLeafId: 'feat-existing', name: 'Existante' }
			])
		);
		expect(byLeaf['draft:new']).toBe('add');
		expect(byLeaf['draft:amended']).toBe('change');
		// The feature an amendment stands for reads with the draft's verb.
		expect(byLeaf['feat-existing']).toBe('change');
		// A mixed request does something overall, and it is not "all three".
		expect(main).toBe('add');
	});

	it('lets a removal set what the request does overall, being the most consequential', () => {
		const { main } = proposedKinds(
			requestWith([
				{ id: 'draft:gone', kind: 'remove', baseLeafId: 'feat-old', name: 'Retiree' },
				{ id: 'draft:new', kind: 'add', name: 'Neuve' }
			])
		);
		expect(main).toBe('remove');
	});

	it('reads a request that drafts nothing as a change', () => {
		const { byLeaf, main } = proposedKinds(createEvolutionRequest({ id: 'r2', leafIds: ['feat-a'] }));
		expect(main).toBe('change');
		expect(Object.keys(byLeaf)).toHaveLength(0);
	});
});

/**
 * Where a person acts, as a link.
 *
 * Whoever tells a person that something waits on them hands over the place
 * itself: every row a person acts on carries the address of the page opening
 * on it, relative to the installation (the MCP server makes it whole).
 */
describe('every place a person acts on carries the address that opens on it', () => {
	const at = (href: string) => new URL(href, 'http://x').searchParams.get('at');

	it('points a field waiting for a signature at its proposal, and an unanswered one at itself', () => {
		const { view, request } = viewWith(2);
		const withProposal: EvolutionRequest = {
			...request,
			proposals: [
				createProposal({
					id: 'prop-0',
					targetField: '01-origin.objective',
					canonicalPath: `features.leafMeta.${leafId(0)}.objective`,
					value: 'A value',
					reasoning: 'READ from the interview; INFERRED nothing.',
					decision: 'pending'
				})
			]
		};
		const rows = dossierFieldRows(view, withProposal);
		const signing = rows.find((r) => r.leafId === leafId(0) && r.path === '01-origin.objective')!;
		const open = rows.find((r) => r.leafId === leafId(1) && r.path === '01-origin.objective')!;
		expect(signing.href.startsWith('/projects/proj/features?tab=evolution&request=req-1')).toBe(true);
		expect(at(signing.href)).toBe('proposal__prop-0');
		expect(at(open.href)).toBe(`field__${leafId(1)}__01-origin.objective`);
	});

	it('gives each proposal, the first one waiting and the next gate their own address', () => {
		const { view, request } = viewWith(1);
		const withProposal: EvolutionRequest = {
			...request,
			proposals: [
				createProposal({
					id: 'prop-9',
					targetField: '02-problem.value',
					canonicalPath: `features.leafMeta.${leafId(0)}.value`,
					value: 'Worth it',
					reasoning: 'READ from the interview; INFERRED nothing.',
					decision: 'pending'
				})
			]
		};
		const part = proposalsPart(view, withProposal, person);
		expect(at(part.proposals.entries[0].href)).toBe('proposal__prop-9');
		const summary = requestSummary(view, withProposal, person);
		expect(summary.href).toBe('/projects/proj/features?tab=evolution&request=req-1');
		expect(at(summary.proposals.href!)).toBe('proposal__prop-9');
		expect(at(summary.gate.href)).toBe('next-step');
	});

	it('has no first proposal to point at when nothing waits', () => {
		const { view, request } = viewWith(1);
		expect(requestSummary(view, request, person).proposals.href).toBeNull();
	});
});

/**
 * 2a9716f2: a value the request inherited from a feature it touches is shown as
 * a reading of that feature, never as an answer this request gave. On a
 * complete product the maturity read 43 while nothing of the change had been
 * decided at all.
 */
describe('the maturity says how much of what it counts was inherited', () => {
	it('tells a value the feature already held from one given in this request', () => {
		const { view, request } = viewWith(1);
		view.features.leafMeta = {
			[leafId(0)]: { objective: 'Held by the feature before the request.', problem: 'Typed on the dossier.' }
		};
		const answered = { ...request, answeredKeys: [`02-problem.statement@${leafId(0)}`] };
		expect(inheritanceOf(view.features, answered)).toEqual({ answeredHere: 1, inherited: 1 });
		expect(inheritanceOf(view.features, request)).toEqual({ answeredHere: 0, inherited: 2 });
	});
});
