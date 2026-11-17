import { discussionHref } from './anchors';
import { participantsOf, type DiscussionThread, type DiscussionsDocument } from './discussion';

/**
 * What happened in the discussions of a project, one event per thing a person
 * did: a thread opened, a reply, a thread resolved or reopened. This is what a
 * notification or a Home feed reads; it carries everything such a reader
 * needs (who, when, what was said, whom it concerns, where it is) so it never
 * has to read the spec.
 */

export type DiscussionEventKind = 'opened' | 'reply' | 'resolved' | 'reopened';

export interface DiscussionEvent {
	readonly threadId: string;
	readonly anchor: string;
	readonly anchorTitle: string;
	readonly kind: DiscussionEventKind;
	readonly authorEmail: string;
	readonly authorName: string;
	/** ISO 8601. */
	readonly at: string;
	/** What was said; for a resolution, the message that opened the thread, so the reader knows what was settled. */
	readonly text: string;
	/** Who should hear of it, by email, the author never among them. */
	readonly notify: readonly string[];
	/** Opens the thread where it is held. */
	readonly href: string;
	/** For a reply: the message it follows, the one its picture shows above it (criterion b7f648d8). */
	readonly previous?: { readonly authorEmail: string; readonly authorName: string; readonly text: string };
	/** How many people have written in the thread so far, its opener included. */
	readonly participants: number;
	/** Who opened the thread and when; for a reopening, when it was last resolved before. */
	readonly openedBy: { readonly email: string; readonly name: string };
	readonly openedAt: string;
	readonly resolvedAt?: string;
}

const lower = (email: string) => email.trim().toLowerCase();
const without = (emails: readonly string[], author: string) => emails.filter((e) => e !== lower(author));

function eventsOf(thread: DiscussionThread, projectId: string): DiscussionEvent[] {
	const [opener, ...replies] = thread.messages;
	if (!opener) return [];
	const base = {
		threadId: thread.id,
		anchor: thread.anchor,
		anchorTitle: thread.anchorTitle,
		href: discussionHref(projectId, thread.anchor, thread.id),
		openedBy: { email: opener.author.email, name: opener.author.name },
		openedAt: opener.at
	};
	const writers: string[] = [];
	const wrote = (email: string) => {
		if (!writers.includes(lower(email))) writers.push(lower(email));
		return writers.length;
	};
	const events: DiscussionEvent[] = [
		{
			...base,
			kind: 'opened',
			authorEmail: opener.author.email,
			authorName: opener.author.name,
			at: opener.at,
			text: opener.text,
			notify: without(thread.notify.map(lower), opener.author.email),
			participants: wrote(opener.author.email)
		}
	];
	// Everyone in the thread hears of a reply, except who wrote it; a person
	// who joins later is not told of what was said before they joined.
	const joined: string[] = [lower(opener.author.email), ...thread.notify.map(lower)];
	let previous = opener;
	for (const m of replies) {
		const before = previous;
		previous = m;
		events.push({
			...base,
			// A reply's notification lands on the reply itself (criterion 0bdc1d4f).
			href: discussionHref(projectId, thread.anchor, thread.id, m.id),
			kind: 'reply',
			authorEmail: m.author.email,
			authorName: m.author.name,
			at: m.at,
			text: m.text,
			notify: without([...new Set(joined)], m.author.email),
			previous: { authorEmail: before.author.email, authorName: before.author.name, text: before.text },
			participants: wrote(m.author.email)
		});
		if (!joined.includes(lower(m.author.email))) joined.push(lower(m.author.email));
	}
	const everyone = participantsOf(thread);
	// A resolution and a reopening are told to everyone who took part, never to the person who did it.
	let resolvedAt: string | undefined;
	for (const r of thread.rulings) {
		events.push({
			...base,
			kind: r.state,
			authorEmail: r.by.email,
			authorName: r.by.name,
			at: r.at,
			text: opener.text,
			notify: without(everyone, r.by.email),
			participants: writers.length,
			...(r.state === 'reopened' && resolvedAt ? { resolvedAt } : {})
		});
		if (r.state === 'resolved') resolvedAt = r.at;
	}
	return events;
}

/** Every event of the project's discussions, newest first. */
export function discussionEvents(document: DiscussionsDocument, projectId: string): DiscussionEvent[] {
	return document.threads
		.flatMap((t) => eventsOf(t, projectId))
		.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
