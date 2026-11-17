import type { Finding, FindingKind } from '$domain/retrospec';
import { POINT_ORIGIN_LABEL, POINT_ORIGINS, type PointOrigin } from '$domain/coherence';
import { findingsSettledByRequests, liveFindingDrafts, requestKeyOf, requestPagePath, type EvolutionRequest } from '$domain/evolution';

/**
 * What Lyriks noticed, as the Overview lists it (criteria 14be32d5,
 * e0f69b3c): every point with where its decision stands, rejected (an issue
 * kept as it is), sent to Evolutions (named by a live request) or still to
 * review, what can still be decided on it, and how many are left. Pure.
 */

export type NoticedState = 'pending' | 'rejected' | 'sent';

export interface NoticedRequest {
	readonly id: string;
	/** "EVO-012", which the line reads (criterion d204c2f2). */
	readonly key: string;
	/** Its title, said on hover. */
	readonly title: string;
	/** How many other points it carries: many lines sent to one request read as one request. */
	readonly others: number;
	readonly href: string;
	/**
	 * It holds nothing but this point, as the Overview opened it: Undo cancels it
	 * rather than leaving an empty request on the board.
	 */
	readonly solo: boolean;
	/** The point's ids this request names: what Undo takes off it. */
	readonly findingIds: readonly string[];
	/** Undo can still take the point back: the request it would cancel is open, or the one it would leave is not frozen. */
	readonly undoable: boolean;
}

export interface NoticedPoint {
	readonly finding: Finding;
	readonly state: NoticedState;
	/** Reject is offered: an issue of the rules register that blocks nothing, still to review. */
	readonly canReject: boolean;
	/** New evolution is offered: a point Project health lists, still to review. */
	readonly canEvolve: boolean;
	/** The live request that settles it, once sent. */
	readonly request: NoticedRequest | null;
}

/** What the Overview and Notices say before the product holds its first feature (criterion 01761816). */
export const NOTICED_WAITS_FOR_FEATURE = 'Lyriks starts checking once the product holds its first feature.';

export interface NoticedView {
	readonly points: readonly NoticedPoint[];
	readonly total: number;
	readonly pending: number;
	readonly settled: number;
	/** Of the points still to review. */
	readonly major: number;
	readonly minor: number;
	/** The requests picked points can be added to (criterion 3f977777): still open to changes, newest first. */
	readonly targets: readonly NoticedTarget[];
	/**
	 * The issues whose fix waits for confirmation (criterion 2a55c3e7): listed
	 * apart under Fix to confirm, in none of the counts above.
	 */
	readonly toConfirm: readonly NoticedPoint[];
}

/** The key the address of Health names the fixes to confirm by (`?type=fix-to-confirm`), as it names a type. */
export const FIX_TO_CONFIRM_KEY = 'fix-to-confirm';
export const FIX_TO_CONFIRM_LABEL = 'Fix to confirm';
export const FIX_TO_CONFIRM_MEANING =
	'Issues whose fix is written and waits for someone to confirm the product now does it. They count nothing in the health until then: confirm the fix and the issue is resolved, reopen it and it waits for review again. Finishing the project still needs them resolved.';

/** "3 fixes to confirm". */
export const fixesWord = (n: number) => `${n} ${n === 1 ? 'fix' : 'fixes'} to confirm`;

/** Where the problem lies, as the filter beside the severity narrows to it (criterion c86ea441). */
export type OriginFilter = 'all' | PointOrigin;
export const ORIGIN_FILTERS: readonly { readonly key: OriginFilter; readonly label: string }[] = [
	{ key: 'all', label: 'Everywhere' },
	...POINT_ORIGINS.map((origin) => ({ key: origin, label: POINT_ORIGIN_LABEL[origin] }))
];

/** Whether a point shows under the origin picked; a point that names none reads as the specification's. */
export function showsUnder(point: NoticedPoint, origin: OriginFilter): boolean {
	return origin === 'all' || (point.finding.origin ?? 'specification') === origin;
}

/** An evolution request that still takes points: neither frozen, closed, cancelled nor deleted. */
export interface NoticedTarget {
	readonly id: string;
	readonly key: string;
	readonly title: string;
	readonly href: string;
}

/** Whether a request still takes the points of What Lyriks noticed (action Add findings to a request). */
export function takesFindings(request: EvolutionRequest): boolean {
	return request.status === 'open' && !request.frozen;
}

/** One type of point, as What Lyriks noticed groups them (criterion 4996a6b4). */
export interface NoticedGroup {
	readonly kind: FindingKind;
	/** Its points, in the order the list holds them: the heaviest first. */
	readonly points: readonly NoticedPoint[];
	readonly major: number;
	readonly minor: number;
}

/**
 * The points grouped by type, the type holding the heaviest point first (the
 * list comes heaviest first, so a type stands where its first point stood).
 * The meaning is the first point's: one type reads one way.
 */
export function noticedGroups(points: readonly NoticedPoint[]): NoticedGroup[] {
	const byLabel = new Map<string, { kind: FindingKind; points: NoticedPoint[] }>();
	for (const point of points) {
		const kind = point.finding.kind;
		const group = byLabel.get(kind.label);
		if (group) group.points.push(point);
		else byLabel.set(kind.label, { kind, points: [point] });
	}
	return [...byLabel.values()].map((g) => {
		const major = g.points.filter((p) => p.finding.tone === 'major').length;
		return { ...g, major, minor: g.points.length - major };
	});
}

