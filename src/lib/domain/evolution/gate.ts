import type { EvolutionRequest, GateWaiver } from './draft';
import type { Actor } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * The band at the foot of a stage: the threshold, the crossing when it is met,
 * and the named waiver when it is not.
 *
 * Crossing early stays possible and stays expensive. That is the whole design:
 * a request never stalls silently, but the exception announces itself on the
 * dossier header and on the board card until an admin lifts it.
 */

/** Blocking findings hold a request at the gate; major and minor are arbitrated. */
export function blockingFindingCount(request: EvolutionRequest): number {
	return request.coherenceFindings.filter((f) => f.published && f.severity === 'blocking').length;
}

/** The waiver still standing on a request, if any. */
export function openWaiver(request: EvolutionRequest): GateWaiver | null {
	return request.waivers.find((w) => w.liftedAt === null) ?? null;
}

/**
 * Stage 3 opens when no critical field is empty and no blocking finding is
 * undecided. A number never blocks: the maturity percentage sits next to the
 * gate as a reading, and what refuses the crossing is the critical hole the rail
 * names. Anything less is refused, and the refusal offers the waiver as the
 * named way through.
 */
export function canCrossToImplementation(
	request: EvolutionRequest,
	criticalEmptyCount: number
): Guarded {
	return firstRefusal(
		guard(
			criticalEmptyCount > 0,
			'Critical fields are still empty. The rail names them: fill them, or waive the gate with a stated reason.',
			'Refuses the crossing while any critical specification field is empty. The maturity percentage never blocks by itself.'
		),
		guard(
			blockingFindingCount(request) > 0,
			'A blocking finding is still undecided. Fix it, accept it as a risk, or waive the gate with a stated reason.',
			'Refuses the crossing while a blocking finding is undecided against the existing spec.'
		)
	);
}

/**
 * The coherence gate itself: no request leaves it unchecked, and a blocking
 * finding holds it there.
 */
export function canLeaveCoherence(request: EvolutionRequest): Guarded {
	return firstRefusal(
		guard(
			request.coherenceReport.status !== 'ready',
			'The coherence check has not been run on this request.',
			'Sending an unchecked request to implementation is exactly the path where the contradiction is discovered in production.'
		),
		guard(
			blockingFindingCount(request) > 0,
			'This request still carries a blocking finding.',
			'A blocking finding is a contradiction the existing spec cannot absorb, and fixing it is an edit now against a rewrite later.'
		)
	);
}

/**
 * Cross a closed gate deliberately, at the cost of a named reason. A waiver
 * without one is indistinguishable from an oversight, so it is refused; and
 * because a waiver is a decision, an AI client never grants one.
 */
export function canWaive(actor: Actor, reason: string, gateAlreadyMet: boolean): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client',
			'An AI client cannot grant a waiver.',
			'A waiver is a decision, and decisions belong to people. An AI client may write and report, never decide.'
		),
		guard(
			reason.trim() === '',
			'A waiver needs a stated reason. Without one it is indistinguishable from an oversight.',
			'Refuses a waiver that carries no reason.'
		),
		guard(
			gateAlreadyMet,
			'There is no unmet gate to waive here.',
			'Waiving a gate that is already met would put a meaningless mark on the card and on the history.'
		)
	);
}

/**
 * Lifting an exception states that the gate is now genuinely met, which is a
 * verdict. It belongs to an admin, so the person who granted it cannot quietly
 * erase it.
 */
export function canLiftWaiver(actor: Actor, request: EvolutionRequest): Guarded {
	return firstRefusal(
		guard(
			openWaiver(request) === null,
			'This request carries no waiver.',
			'Nothing to lift; the card is not marked.'
		),
		guard(
			actor.kind === 'ai_client',
			'An AI client cannot lift a waiver.',
			'Lifting a waiver states that the gate is now genuinely met, which is a verdict and therefore a person call.'
		),
		guard(
			actor.role !== 'admin' && actor.role !== 'owner',
			'Only a Workspace Admin or Owner may lift a waiver.',
			'Lifting an exception is an admin act, so the person who granted it cannot quietly erase it.'
		)
	);
}

/**
 * The board refuses a drop into a stage whose gate is unmet, and refuses to pull
 * a delivered card back: going back is a rebrief on the request itself, not a
 * drag.
 */
export function canDropCard(
	request: EvolutionRequest,
	targetGateMet: boolean
): Guarded {
	return firstRefusal(
		guard(
			request.stage === 'delivered',
			'A delivered request cannot be dragged back into a stage.',
			'The Delivered column is the end of the board; going back is a rebrief on the request itself, not a drag.'
		),
		guard(
			!targetGateMet,
			'The gate for this column is not met. Grant a waiver to cross anyway.',
			'The drop is refused rather than silently accepted, and the refusal offers the waiver as the named way through.'
		)
	);
}
