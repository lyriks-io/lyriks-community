import type { Actor, EvolutionRequest, Proposal } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * The LLM completes the spec, and a person signs for every value.
 *
 * Nothing is written before a human accepts, and that acceptance is the only
 * moment a proposed value reaches its canonical section. The LLM origin stays
 * stamped on the value afterwards, which is what lets a later audit tell a model
 * draft from something a person typed.
 */

/**
 * Acceptance needs a source in the evidence register, a reasoning that separates
 * what was read from what was inferred, and a home to write to. Those three hold
 * for everyone.
 *
 * A word the glossary bans is NOT among them. The check matches a word and not
 * its sense, so it refused "in progress" quoted from what the product displays
 * exactly as if it had called coverage progress. It warns, names the term it
 * guards, and the person decides (a2a01f3a).
 *
 * Who may sign follows the roster (ac-evo-req-13). Where two or more people
 * share the workspace, acceptance is the human signature the feature exists for
 * and an AI client never gives it. Where one person is alone, there is nobody to
 * sign for: the client accepts on their behalf, the timeline records that it
 * acted through a client, and the quality bars above still every one of them.
 */
export function canAcceptProposal(
	actor: Actor,
	proposal: Proposal,
	options: { readonly soloWorkspace?: boolean } = {}
): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client' && !options.soloWorkspace,
			'An AI client may create proposals but never accept one.',
			'Acceptance is the human signature the whole feature exists for, so where a workspace holds more than one member it is closed to non-human callers, including the MCP clients that author the request.'
		),
		guard(
			proposal.citedSourceIds.length < 1,
			'This proposal cites no source.',
			'A value nobody can trace back to a source in the evidence register cannot be signed for, because the audit later has nothing to read.'
		),
		guard(
			!proposal.reasoningSeparatesReadFromInferred,
			'Say what was read and what was inferred in their own fields: whatWasRead and whatWasInferred.',
			'Without that separation the reader cannot tell a quoted fact from a guess, and the decision is not an informed one. The two are named fields, in any language: nothing is looked for in the wording.'
		),
		guard(
			proposal.canonicalPath.trim() === '',
			'This proposal does not name where it should be written.',
			'A value with no canonical path has nowhere to go, and the dossier will not keep it for itself.'
		)
	);
}

/**
 * Refusal is a decision like the others, and follows the same roster rule as
 * acceptance: a person's where the workspace holds several, open to the client
 * where one person is alone with it.
 */
export function canRefuseProposal(
	actor: Actor,
	options: { readonly soloWorkspace?: boolean } = {}
): Guarded {
	return guard(
		actor.kind === 'ai_client' && !options.soloWorkspace,
		'An AI client may create proposals but never decide on one.',
		'Refusal is a decision like the others and, where a workspace holds more than one member, belongs to the person who owns the request.'
	);
}

/** Proposals still waiting for a reader. */
export function pendingProposals(request: EvolutionRequest): Proposal[] {
	return request.proposals.filter((p) => p.decision === 'pending' || p.decision === 'reworded');
}

/**
 * A dossier field writes straight into the section that owns it, keeping no copy.
 * A field with no canonical path has nowhere to write, and the dossier refuses
 * the save rather than storing the value locally.
 */
export function canSaveField(input: {
	canonicalPath: string | null;
	userCanWriteCanonical: boolean;
	refusalReason: 'none' | 'permission' | 'validation';
}): Guarded {
	return firstRefusal(
		guard(
			!input.userCanWriteCanonical,
			'You are not allowed to write in the section that owns this field.',
			'The dossier applies the permission of the owning section; it never grants a right the section refuses.'
		),
		guard(
			!input.canonicalPath || input.canonicalPath.trim() === '',
			'This field does not name where it should be written.',
			'A field with no canonical path has nowhere to write, and the dossier will not keep the value for itself.'
		),
		guard(
			input.refusalReason === 'validation',
			'The section that owns this field refused the value.',
			'The validation of the owning section is reported in place, and nothing is written.'
		)
	);
}

/** Skip only applies to a block that is still empty, in progress or complete. */
/**
 * Say that a field cannot be answered yet. It turns amber, counts as open, and
 * lowers nothing on the other fields: a declared unknown, never a fault. A block
 * whose fields are all open questions reads as parked, and that is derived.
 */
export function canMarkOpenQuestion(input: {
	canEdit: boolean;
	fieldSelected: boolean;
	alreadyOpen: boolean;
	blockState: string;
}): Guarded {
	return firstRefusal(
		guard(
			!input.canEdit,
			'You can read this request but not write on it.',
			'Declaring an open question is a write on the request.'
		),
		guard(
			!input.fieldSelected,
			'Open a field first.',
			'An open question is declared on a field, not on the page.'
		),
		guard(
			input.alreadyOpen,
			'This field is already an open question.',
			'Marking twice would count the same hole twice.'
		),
		guard(
			input.blockState === 'validated',
			'This block is validated; there is no open question left to declare on it.',
			'A validated block is agreed work; reopening it is an edit, not a question.'
		)
	);
}

/** Replace the amber with a value: the field is saved like any field and leaves the open count. */
export function canAnswerOpenQuestion(input: { canEdit: boolean; isOpen: boolean }): Guarded {
	return firstRefusal(
		guard(
			!input.canEdit,
			'You can read this request but not write on it.',
			'Answering is a write on the request.'
		),
		guard(
			!input.isOpen,
			'This field is not an open question; just edit it.',
			'Answering applies to an amber field.'
		)
	);
}