/** A type's key in the address of the page What Lyriks noticed (`?type=dead-end`). */
export function noticedTypeKey(label: string): string {
	return (
		label
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'other'
	);
}

/** One line of the Overview's summary of What Lyriks noticed: a type, how many points it holds, how many major. */
export interface NoticedTypeLine {
	readonly key: string;
	readonly label: string;
	readonly meaning: string;
	readonly count: number;
	readonly major: number;
}

/** What the Overview reads of What Lyriks noticed, its list on a page of its own (criterion 55a7fe86). */
export interface NoticedSummary {
	readonly total: number;
	readonly pending: number;
	readonly settled: number;
	/** Of the points still to review. */
	readonly major: number;
	readonly minor: number;
	/** One line per type, the type holding the heaviest point first, counted as the page groups them. */
	readonly types: readonly NoticedTypeLine[];
	/** How many fixes wait for confirmation, counted apart (criterion e75b8909). */
	readonly toConfirm: number;
}

export function noticedSummary(view: NoticedView): NoticedSummary {
	return {
		toConfirm: view.toConfirm.length,
		total: view.total,
		pending: view.pending,
		settled: view.settled,
		major: view.major,
		minor: view.minor,
		types: noticedGroups(view.points).map((g) => ({
			key: noticedTypeKey(g.kind.label),
			label: g.kind.label,
			meaning: g.kind.meaning,
			count: g.points.length,
			major: g.major
		}))
	};
}

/** The stage a request opened on findings stands in until someone moves it on. */
const OPENED_STAGE = 'specification';

/** A request that settles these points and holds nothing else yet, as one opened on them from the Overview. */
function holdsOnly(request: EvolutionRequest, gapIds: readonly string[]): boolean {
	const findings = liveFindingDrafts(request.findingDrafts);
	return (
		request.stage === OPENED_STAGE &&
		findings.length > 0 &&
		findings.every((d) => gapIds.includes(d.findingId)) &&
		request.drafts.length === 0 &&
		request.dataDrafts.length === 0 &&
		request.sectionDrafts.length === 0 &&
		request.ruleDrafts.length === 0
	);
}

export function noticedView(input: {
	/** The points still open, as What Lyriks noticed reads them. */
	readonly open: readonly Finding[];
	/** The issues rejected from the Overview (keptIssueFindings). */
	readonly kept: readonly Finding[];
	/** The issues whose fix waits for confirmation (fixToConfirmFindings). */
	readonly toConfirm?: readonly Finding[];
	readonly requests: readonly EvolutionRequest[];
	readonly projectId: string;
}): NoticedView {
	const settledBy = findingsSettledByRequests(input.requests);
	const requestOf = (finding: Finding): NoticedRequest | null => {
		const gapIds = finding.gapIds ?? [];
		const found = gapIds.map((id) => settledBy.get(id)).find((r) => !!r);
		const request = found ? input.requests.find((r) => r.id === found.id) : undefined;
		if (!request) return null;
		const named = new Set(liveFindingDrafts(request.findingDrafts).map((d) => d.findingId));
		const solo = holdsOnly(request, gapIds);
		const findingIds = gapIds.filter((id) => named.has(id));
		return {
			id: request.id,
			key: requestKeyOf(input.requests, request.id) ?? 'Evolution',
			title: request.title.trim(),
			others: named.size - findingIds.length,
			href: requestPagePath(input.projectId, request.id),
			solo,
			findingIds,
			undoable: request.status === 'open' && (solo || !request.frozen)
		};
	};
	const open = input.open.map((finding): NoticedPoint => {
		const request = requestOf(finding);
		const pending = !request;
		return {
			finding,
			state: request ? 'sent' : 'pending',
			canReject: pending && !!finding.decision && !finding.unconfirmed && !finding.blocking,
			canEvolve: pending && (finding.gapIds?.length ?? 0) > 0,
			request
		};
	});
	const kept = input.kept.map((finding): NoticedPoint => ({ finding, state: 'rejected', canReject: false, canEvolve: false, request: null }));
	// Major first, each keeping the order it was read in: a point rejected stays among its peers.
	const all = [...open, ...kept];
	const points = [...all.filter((p) => p.finding.tone === 'major'), ...all.filter((p) => p.finding.tone !== 'major')];
	const waiting = points.filter((p) => p.state === 'pending');
	// Newest first: the request opened last is the one a reader is most likely composing.
	const targets = [...input.requests]
		.reverse()
		.filter(takesFindings)
		.map((r) => ({ id: r.id, key: requestKeyOf(input.requests, r.id) ?? 'Evolution', title: r.title.trim(), href: requestPagePath(input.projectId, r.id) }));
	// Neither rejected nor sent to a change: a fix is confirmed or reopened (criterion 2a55c3e7).
	const toConfirm = (input.toConfirm ?? []).map((finding): NoticedPoint => ({ finding, state: 'pending', canReject: false, canEvolve: false, request: null }));
	return {
		toConfirm,
		targets,
		points,
		total: points.length,
		pending: waiting.length,
		settled: points.length - waiting.length,
		major: waiting.filter((p) => p.finding.tone === 'major').length,
		minor: waiting.filter((p) => p.finding.tone !== 'major').length
	};
}
