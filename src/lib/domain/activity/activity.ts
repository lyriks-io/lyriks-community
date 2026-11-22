import type { ActivityNotice } from './notice';

/**
 * What happened in a project, as the reader is told about it: who did what,
 * where, when, and whom it concerns. Every event is DERIVED from what the
 * project already records (an Evolution request's history, validations,
 * threads and AI tasks; a discussion of the specification; a
 * retrospecification run), never stored on its own, so it can never disagree
 * with the work it reports.
 */

/** A person, a person's AI client, or Lyriks itself. */
export type ActivityActorKind = 'person' | 'ai' | 'lyriks';

export interface ActivityActor {
	/** The person's id (their email, or `local-operator`); for an AI, the person it works for. */
	readonly id: string;
	readonly kind: ActivityActorKind;
}

export type ActivityKind =
	/** Someone named the reader in a message. */
	| 'mention'
	/** Someone answered a message of the reader. */
	| 'reply'
	/** Someone opened a conversation. */
	| 'comment'
	| 'validated'
	/** Someone settled a conversation the reader took part in. */
	| 'resolved'
	/** Someone opened again a conversation the reader took part in. */
	| 'reopened'
	/** Someone handed an item to the reader to look at. */
	| 'shared'
	/** Someone asked the reader for their validation of an element. */
	| 'reminder'
	| 'created'
	/** An evolution moved on: simulated, approved, built, amended, cancelled, certified (criterion 4bf1182d). */
	| 'progressed'
	/** A person joined a project's team (criterion 04fb1bbf). */
	| 'joined'
	/** An AI client finished a task it was asked for. */
	| 'ai_done'
	/** Lyriks finished work of its own (an analysis, a check). */
	| 'info';

export interface ActivityEvent {
	/** Stable across reads, so a read mark keeps pointing at the same event. */
	readonly id: string;
	readonly projectId: string;
	readonly at: string;
	readonly actor: ActivityActor;
	readonly kind: ActivityKind;
	/** What the actor did, after their name: `validated “Target situation”`. */
	readonly line: string;
	/** The words of a message or the outcome of a task; empty when there is none. */
	readonly text: string;
	/** Where it happened in the project: `EVO-042 · Briefing`. */
	readonly where: string;
	readonly href: string;
	/** The people it concerns directly (named, answered, asked to look): their ids. */
	readonly to: readonly string[];
	/** The actor's name as the source recorded it, for a person the roster does not know. */
	readonly actorName?: string;
	/** The conversation a message belongs to, the same for its opening, its replies and its resolution: Home tells one line per conversation. */
	readonly thread?: string;
	/** Everyone who sees the project hears it, but the person who did it: a Reverse-Specification started or ready to review (criteria 3fccc273, f04182b8). */
	readonly team?: boolean;
	/** What its notification card says, when it says more than its actor's line (criterion 65fdff0a of feat-feedback-docs). */
	readonly notice?: ActivityNotice;
}

/** Ids are emails: the same person whatever the case they were typed in. */
export const samePerson = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const concerns = (e: ActivityEvent, me: string) => e.to.some((p) => samePerson(p, me));

const newestFirst = (a: ActivityEvent, b: ActivityEvent) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id);

/**
 * The reader's notifications: what concerns them by name (a mention, a reply),
 * what the whole project hears, and the tasks their own AI finished. Their own
 * acts never notify them; what their AI did for the team does.
 */
export function notificationsFor(events: readonly ActivityEvent[], me: string): ActivityEvent[] {
	return events
		.filter((e) => {
			if (e.team) return e.actor.kind !== 'person' || !samePerson(e.actor.id, me);
			if (e.actor.kind === 'ai') return e.kind === 'ai_done' && samePerson(e.actor.id, me);
			if (e.actor.kind === 'lyriks') return concerns(e, me);
			return !samePerson(e.actor.id, me) && concerns(e, me);
		})
		.sort(newestFirst);
}
