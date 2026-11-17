import { AI_AUTHOR_PREFIX, type DiscussionEvent } from '$domain/discussions';
import type { ActivityEvent } from './activity';
import { counted, plain, quoted, quotedWords, shortDate, shortLine, strong, type ActivityNotice } from './notice';

/**
 * The Specification 360° discussions as activity: a thread opened (for the
 * people it notified), a reply to everyone in the thread, a thread resolved or
 * reopened for everyone who took part. Each tells its news as the brief words
 * it (criterion b7f648d8 of feat-feedback-docs).
 */

/** A message reads in a picture without its formatting marks, cut on a word. */
const cut = (text: string) => quotedWords(text);

/** What an AI client wrote reads as Lyriks's (criterion ccaa0784), whatever name an older message recorded. */
const nameOf = (email: string, name: string) => (email.startsWith(AI_AUTHOR_PREFIX) ? 'Lyriks' : name);

function noticeOf(raw: DiscussionEvent): ActivityNotice {
	const d = { ...raw, authorName: nameOf(raw.authorEmail, raw.authorName) };
	const element = quoted(d.anchorTitle, 'an element');
	const person = { id: d.authorEmail, name: d.authorName };
	switch (d.kind) {
		case 'opened':
			return {
				section: 'Discussion',
				level: 'info',
				title: 'A new topic was opened.',
				body: [plain(`A new discussion started on ${element}. `), strong(d.authorName), plain(' opened it.')],
				line: shortLine(`${d.authorName} opened a topic on ${element}.`),
				action: { label: 'Join the discussion', icon: 'go' },
				visual: {
					kind: 'sheet',
					kicker: 'Topic on',
					title: d.anchorTitle.trim() || 'An element',
					badge: 'Open',
					fields: [
						{ label: 'Replies', value: '0' },
						{ label: 'Opened by', value: d.authorName },
						{ label: 'Notified', value: counted(d.notify.length, 'person', 'people') }
					],
					note: cut(d.text)
				}
			};
		case 'reply':
			return {
				section: 'Discussion',
				level: 'info',
				title: 'New reply in your discussion.',
				body: [
					plain(`There's a new reply in your discussion on ${element}. `),
					strong(counted(d.participants, 'person', 'people')),
					plain(` ${d.participants === 1 ? 'has' : 'have'} taken part so far. `),
					strong(d.authorName),
					plain(' replied.')
				],
				line: shortLine(`${d.authorName} replied about ${element}.`),
				action: { label: 'Read the reply', icon: 'go' },
				visual: {
					kind: 'thread',
					title: `${d.anchorTitle.trim() || 'Discussion'} · ${counted(d.participants, 'participant')}`,
					messages: [
						...(d.previous ? [{ person: { id: d.previous.authorEmail, name: nameOf(d.previous.authorEmail, d.previous.authorName) }, text: cut(d.previous.text) }] : []),
						{ person, text: cut(d.text) }
					]
				}
			};
		case 'resolved':
			return {
				section: 'Discussion',
				level: 'info',
				title: 'A discussion was resolved.',
				body: [plain(`The discussion on ${element} is closed. `), strong(d.authorName), plain(' resolved it.')],
				line: shortLine(`${d.anchorTitle.trim() || 'A discussion'}: the question is settled.`),
				action: { label: 'See the outcome', icon: 'go' },
				visual: { kind: 'thread', title: `Settled · ${d.anchorTitle.trim() || 'Discussion'}`, messages: [{ person: { id: d.openedBy.email, name: nameOf(d.openedBy.email, d.openedBy.name) }, text: cut(d.text) }] }
			};
		case 'reopened':
			return {
				section: 'Discussion',
				level: 'info',
				title: 'A discussion was reopened.',
				body: [plain(`The discussion on ${element} is open again. `), strong(d.authorName), plain(' reopened it.')],
				line: shortLine(`The discussion on ${element} is open again.`),
				action: { label: 'Read the discussion', icon: 'go' },
				visual: {
					kind: 'chain',
					nodes: [
						{ kicker: 'Opened', title: shortDate(d.openedAt), state: 'past' },
						...(d.resolvedAt ? [{ kicker: 'Resolved', title: shortDate(d.resolvedAt), state: 'struck' as const }] : []),
						{ kicker: 'Reopened', title: shortDate(d.at), state: 'now' }
					]
				}
			};
	}
}

export function discussionActivity(projectId: string, events: readonly DiscussionEvent[]): ActivityEvent[] {
	return events.map((d) => {
		const base = {
			id: `disc:${d.threadId}:${d.kind}:${d.at}`,
			projectId,
			at: d.at,
			actor: { id: d.authorEmail, kind: 'person' as const },
			actorName: d.authorName,
			text: d.text,
			where: `Specification · ${d.anchorTitle}`,
			href: d.href,
			to: d.notify,
			thread: `disc:${d.threadId}`,
			notice: noticeOf(d)
		};
		switch (d.kind) {
			case 'opened':
				return d.notify.length
					? { ...base, kind: 'mention' as const, line: `opened a discussion on “${d.anchorTitle}”` }
					: { ...base, kind: 'comment' as const, line: `opened a discussion on “${d.anchorTitle}”` };
			case 'reply':
				return { ...base, kind: 'reply' as const, line: `replied on “${d.anchorTitle}”` };
			case 'resolved':
				return { ...base, kind: 'resolved' as const, line: `resolved the discussion on “${d.anchorTitle}”`, text: '' };
			case 'reopened':
				return { ...base, kind: 'reopened' as const, line: `reopened the discussion on “${d.anchorTitle}”`, text: '' };
		}
	});
}
