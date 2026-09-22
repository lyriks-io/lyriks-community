import type { DraftLeaf, EvolutionRequest, GateWaiver, ImpactFinding } from './draft';
import type { Actor } from './draft';
import { ALLOW, firstRefusal, guard, type Guarded } from './guard';
import { pendingProposals } from './proposals';

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
	// A request with nothing to arbitrate has nothing for the critical fields to
	// protect: no contradiction, no signature pending, nothing disturbed. Holding
	// it there would be blocking for nothing, which is the one thing the gate must
	// not do (ac-evo-req-14).
	if (nothingToArbitrate(request)) return ALLOW;
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
 * Leaving Specify: what the dossier proposed must have been signed.
 *
 * A proposal is a value a PERSON decides, and the maturity percentage next to
 * it is inherited from the features the change touches, so a brand-new dossier
 * on a complete product reads high before anything about the change itself has
 * been decided. That number never blocks (it is a reading, not a gate), but
 * walking out of Specify while the very values the dossier put up for signature
 * are still waiting is the one case where "specified" is plainly untrue. Refuse
 * that, and name the count.
 *
 * Nothing else is required here: a change that genuinely needs no new value is
 * specified the moment it is understood, and the waiver remains the named way
 * through when a person decides to cross anyway.
 */
export function canLeaveSpecification(request: EvolutionRequest): Guarded {
	const waiting = pendingProposals(request).length;
	return guard(
		waiting > 0,
		`${waiting} proposal${waiting === 1 ? '' : 's'} still await${waiting === 1 ? 's' : ''} a decision.`,
		'A proposal is a value a person signs. Crossing with signatures pending would carry a specification nobody decided, under a maturity inherited from the features the change touches.'
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
 * A draft that changes how something READS and nothing about what it does: a
 * name, a description, a wording. It carries no criterion, no dependency, no
 * behaviour row and none of the four "why" fields, which is precisely what
 * distinguishes a correction from a change of behaviour.
 *
 * The impact graph cannot tell the two apart, because it only knows WHICH
 * feature moved, never what about it moved. The draft knows, so it is the draft
 * that is asked.
 */
export function isPresentational(draft: DraftLeaf): boolean {
	return (
		draft.kind === 'amend' &&
		draft.acceptanceCriteria.length === 0 &&
		draft.dependsOn.length === 0 &&
		draft.behaviour.length === 0 &&
		draft.objective.trim() === '' &&
		draft.problem.trim() === '' &&
		draft.expectedEffect.trim() === '' &&
		draft.value.trim() === ''
	);
}

/** An impact row somebody has to look at before it is followed. */
function needsAttention(finding: ImpactFinding): boolean {
	return (
		finding.severity === 'blocking' ||
		finding.severity === 'high' ||
		finding.migrationImplied === true ||
		finding.ruleWork === 'rewrite' ||
		finding.codeWork === 'remove'
	);
}

/**
 * Whether a request has nothing left for anyone to arbitrate (ac-evo-req-12).
 *
 * This is the whole of the entry rule. There is no threshold at the door and no
 * judgement about how big a change is: every change to an existing product opens
 * a dossier, and what varies is whether the dossier costs its author anything. A
 * request that contradicts nothing, asks nobody for a signature and disturbs
 * nothing has nothing to discuss, so it crosses and closes in the same act,
 * leaving only its trace.
 *
 * Computed, deliberately. An AI client asked to judge whether a change is "small
 * enough" gets it wrong in the direction that hurts, so it is never asked: the
 * readings answer, and both of them must actually have run, because an unread
 * impact is not an empty one.
 */
export function nothingToArbitrate(request: EvolutionRequest): boolean {
	if (request.status !== 'open') return false;
	if (request.impactReport.status !== 'ready') return false;
	if (request.coherenceReport.status !== 'ready') return false;
	if (request.coherenceFindings.some((f) => f.published)) return false;
	// Anything still waiting on a person is, by definition, something to arbitrate.
	if (pendingProposals(request).length > 0) return false;
	if (request.openQuestionKeys.length > 0) return false;
	if (request.observations.length > 0) return false;
	if (request.implementationFindings.length > 0) return false;
	// A correction to the wording disturbs nothing, however well connected the
	// feature it sits on is; the neighbourhood the walk lists is there because the
	// feature has neighbours, not because anything about it moved.
	if (request.drafts.length > 0 && request.drafts.every(isPresentational)) return true;
	return !request.impactFindings.some(needsAttention);
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
