import type { Actor, Observation } from './draft';
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

/**
 * An observation reaches the notebook typed, anchored on a screen and an
 * element, and carrying an annotated capture of what the observer saw.
 */
export function canLogObservation(observation: Observation): Guarded {
	return guard(
		observation.body.trim() === '',
		'Say what you saw before logging the observation.',
		'An observation is what a person saw on the change; an empty one says nothing to rule on.'
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
