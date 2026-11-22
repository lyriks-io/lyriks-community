import type { Actor, EvolutionRequest } from './draft';
import { crossEvolutions, sharedWith, type CrossReading } from './cross-evolutions';
import { ALLOW, firstRefusal, guard, type Guarded, type Refused } from './guard';
import { record } from './history';
import { requestKeyOf } from './request-ref';

/**
 * Concurrent requests (EVO-005): which of two requests under way that share a
 * feature or a table lands first, what a person decided on a pair, and what a
 * request is told when another one lands on what it shares.
 *
 * Like a merge, the first request to land writes freely; the others are read
 * again on the specification as it then stands, so what no longer applies is
 * met before their build instead of at their own landing.
 */

/** A person's decision on a pair of overlapping requests, kept on both of them. */
export interface PairDecision {
	/** The other request of the pair. */
	readonly requestId: string;
	/** An order a person set (it decides a conflict), or a conflict accepted as a risk. */
	readonly kind: 'order' | 'risk';
	/** Why the risk is acceptable; empty on an order. */
	readonly reason: string;
	readonly by: string;
	readonly at: string;
}

/** Another request that landed on what this one shares (action d632b48b). */
export interface OtherLanding {
	readonly requestId: string;
	readonly key: string;
	readonly title: string;
	/** What both share, as the cross reading names it. */
	readonly featureIds: readonly string[];
	readonly tableIds: readonly string[];
	readonly at: string;
}

/** How many landings a request keeps: the Simulation names the last ones, the history keeps every one. */
export const OTHER_LANDINGS_KEPT = 10;

/** Where another request stands in the order, read from one request: it lands before it, after it, or no order is set. */
export type LandingOrder = 'before' | 'after' | null;

export interface OrderContext {
	readonly actor: Actor;
	readonly at: string;
	readonly newId: () => string;
	/** One member in the workspace: the client carries the request on their behalf (ac-evo-req-13). */
	readonly soloWorkspace?: boolean;
}

export type OrderOutcome = { readonly ok: true; readonly requests: readonly EvolutionRequest[]; readonly summary: string } | Refused;

const underWay = (request: Pick<EvolutionRequest, 'status'>): boolean => request.status === 'open';
/** Only requests that share a feature or a table are ordered; the others land in any order (rule 64284f58). */
const overlapping = (reading: Pick<CrossReading, 'verdict'> | undefined): boolean => reading?.verdict === 'conflict' || reading?.verdict === 'overlap';
const keyOf = (requests: readonly EvolutionRequest[], request: EvolutionRequest): string => requestKeyOf(requests, request.id) ?? request.title;

/** Where `there` stands in the order, read from `here`. */
export function landingOrderOf(here: Pick<EvolutionRequest, 'id' | 'landsAfter'>, there: Pick<EvolutionRequest, 'id' | 'landsAfter'>): LandingOrder {
	if ((here.landsAfter ?? []).includes(there.id)) return 'before';
	if ((there.landsAfter ?? []).includes(here.id)) return 'after';
	return null;
}

/** The decision a person took on the pair, read on either side. */
export function pairDecisionOf(here: Pick<EvolutionRequest, 'id' | 'pairDecisions'>, there: Pick<EvolutionRequest, 'id' | 'pairDecisions'>): PairDecision | null {
	return (here.pairDecisions ?? []).find((d) => d.requestId === there.id) ?? (there.pairDecisions ?? []).find((d) => d.requestId === here.id) ?? null;
}

/**
 * The requests under way a conflict with `request` is still undecided with: one
 * removes what the other amends or uses, and nobody set the order nor accepted
 * the risk. An order the freeze set on its own decides nothing (rule 9c77aaf5).
 */
export function undecidedConflicts(request: EvolutionRequest, requests: readonly EvolutionRequest[]): EvolutionRequest[] {
	return crossEvolutions(request, requests)
		.filter((reading) => reading.verdict === 'conflict')
		.flatMap((reading) => {
			const other = requests.find((r) => r.id === reading.requestId);
			return other && !pairDecisionOf(request, other) ? [other] : [];
		});
}

