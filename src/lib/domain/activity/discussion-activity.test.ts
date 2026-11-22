import { describe, expect, it } from 'vitest';
import type { DiscussionEvent } from '$domain/discussions';
import { notificationsFor } from './activity';
import { discussionActivity } from './discussion-activity';

const d = (over: Partial<DiscussionEvent>): DiscussionEvent => ({
	threadId: 't1',
	anchor: 'rule:f1:r1',
	anchorTitle: 'VAT rounding rule',
	kind: 'opened',
	authorEmail: 'carmen@x.io',
	authorName: 'Carmen Roux',
	at: '2026-10-26T10:00:00.000Z',
	text: 'Which rounding do we keep?',
	notify: ['dylan@x.io'],
	href: '/projects/fac/spec/features/f1?discussion=t1#kbt-rule:f1:r1',
	participants: 1,
	openedBy: { email: 'carmen@x.io', name: 'Carmen Roux' },
	openedAt: '2026-10-26T10:00:00.000Z',
	...over
});
const read = (e: { notice?: { body: readonly { text: string; strong?: boolean }[] } } | undefined) => (e?.notice?.body ?? []).map((r) => (r.strong ? `**${r.text}**` : r.text)).join('');

describe('discussion activity', () => {
	it('tells the people a thread notifies that they were named, under the author\'s recorded name', () => {
		const events = discussionActivity('fac', [d({})]);
		const [mine] = notificationsFor(events, 'Dylan@X.io');
		expect(mine).toMatchObject({ kind: 'mention', actorName: 'Carmen Roux', where: 'Specification · VAT rounding rule' });
		expect(mine.line).toBe('opened a discussion on “VAT rounding rule”');
	});

	it('reads a thread nobody was notified of as a discussion opened, and a resolution without its opening words', () => {
		const events = discussionActivity('fac', [d({ notify: [] }), d({ kind: 'resolved', authorEmail: 'dylan@x.io', notify: ['carmen@x.io'], at: '2026-10-26T11:00:00.000Z' })]);
		expect(events.map((e) => `${e.kind} ${e.line} [${e.text}]`)).toEqual([
			'comment opened a discussion on “VAT rounding rule” [Which rounding do we keep?]',
			'resolved resolved the discussion on “VAT rounding rule” []'
		]);
		expect(notificationsFor(events, 'carmen@x.io').map((e) => e.kind)).toEqual(['resolved']);
	});
});

describe('a discussion tells its news as the brief words it [criterion:b7f648d8]', () => {
	it('a topic opened: what was asked on which element, then who opened it, its sheet as picture', () => {
		const [e] = discussionActivity('fac', [d({})]);
		expect(e.notice).toMatchObject({ section: 'Discussion', level: 'info', title: 'A new topic was opened.', action: { label: 'Join the discussion' } });
		expect(read(e)).toBe('A new discussion started on “VAT rounding rule”. **Carmen Roux** opened it.');
		expect(e.notice?.line).toBe('Carmen Roux opened a topic on “VAT rounding rule”.');
		expect(e.notice?.visual).toMatchObject({ kind: 'sheet', title: 'VAT rounding rule', badge: 'Open', note: 'Which rounding do we keep?' });
	});

	it('a reply: how many took part, then who replied, the message answered above the reply', () => {
		const [e] = discussionActivity('fac', [
			d({ kind: 'reply', authorEmail: 'dylan@x.io', authorName: 'Dylan Martin', text: 'Half up.', participants: 2, previous: { authorEmail: 'carmen@x.io', authorName: 'Carmen Roux', text: 'Which rounding do we keep?' } })
		]);
		expect(e.notice).toMatchObject({ level: 'info', title: 'New reply in your discussion.', action: { label: 'Read the reply' } });
		expect(read(e)).toBe('There\'s a new reply in your discussion on “VAT rounding rule”. **2 people** have taken part so far. **Dylan Martin** replied.');
		expect(e.notice?.visual?.kind === 'thread' && e.notice.visual.messages.map((m) => `${m.person.name}: ${m.text}`)).toEqual(['Carmen Roux: Which rounding do we keep?', 'Dylan Martin: Half up.']);
	});

	it('resolved, then reopened: the question settled, then the chain Opened, Resolved struck through, Reopened', () => {
		const events = discussionActivity('fac', [
			d({ kind: 'resolved', authorEmail: 'dylan@x.io', authorName: 'Dylan Martin', at: '2026-10-27T10:00:00.000Z' }),
			d({ kind: 'reopened', authorEmail: 'sarah@x.io', authorName: 'Sarah Klein', at: '2026-11-02T10:00:00.000Z', resolvedAt: '2026-10-27T10:00:00.000Z', notify: ['carmen@x.io', 'dylan@x.io'] })
		]);
		const [resolved, reopened] = events;
		expect(resolved.notice).toMatchObject({ title: 'A discussion was resolved.', action: { label: 'See the outcome' } });
		expect(read(resolved)).toBe('The discussion on “VAT rounding rule” is closed. **Dylan Martin** resolved it.');
		expect(reopened).toMatchObject({ kind: 'reopened', line: 'reopened the discussion on “VAT rounding rule”', notice: { title: 'A discussion was reopened.', action: { label: 'Read the discussion' } } });
		expect(reopened.notice?.visual).toEqual({
			kind: 'chain',
			nodes: [
				{ kicker: 'Opened', title: 'Oct 26', state: 'past' },
				{ kicker: 'Resolved', title: 'Oct 27', state: 'struck' },
				{ kicker: 'Reopened', title: 'Nov 2', state: 'now' }
			]
		});
		expect(notificationsFor(events, 'carmen@x.io').map((e) => e.kind)).toEqual(['reopened']);
		expect(notificationsFor(events, 'sarah@x.io')).toEqual([]);
	});

	it('names what an AI client wrote Lyriks, whatever name an older message recorded', () => {
		const [e] = discussionActivity('fac', [d({ kind: 'reply', authorEmail: 'ai:carmen@x.io', authorName: 'Your AI · for Carmen', text: 'Half up.', participants: 2 })]);
		expect(e.notice?.line).toBe('Lyriks replied about “VAT rounding rule”.');
		expect(read(e)).toContain('**Lyriks** replied.');
	});
});
