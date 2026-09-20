import { describe, expect, it } from 'vitest';
import {
	ALL_ROWS,
	dossierFieldRows,
	fieldsPart,
	proposalsPart,
	readingsPart,
	requestSummary,
	type EvolutionView
} from './evolution-view.server';
import { createEvolutionRequest, createProposal, type Actor, type EvolutionRequest } from '$domain/evolution';
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