/** What the freeze gate reads of the requests under way: the conflicts nobody decided, by key. */
export interface ConcurrentHold {
	readonly undecided: readonly { readonly id: string; readonly key: string }[];
}

export function concurrentHoldOf(request: EvolutionRequest, requests: readonly EvolutionRequest[]): ConcurrentHold {
	return { undecided: undecidedConflicts(request, requests).map((other) => ({ id: other.id, key: keyOf(requests, other) })) };
}

/** The freeze waits for a person on every conflict with a request under way (rule 9c77aaf5). */
export function concurrentGate(hold: ConcurrentHold | undefined): Guarded {
	const first = hold?.undecided[0];
	return guard(
		!!first,
		`A conflict with ${first?.key ?? ''} is undecided: set which lands first, or accept the risk with a reason.`,
		'Two requests where one removes what the other uses cannot both land as they are: a person decides before either is built.'
	);
}

/**
 * At the freeze, the request is set after every overlapping request under way
 * frozen before it, unless the two are already ordered (rule 360bcd3f): the
 * first one frozen lands first, until a person swaps them.
 */
export function orderAtFreeze(request: EvolutionRequest, requests: readonly EvolutionRequest[]): { readonly request: EvolutionRequest; readonly after: readonly EvolutionRequest[] } {
	const after = crossEvolutions(request, requests)
		.filter(overlapping)
		.flatMap((reading) => {
			const other = requests.find((r) => r.id === reading.requestId);
			return other && other.specVersion > 0 && landingOrderOf(request, other) === null ? [other] : [];
		});
	if (after.length === 0) return { request, after };
	return { request: { ...request, landsAfter: [...(request.landsAfter ?? []), ...after.map((r) => r.id)] }, after };
}

/** The requests `request` is set after that have not landed yet: declaring it live now lands it before its turn. */
export function beforeItsTurn(request: Pick<EvolutionRequest, 'landsAfter'>, requests: readonly EvolutionRequest[]): EvolutionRequest[] {
	const after = new Set(request.landsAfter ?? []);
	return requests.filter((r) => after.has(r.id) && underWay(r));
}

/** The refusal of a landing before its turn without a reason (rule a05d347f). */
export function beforeItsTurnGate(ahead: readonly EvolutionRequest[], requests: readonly EvolutionRequest[], reason: string): Guarded {
	const keys = ahead.map((r) => keyOf(requests, r)).join(', ');
	return guard(
		ahead.length > 0 && reason.trim() === '',
		`${keys} lands before this one: say why you declare it live first.`,
		'The order a team set is kept, or departed from on purpose: landing first is a decision with its reason. Send outOfOrderReason with the declaration.'
	);
}

/** The line a landing out of order leaves in the history, with the reason given, or the merge that did it. */
export function withLandingOutOfOrder(
	ctx: OrderContext,
	request: EvolutionRequest,
	ahead: readonly EvolutionRequest[],
	requests: readonly EvolutionRequest[],
	how: { readonly reason: string } | { readonly merge: string }
): EvolutionRequest {
	if (ahead.length === 0) return request;
	const keys = ahead.map((r) => keyOf(requests, r)).join(', ');
	const summary =
		'reason' in how
			? `Declared live before ${keys}, which it was set after: ${how.reason.trim()}`
			: `Merged before ${keys}, which it was set after${how.merge ? ` (merge ${how.merge.slice(0, 7)})` : ''}`;
	return record(request, { id: ctx.newId(), type: 'landing_order', summary, actor: ctx.actor, at: ctx.at });
}

function orderGuards(ctx: OrderContext, here: EvolutionRequest, other: EvolutionRequest | null): Guarded {
	return firstRefusal(
		// Setting an order is a decision on the project, taken by someone who may write it (rule 15a2f7c7).
		guard(ctx.actor.role === 'viewer', 'forbidden', 'A reader sees the order, not the control.'),
		guard(!other, 'The other request does not exist on this project.', 'Name it by its id or a unique prefix, as get_evolution lists the evolutions in progress.'),
		// Only requests under way are ordered (rule db7e7b63).
		guard(!underWay(here) || (!!other && !underWay(other)), 'Only a request under way is ordered.', 'A request that left the run leaves every order it was in.'),
		guard(!!other && other.id === here.id, 'A request is not ordered against itself.', 'Name the other request of the pair.')
	);
}

