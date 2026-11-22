import type { EvolutionRequest } from './draft';
import { touchedLeafIds } from './draft';
import { isEvolutionInProgress } from './lifecycle';
import { usedFeatures } from './used-features';

/**
 * How a request reads against the other evolutions of its project that are in
 * progress: what both of them touch, and whether that is a problem.
 *
 * Read from what each request declares: the features it amends or removes (its
 * drafts and the features it names as touched), the features its diagrams use
 * as they stand, and the existing tables its data changes amend or remove. A
 * feature or a table a request adds is its own and cannot be shared, so it only
 * appears in what that request changes.
 *
 * - a CONFLICT when one removes what the other amends or uses;
 * - an OVERLAP when both change the same feature or table, with what each
 *   writes into it and the rules or fields both write;
 * - COMPATIBLE when they share nothing and the other's spec is frozen;
 * - SPEC PENDING when they share nothing yet and the other has no frozen
 *   version: what it declares can still grow, so it is not checked yet.
 *
 * Computed on read, nothing persisted: a request that freezes is read as
 * compatible the next time the page is opened.
 */
export const CROSS_VERDICTS = ['conflict', 'overlap', 'compatible', 'spec_pending'] as const;
export type CrossVerdict = (typeof CROSS_VERDICTS)[number];

/** What a request does to an element: a use is read, never a change. */
export type CrossChange = 'amend' | 'remove' | 'use';
export type CrossElementKind = 'feature' | 'table';

/** One rule of a feature, or one field of a table, that a request writes. */
export interface CrossItem {
	readonly id: string;
	readonly act: 'add' | 'reword' | 'retire';
	/** What it reads once written: the rule's text, the field's name; '' when retired or left as is. */
	readonly text: string;
}

/**
 * What a request writes into an element it amends, read from its drafts, so
 * the two sides of an overlap can be told apart: "both change it" says
 * nothing a person can act on.
 */
export interface CrossWrites {
	/** The change in the request's own sentence, when it wrote one. */
	readonly summary: string | null;
	readonly items: readonly CrossItem[];
}

/** One element both requests touch, with what each does to it. */
export interface CrossElement {
	readonly kind: CrossElementKind;
	readonly id: string;
	/** What the request read here does to it. */
	readonly here: CrossChange;
	/** What the other request does to it. */
	readonly there: CrossChange;
	/** One of the two removes what the other changes or uses. */
	readonly conflict: boolean;
	/** What each side writes into it; null on a use, a removal, or an element only named as touched. */
	readonly hereWrites: CrossWrites | null;
	readonly thereWrites: CrossWrites | null;
	/** The rules or fields both sides write: the one place two amendments can contradict. */
	readonly common: readonly string[];
}

/** One thing the other request changes: an existing element by id, one of its own by its name. */
export interface CrossTouch {
	readonly kind: CrossElementKind;
	readonly id: string;
	readonly change: 'add' | 'amend' | 'remove';
	/** The name a request gives what it adds; null for an existing element, named by whoever reads it. */
	readonly name: string | null;
}

export interface CrossReading {
	readonly requestId: string;
	readonly verdict: CrossVerdict;
	/** Only the elements behind a conflict or an overlap. */
	readonly shared: readonly CrossElement[];
	/** Everything the other request changes, so a compatible one says what it shares nothing on. */
	readonly theirs: readonly CrossTouch[];
}

type Footprint = Record<CrossElementKind, Map<string, CrossChange>>;

/** What a request touches, the strongest act winning: a removal over an amendment over a use. */
function footprintOf(request: EvolutionRequest): Footprint {
	const features = new Map<string, CrossChange>();
	const added = new Set(request.drafts.filter((d) => d.kind === 'add').map((d) => d.id));
	for (const used of usedFeatures(request)) features.set(used.featureId, 'use');
	for (const id of touchedLeafIds(request)) if (!added.has(id)) features.set(id, 'amend');
	for (const draft of request.drafts) {
		if (draft.kind === 'add' || !draft.baseLeafId) continue;
		features.set(draft.baseLeafId, draft.kind === 'remove' ? 'remove' : 'amend');
	}
	const tables = new Map<string, CrossChange>();
	for (const data of request.dataDrafts) {
		if (data.kind === 'add' || !data.entityId) continue;
		tables.set(data.entityId, data.kind === 'remove' ? 'remove' : 'amend');
	}
	return { feature: features, table: tables };
}

function changesOf(request: EvolutionRequest, footprint: Footprint): CrossTouch[] {
	const existing = (kind: CrossElementKind): CrossTouch[] =>
		[...footprint[kind]].flatMap(([id, change]) => (change === 'use' ? [] : [{ kind, id, change, name: null }]));
	return [
		...request.drafts.filter((d) => d.kind === 'add').map((d) => ({ kind: 'feature' as const, id: d.id, change: 'add' as const, name: d.name })),
		...existing('feature'),
		...request.dataDrafts.filter((d) => d.kind === 'add').map((d) => ({ kind: 'table' as const, id: d.id, change: 'add' as const, name: d.name })),
		...existing('table')
	];
}

