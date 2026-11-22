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

/**
 * Gives the entries appended after `from` back to the kind of author who
 * actually acted. An act the platform carries on its own, lent a person's
 * standing to pass a guard, must not rewrite who did it: the history exists to
 * say whether a person or an assistant moved the request.
 */
export function attributeTo(request: EvolutionRequest, from: number, kind: HistoryEntry['authorKind']): EvolutionRequest {
	return {
		...request,
		history: request.history.map((entry, i) => (i >= from ? { ...entry, authorKind: kind } : entry))
	};
}
