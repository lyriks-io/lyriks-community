import type { Actor, EvolutionRequest, HistoryEntry } from './draft';
import type { HistoryEntryType } from './enums';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * The one timeline of a request.
 *
 * It is append-only. Entries can be superseded but never removed, which is what
 * makes an AI-assisted specification auditable at all: a history that can lose
 * entries proves nothing. Every entry names its author and says whether that
 * author is a person or a model, so a spec sentence questioned six months later
 * can be traced to one or the other.
 */

/** Every entry names its author, and is written to the timeline exactly once. */
export function canRecord(entry: {
	authorId: string;
	recorded: boolean;
}): Guarded {
	return firstRefusal(
		guard(
			entry.authorId.trim() === '',
			'An entry with no author cannot go on the timeline.',
			'An unattributed entry answers none of the questions the history exists for: what was decided, by whom, on what evidence.'
		),
		guard(
			entry.recorded,
			'This entry is already on the timeline.',
			'Recording it a second time would show one decision as two, and the timeline would stop being a faithful count of what happened.'
		)
	);
}

/**
 * Turning a model proposal into a value in the spec: the proposal it came from
 * and the person who accepted it are both stamped on the entry, because without
 * them nobody can later tell whether a human wrote the sentence or a model
 * proposed it.
 */
export function canRecordAcceptedProposal(input: {
	authorKind: Actor['kind'];
	proposalId: string;
	acceptedByPersonId: string;
}): Guarded {
	return firstRefusal(
		guard(
			input.authorKind === 'ai_client',
			'An AI client cannot accept a proposal.',
			'An AI client may write spec fields and produce reports, but accepting a proposal is a decision, and decisions are a person.'
		),
		guard(
			input.proposalId.trim() === '',
			'The accepted value must name the proposal it came from.',
			'Without the proposal id, nobody can later tell whether a human wrote the sentence or a model proposed it.'
		),
		guard(
			input.acceptedByPersonId.trim() === '',
			'The acceptance must name the person who made it.',
			'The person who accepted is the one answerable for the value six months later.'
		)
	);
}

/**
 * The only legitimate way to correct the record: write a newer entry over an
 * older one, leaving both readable. Declaring an earlier decision wrong is itself
 * a decision, so it belongs to a person.
 */
export function canSupersede(actor: Actor, entry: HistoryEntry): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client',
			'An AI client cannot supersede a decision.',
			'Declaring an earlier decision wrong is itself a decision, so it belongs to a person.'
		),
		guard(
			entry.supersededById !== null,
			'This entry has already been superseded.',
			'A superseded entry stays readable underneath the one that replaced it; replacing it twice would hide the chain.'
		)
	);
}

/**
 * The act a user will reach for when the record is wrong, and which the history
 * refuses so the record stays trustworthy. There is no success path: the refusal
 * points at the one legitimate way to correct it.
 */
export function canDeleteEntry(): Guarded {
	return guard(
		true,
		'History is append-only. Supersede this entry instead of deleting it.',
		'A history that can lose entries proves nothing, so the refusal points at the one legitimate way to correct the record.'
	);
}

/** Append an entry. The caller has already passed `canRecord`. */
export function record(
	request: EvolutionRequest,
	entry: {
		id: string;
		type: HistoryEntryType;
		summary: string;
		actor: Actor;
		at: string;
		proposalId?: string | null;
		acceptedByPersonId?: string | null;
	}
): EvolutionRequest {
	const appended: HistoryEntry = {
		id: entry.id,
		type: entry.type,
		summary: entry.summary,
		authorId: entry.actor.id,
		authorKind: entry.actor.kind,
		recordedAt: entry.at,
		proposalId: entry.proposalId ?? null,
		acceptedByPersonId: entry.acceptedByPersonId ?? null,
		supersededById: null,
		channel: entry.actor.channel ?? null
	};
	return { ...request, history: [...request.history, appended] };
}

/** Newest first, which is how a reader walks a timeline. */
export function timeline(request: EvolutionRequest): HistoryEntry[] {
	return request.history.slice().reverse();
}

/** The history never holds an unattributed decision. */
export function entriesWithoutAuthor(request: EvolutionRequest): number {
	return request.history.filter((e) => e.authorId.trim() === '').length;
}