/** The rules a request writes into a feature it amends, or the fields into a table; null when no draft says. */
function writesOf(request: EvolutionRequest, kind: CrossElementKind, id: string): CrossWrites | null {
	if (kind === 'feature') {
		const drafts = request.drafts.filter((d) => d.kind === 'amend' && d.baseLeafId === id);
		if (drafts.length === 0) return null;
		return {
			summary: drafts.map((d) => d.changeSummary?.trim() ?? '').find((s) => s !== '') ?? null,
			items: drafts.flatMap((d): CrossItem[] => [
				...d.acceptanceCriteria.map((c) => ({ id: c.id, act: 'add' as const, text: c.text })),
				...(d.changeCriteria ?? []).map((c) => ({ id: c.id, act: 'reword' as const, text: c.text })),
				...(d.retireCriteria ?? []).map((cid) => ({ id: cid, act: 'retire' as const, text: '' }))
			])
		};
	}
	const drafts = request.dataDrafts.filter((d) => d.kind === 'amend' && d.entityId === id);
	if (drafts.length === 0) return null;
	return {
		summary: null,
		items: drafts.flatMap((d): CrossItem[] => [
			...d.addFields.map((f) => ({ id: f.id, act: 'add' as const, text: f.name })),
			...d.changeFields.map((f) => ({ id: f.fieldId, act: 'reword' as const, text: f.name ?? '' })),
			...d.removeFields.map((fid) => ({ id: fid, act: 'retire' as const, text: '' }))
		])
	};
}

function sharedBetween(here: Footprint, there: Footprint, mineOf: EvolutionRequest, theirsOf: EvolutionRequest): CrossElement[] {
	const shared: CrossElement[] = [];
	for (const kind of ['feature', 'table'] as const) {
		for (const [id, mine] of here[kind]) {
			const theirs = there[kind].get(id);
			if (!theirs) continue;
			const conflict = (mine === 'remove') !== (theirs === 'remove');
			const bothChange = mine !== 'use' && theirs !== 'use';
			if (!conflict && !bothChange) continue;
			const hereWrites = mine === 'amend' ? writesOf(mineOf, kind, id) : null;
			const thereWrites = theirs === 'amend' ? writesOf(theirsOf, kind, id) : null;
			const theirIds = new Set(thereWrites?.items.map((i) => i.id) ?? []);
			const common = [...new Set((hereWrites?.items ?? []).map((i) => i.id).filter((i) => theirIds.has(i)))];
			shared.push({ kind, id, here: mine, there: theirs, conflict, hereWrites, thereWrites, common });
		}
	}
	return shared;
}

/**
 * What two requests both touch, read from what each declares whatever stands
 * they are at: a request that just landed is closed, yet what it wrote is what
 * the others under way are read again against (EVO-005).
 */
export function sharedWith(here: EvolutionRequest, there: EvolutionRequest): CrossElement[] {
	return sharedBetween(footprintOf(here), footprintOf(there), here, there);
}

const RANK: Record<CrossVerdict, number> = { conflict: 0, overlap: 1, compatible: 2, spec_pending: 3 };

/**
 * Every other request of the project in progress, read against `request`,
 * conflicts first, then overlaps, compatible ones and the ones not checked
 * yet, each group in the order the requests were opened. A request no longer
 * open is history: it is read against nothing.
 */
export function crossEvolutions(request: EvolutionRequest, requests: readonly EvolutionRequest[]): CrossReading[] {
	if (request.status !== 'open') return [];
	const mine = footprintOf(request);
	return requests
		.filter((other) => other.id !== request.id && isEvolutionInProgress(other))
		.map((other): CrossReading => {
			const theirs = footprintOf(other);
			const shared = sharedBetween(mine, theirs, request, other);
			const verdict: CrossVerdict = shared.some((s) => s.conflict)
				? 'conflict'
				: shared.length > 0
					? 'overlap'
					: other.specVersion > 0
						? 'compatible'
						: 'spec_pending';
			return { requestId: other.id, verdict, shared, theirs: changesOf(other, theirs) };
		})
		.sort((a, b) => RANK[a.verdict] - RANK[b.verdict]);
}

/** One pair of a report on evolutions the reader picked: `hereId` read against the other. */
export interface ConcurrentPair {
	readonly hereId: string;
	readonly reading: CrossReading;
}

export interface ConcurrentImpact {
	readonly pairs: readonly ConcurrentPair[];
	/** The open evolutions in the report's reach with no change drafted and no frozen spec: named, never silently left out (criterion 0922523f). */
	readonly undrafted: readonly EvolutionRequest[];
}

const undraftedIn = (requests: readonly EvolutionRequest[]) => requests.filter((r) => r.status === 'open' && r.drafts.length === 0 && r.specVersion === 0);

/**
 * What evolutions picked together do to each other (criterion f70b2e9f): one
 * alone is read against every other evolution in progress, several against
 * each other, each pair once, conflicts first.
 */
export function concurrentImpact(picked: readonly EvolutionRequest[], requests: readonly EvolutionRequest[]): ConcurrentImpact {
	if (picked.length === 1) {
		const [one] = picked;
		return {
			pairs: isEvolutionInProgress(one) ? crossEvolutions(one, requests).map((reading) => ({ hereId: one.id, reading })) : [],
			undrafted: undraftedIn(requests)
		};
	}
	const comparable = picked.filter(isEvolutionInProgress);
	const pairs = comparable.flatMap((here, i) => crossEvolutions(here, comparable.slice(i + 1)).map((reading) => ({ hereId: here.id, reading })));
	return { pairs: [...pairs].sort((a, b) => RANK[a.reading.verdict] - RANK[b.reading.verdict]), undrafted: undraftedIn(picked) };
}