/** The other request of the pair as the cross reading reads it from `here`. */
const readingOf = (here: EvolutionRequest, other: EvolutionRequest, requests: readonly EvolutionRequest[]) =>
	crossEvolutions(here, requests).find((r) => r.requestId === other.id);

const withDecision = (request: EvolutionRequest, decision: PairDecision): EvolutionRequest => ({
	...request,
	pairDecisions: [...(request.pairDecisions ?? []).filter((d) => d.requestId !== decision.requestId), decision]
});

/**
 * Set which of two overlapping requests lands first (action b5a3aa1e). Both
 * rows and both cards read the order; the order decides a conflict, so the
 * freeze no longer waits for it.
 */
export function setLandingOrderAct(ctx: OrderContext, here: EvolutionRequest, other: EvolutionRequest | null, landsFirst: unknown, requests: readonly EvolutionRequest[]): OrderOutcome {
	const allowed = firstRefusal(
		orderGuards(ctx, here, other),
		guard(landsFirst !== 'this' && landsFirst !== 'other', 'landsFirst is "this" or "other".', 'Which of the two requests lands first: this one, or the other one.'),
		other ? guard(!overlapping(readingOf(here, other, requests)), 'These requests share no feature or table: they are not ordered.', 'Requests that share nothing land in any order.') : ALLOW
	);
	if (!allowed.ok || !other) return allowed as Refused;
	const [first, second] = landsFirst === 'this' ? [here, other] : [other, here];
	const decided = (request: EvolutionRequest, pair: EvolutionRequest): EvolutionRequest =>
		withDecision(request, { requestId: pair.id, kind: 'order', reason: '', by: ctx.actor.id, at: ctx.at });
	const firstKey = keyOf(requests, first);
	const secondKey = keyOf(requests, second);
	const landsFirstNow = record(decided({ ...first, landsAfter: (first.landsAfter ?? []).filter((id) => id !== second.id) }, second), {
		id: ctx.newId(),
		type: 'landing_order',
		summary: `Set to land before ${secondKey}`,
		actor: ctx.actor,
		at: ctx.at
	});
	const landsSecond = record(decided({ ...second, landsAfter: [...(second.landsAfter ?? []).filter((id) => id !== first.id), first.id] }, first), {
		id: ctx.newId(),
		type: 'landing_order',
		summary: `Set to land after ${firstKey}`,
		actor: ctx.actor,
		at: ctx.at
	});
	return { ok: true, requests: [landsFirstNow, landsSecond], summary: `${firstKey} lands before ${secondKey}` };
}

/**
 * Accept a conflict with another request under way as a known risk, with its
 * reason: the other way a person decides a conflict, the freeze then no longer
 * waiting for it (criterion 2a916c7a). Like any accepted risk, a decision a
 * person takes and the others read.
 */
export function acceptConflictRiskAct(ctx: OrderContext, here: EvolutionRequest, other: EvolutionRequest | null, reason: string, requests: readonly EvolutionRequest[]): OrderOutcome {
	const allowed = firstRefusal(
		orderGuards(ctx, here, other),
		guard(
			!ctx.soloWorkspace && ctx.actor.kind === 'ai_client',
			'An AI client cannot accept a risk on behalf of the team.',
			'A decision belongs to a person. Relay it as the signed-in person who took it, or take it on the dossier page.'
		),
		other ? guard(readingOf(here, other, requests)?.verdict !== 'conflict', 'Only a conflict between two requests is accepted as a risk.', 'Two requests that only overlap are ordered, never accepted as a risk.') : ALLOW,
		guard(reason.trim() === '', 'Accepting a risk needs a stated reason.', 'An accepted risk without a reason is indistinguishable from an oversight.')
	);
	if (!allowed.ok || !other) return allowed as Refused;
	const said = reason.trim();
	const accepted = (request: EvolutionRequest, pair: EvolutionRequest): EvolutionRequest =>
		record(withDecision(request, { requestId: pair.id, kind: 'risk', reason: said, by: ctx.actor.id, at: ctx.at }), {
			id: ctx.newId(),
			type: 'risk_decision',
			summary: `Conflict with ${keyOf(requests, pair)} accepted as a risk: ${said}`,
			actor: ctx.actor,
			at: ctx.at
		});
	return { ok: true, requests: [accepted(here, other), accepted(other, here)], summary: `Conflict between ${keyOf(requests, here)} and ${keyOf(requests, other)} accepted as a risk` };
}

