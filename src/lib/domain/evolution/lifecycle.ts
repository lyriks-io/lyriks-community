import { REQUEST_ORIGINS, STAGE_ORDER, type RequestStage } from './enums';
import type { EvolutionRequest } from './draft';
import { canCrossToImplementation, openWaiver } from './gate';
import { canCloseReport } from './implementation';
import { ALLOW, firstRefusal, guard, type Guarded } from './guard';

/**
 * The acts that open, move and close a request.
 *
 * The whole point of the dossier is that a change is never abandoned
 * half-specified, so each act is guarded by the conditions the specification
 * names, and every refusal carries the reason a reader is shown.
 */

/** The stage that follows `stage`, or null at the end of the run. */
export function nextStage(stage: RequestStage): RequestStage | null {
	const i = STAGE_ORDER.indexOf(stage);
	return i < 0 || i === STAGE_ORDER.length - 1 ? null : STAGE_ORDER[i + 1];
}

/** How many validated observations have not been folded back into the spec yet. */
export function acceptanceDebt(request: EvolutionRequest): number {
	return request.observations.filter((o) => o.ruling === 'validated' && !o.foldedBackAt).length;
}

/**
 * Turn a draft into a real request: a title so it can be found again on
 * Thursday, and an origin so the portfolio can be read later.
 *
 * It deliberately does NOT ask which features the change touches. A request
 * routinely spans several, and naming them is the work the impact report does;
 * demanding an answer at the door only buys a guess that the report then has to
 * contradict. The spec has to say what it touches before it can reach
 * implementation, which the gate enforces through the maturity score, not here.
 */
export function canOpenRequest(request: EvolutionRequest): Guarded {
	return firstRefusal(
		guard(
			request.title.trim() === '',
			'A request needs a title before it can be opened.',
			'Without a title the request cannot be found again on Thursday, which is the whole point of giving it an identity.'
		),
		guard(
			request.origin === null,
			// The codes travel WITH the refusal: a caller that cannot see the
			// enumeration cannot pick from it, and this is the first operation of
			// the whole run. Reading the source code is not an available move for
			// an agent working at a customer's.
			`Pick where this change comes from before opening it: ${REQUEST_ORIGINS.map((o) => o.code).join(', ')}.`,
			'The origin is what lets the portfolio be read later: how much of our work comes from customers, from support, from regulation.'
		)
	);
}

/** An opened request starts in specification, the first of the four stages. */
export function openRequest(request: EvolutionRequest, at: string): EvolutionRequest {
	return { ...request, stage: 'specification', status: 'open', createdAt: request.createdAt || at };
}

/**
 * Forward movement happens through one gate at a time, in order. Skipping or
 * repeating a gate is refused, and a closed request does not move at all.
 */
export function canAdvance(request: EvolutionRequest, target: RequestStage): Guarded {
	return firstRefusal(
		guard(
			request.status === 'closed',
			'This request is closed.',
			'A closed request has finished its run; reopening it is a separate act, not a stage move.'
		),
		guard(
			request.status === 'deleted',
			'This request is deleted.',
			'A deleted dossier is out of the run; nothing moves it.'
		),
		guard(
			nextStage(request.stage) !== target,
			`Only a request in ${previousOf(target)} can move to ${target}.`,
			'The stage only ever moves forward one gate at a time; skipping or repeating a gate is refused.'
		)
	);
}

const previousOf = (stage: RequestStage): RequestStage => {
	const i = STAGE_ORDER.indexOf(stage);
	return i > 0 ? STAGE_ORDER[i - 1] : stage;
};

/**
 * Move a request backward on purpose, when what was specified turns out to be
 * the wrong thing. A rebrief is an explicit act rather than a quiet patch.
 */
export function canRebrief(request: EvolutionRequest): Guarded {
	return firstRefusal(
		guard(
			request.status === 'closed',
			'A closed request cannot be rebriefed.',
			'Rewriting the brief of a finished request would silently change history; open a new request instead.'
		),
		guard(
			request.stage === 'specification',
			'The request is already in specification.',
			'A rebrief moves a request back to specification; there is nothing to move when it is already there.'
		)
	);
}

/**
 * Close the request. This is the act that stops changes being abandoned
 * half-specified, so it comes last, and only once the spec describes the product
 * that was actually accepted.
 */
export function canCloseRequest(request: EvolutionRequest): Guarded {
	return firstRefusal(
		guard(
			acceptanceDebt(request) > 0,
			'An accepted observation has not been written back into the spec yet.',
			'Closing here would leave the specification describing something other than the product that was accepted.'
		),
		guard(
			request.stage !== 'delivered',
			'Only a delivered request can be closed.',
			'Closing before delivery would hide work that is still running.'
		)
	);
}

/**
 * Remove a dossier that should never have existed. Only the dossier goes: every
 * field it wrote into Foundation, Users, Features, Behavior, Experience and Data
 * stays exactly as it is, because the dossier never owned them.
 */
export function canDeleteRequest(request: EvolutionRequest): Guarded {
	return guard(
		request.status === 'deleted',
		'This request is already deleted.',
		'Deleting twice would suggest a second removal happened, which the history would then have to explain.'
	);
}

/** A leaf is listed once. The set says what the change touches, not how often. */
export function leafListInvariantHolds(request: EvolutionRequest): boolean {
	return new Set(request.leafIds).size === request.leafIds.length;
}

/** A request always carries an iteration number, from one, only moving forward. */
export function iterationInvariantHolds(request: EvolutionRequest): boolean {
	return request.iteration >= 1;
}

/**
 * The furthest stage this request's own state earns, whatever stage it is
 * stored in.
 *
 * A stage is not a place a card is put, it is a place a request has got to. The
 * board therefore reads a request rather than remembering where somebody
 * dropped it: a gesture that cannot be undone is not a decision, and the four
 * gates are the only things that move a request forward.
 *
 * It only ever pulls BACK. Meeting a gate never advances a request on its own,
 * because crossing is a deliberate act that the timeline records with its
 * author; but a request sitting past a gate that is not met, and that no waiver
 * excuses, is shown where it actually stands. A waiver is exactly the named
 * exception that lets a request stay past an unmet gate, so a stage it opened
 * is honoured here.
 */
export function supportedStage(request: EvolutionRequest, criticalEmptyCount: number): RequestStage {
	if (request.stage === 'draft') return 'draft';
	if (!canOpenRequest(request).ok) return 'draft';
	const waived = (stage: RequestStage): boolean => {
		const standing = openWaiver(request);
		return standing !== null && STAGE_ORDER.indexOf(standing.stage) >= STAGE_ORDER.indexOf(stage);
	};
	// The gate that opens each stage, in order. Specification and coherence have
	// none: nothing is measured between the raw need and the check that follows
	// it, so a request reaches them by being opened.
	const opens: readonly [RequestStage, () => boolean][] = [
		['specification', () => true],
		['coherence', () => true],
		['implementation', () => canCrossToImplementation(request, criticalEmptyCount).ok || waived('implementation')],
		['acceptance', () => canCloseReport(request).ok || waived('acceptance')],
		['delivered', () => acceptanceDebt(request) === 0 || waived('delivered')]
	];
	let earned: RequestStage = 'specification';
	for (const [stage, gateMet] of opens) {
		if (!gateMet()) break;
		earned = stage;
		if (stage === request.stage) break;
	}
	// Never further than where the request was actually taken.
	return STAGE_ORDER.indexOf(earned) < STAGE_ORDER.indexOf(request.stage) ? earned : request.stage;
}

export { ALLOW };
