import type { Actor, EvolutionRequest, Observation } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * Stage 4: the last human check. The product on one side, the acceptance
 * notebook on the other, and every remark anchored on what it concerns so it
 * never has to be described from memory.
 *
 * Two things hold the stage together. A ruling is always a person's: the model
 * replies in a thread and never rules. And no remark disappears: rulings change
 * the status of an observation, never its visibility.
 */

/** A logged observation keeps the anchor it was logged with. */
export function canAnchor(observation: Observation): Guarded {
	return guard(
		observation.status === 'logged',
		'This observation is already logged. Open it in the notebook to move its anchor.',
		'Blocks re-anchoring an observation that is already in the notebook.'
	);
}

/** There is nothing to annotate until a capture is attached. */
export function canAnnotateCapture(observation: Observation): Guarded {
	return guard(
		!observation.captureAttached,
		'Attach a capture first, then annotate it.',
		'Blocks annotation while no capture is attached.'
	);
}

/**
 * An observation reaches the notebook typed, anchored on a screen and an
 * element, and carrying an annotated capture of what the observer saw.
 */
export function canLogObservation(observation: Observation): Guarded {
	return firstRefusal(
		guard(
			observation.screenId.trim() === '',
			'Anchor the observation to a screen before logging it.',
			'Blocks logging an observation with no screen anchor.'
		),
		guard(
			observation.elementId.trim() === '',
			'Point at the element the observation concerns before logging it.',
			'Blocks logging an observation with no element anchor.'
		),
		guard(
			!observation.captureAnnotated,
			'Attach a capture and annotate it before logging.',
			'Blocks logging an observation whose capture is missing or not annotated.'
		)
	);
}

/** Every message names its author, model replies included, and a ruling closes the thread. */
export function canPostMessage(observation: Observation, author: string): Guarded {
	return firstRefusal(
		guard(
			author.trim() === '',
			'A message cannot be posted without an author.',
			'Blocks an unattributed message, human or model.'
		),
		guard(
			observation.ruling !== 'open',
			'This thread has been ruled on. It stays readable, but it takes no new messages.',
			'Blocks new messages once a ruling has been recorded.'
		)
	);
}

/** A viewer takes part in the conversation but decides nothing. */
export function canAssign(actor: Actor): Guarded {
	return guard(
		actor.role === 'viewer',
		'A viewer can write observations and comment, but cannot assign them.',
		'Blocks assignment by a viewer.'
	);
}

/**
 * A thread ends in exactly one ruling, recorded by a member or the owner. The
 * model can reply in the thread, but a ruling is a human decision.
 */
export function canRule(actor: Actor, observation: Observation): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client',
			'The model can reply in the thread, but a ruling is a human decision.',
			'Blocks any ruling coming from an AI client.'
		),
		guard(
			actor.role === 'viewer',
			'A viewer cannot rule on an observation.',
			'Blocks a ruling recorded by a viewer.'
		),
		guard(
			observation.ruling !== 'open',
			'This observation has already been ruled on.',
			'Blocks a second ruling on the same thread.'
		)
	);
}

/** No acceptance remark is dropped without a stated reason. */
export function canInvalidate(actor: Actor, observation: Observation, reason: string): Guarded {
	return firstRefusal(
		canRule(actor, observation),
		guard(
			reason.trim() === '',
			'Write the reason before invalidating this observation.',
			'Blocks an invalidation with no stated reason.'
		)
	);
}

/** A deferred, invalidated or requalified observation is never folded back. */
export function canChooseInjectionTarget(actor: Actor, observation: Observation): Guarded {
	return firstRefusal(
		guard(
			observation.ruling !== 'validated',
			'Only a validated observation goes back into the spec.',
			'Blocks choosing a target for an observation that was not validated.'
		),
		guard(
			actor.role === 'viewer',
			'A viewer can read the observation but cannot write into the spec.',
			'Blocks a fold-back attempted by a viewer.'
		)
	);
}

/**
 * Fold a validated observation back into the spec: a criterion or a rule written
 * into its canonical section, citing the observation it came from, stamped with
 * who did it and when. The element is written to a canonical section, never left
 * floating.
 */
export function canFoldBack(
	actor: Actor,
	observation: Observation,
	targetLeafId: string
): Guarded {
	return firstRefusal(
		guard(
			observation.ruling !== 'validated',
			'Only a validated observation goes back into the spec.',
			'Blocks folding back an observation that was deferred, invalidated or requalified.'
		),
		guard(
			targetLeafId.trim() === '',
			'Pick the leaf the criterion or the rule is written to.',
			'Blocks a fold-back with no canonical section to write into.'
		),
		guard(
			actor.role === 'viewer',
			'A viewer can read the observation but cannot write into the spec.',
			'Blocks a fold-back attempted by a viewer.'
		)
	);
}

/**
 * How many validated observations are still owed to the spec. Deferred and
 * invalidated observations are not counted: a deferred remark never stands in
 * the way of closing.
 */
export function validatedNotFoldedBack(request: EvolutionRequest): number {
	return request.observations.filter((o) => o.ruling === 'validated' && !o.foldedBackAt).length;
}

/** Closing a request is a decision, and a viewer decides nothing. */
export function canCloseAfterAcceptance(actor: Actor, request: EvolutionRequest): Guarded {
	return firstRefusal(
		guard(
			validatedNotFoldedBack(request) > 0,
			'A validated observation has not been folded back into the spec yet.',
			'Blocks closing while at least one validated observation is still missing from the spec.'
		),
		guard(
			actor.role === 'viewer',
			'A viewer cannot close an evolution request.',
			'Blocks a closing attempted by a viewer.'
		)
	);
}

/** An observation stays readable whatever the ruling, invalidated included. */
export function observationIsVisible(): boolean {
	return true;
}