/**
 * A request that left the run (cancelled, deleted, closed or landed) leaves
 * every order it was in (rule db7e7b63): it is taken out of the others' orders
 * and decisions, and keeps none of its own. Untouched requests come back as
 * they were.
 */
export function withoutFinishedOrders(requests: readonly EvolutionRequest[]): EvolutionRequest[] {
	const gone = new Set(requests.filter((r) => !underWay(r)).map((r) => r.id));
	return requests.map((request) => {
		const finished = gone.has(request.id);
		const after = (request.landsAfter ?? []).filter((id) => !finished && !gone.has(id));
		const decisions = (request.pairDecisions ?? []).filter((d) => !finished && !gone.has(d.requestId));
		const unchanged = after.length === (request.landsAfter ?? []).length && decisions.length === (request.pairDecisions ?? []).length;
		return unchanged ? request : { ...request, landsAfter: after, pairDecisions: decisions };
	});
}

/**
 * Another request landed (event evolution.other_request_landed, action
 * d632b48b): every request under way that shares a feature or a table with it
 * is told which request landed and on what, and is read again on the
 * specification as it now stands. A request that left the run keeps the
 * reading it ended with (rule f69faa40); one that shares nothing is not read
 * again (rule 89c72820). Answers the requests told, each with its notice.
 */
export function noticeOtherLanding(
	ctx: OrderContext,
	landed: EvolutionRequest,
	requests: readonly EvolutionRequest[],
	nameOf: (kind: 'feature' | 'table', id: string) => string
): EvolutionRequest[] {
	const key = keyOf(requests, landed);
	return requests.flatMap((request) => {
		if (request.id === landed.id || !underWay(request)) return [];
		const shared = sharedWith(request, landed);
		if (shared.length === 0) return [];
		const notice: OtherLanding = {
			requestId: landed.id,
			key,
			title: landed.title,
			featureIds: shared.filter((s) => s.kind === 'feature').map((s) => s.id),
			tableIds: shared.filter((s) => s.kind === 'table').map((s) => s.id),
			at: ctx.at
		};
		const on = shared.map((s) => nameOf(s.kind, s.id)).join(', ');
		const told = { ...request, otherLandings: [...(request.otherLandings ?? []), notice].slice(-OTHER_LANDINGS_KEPT) };
		return [record(told, { id: ctx.newId(), type: 'other_landing', summary: `${key} landed on ${on}: read again on the new version`, actor: ctx.actor, at: ctx.at })];
	});
}

/** One landing as the Simulation reads it: whether the readings ran on the version it left. */
export interface ReadAgainReading {
	readonly landing: OtherLanding;
	/** The impact and the coherence both ran since that landing. */
	readonly upToDate: boolean;
	/** Neither ever ran: they run on their own at the Impact analysis, on whatever version stands then. */
	readonly neverRead: boolean;
}

/** The landings a request was told of, newest first, each with whether its readings caught up. */
export function readAgainOf(request: Pick<EvolutionRequest, 'otherLandings' | 'impactReport' | 'coherenceReport'>): ReadAgainReading[] {
	const impact = request.impactReport.ranAt;
	const coherence = request.coherenceReport.ranAt;
	return [...(request.otherLandings ?? [])].reverse().map((landing) => ({
		landing,
		upToDate: impact !== null && coherence !== null && impact >= landing.at && coherence >= landing.at,
		neverRead: impact === null && coherence === null
	}));
}

/** Whether the readings of a request are due again after another request landed: they ran once, on an older version. */
export function readAgainDue(request: Pick<EvolutionRequest, 'status' | 'otherLandings' | 'impactReport' | 'coherenceReport'>): boolean {
	const latest = readAgainOf(request)[0];
	return underWay(request) && !!latest && !latest.upToDate && !latest.neverRead;
}
