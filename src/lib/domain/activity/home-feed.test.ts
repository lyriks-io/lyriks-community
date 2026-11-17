import { describe, expect, it } from 'vitest';
import { feedInOrder, feedLead, feedProjects, feedSince, feedSummary, inFeed, type FeedItem, type SummaryPart } from './home-feed';
import { greeting } from './home-greeting';
import type { NoticeLevel } from './notice';

interface Card extends FeedItem {
	readonly id: string;
	readonly unread: boolean;
}

let n = 0;
const card = (level: NoticeLevel, unread: boolean, projectId = 'tsk', at = `2026-11-02T1${n % 10}:00:00.000Z`): Card => ({ id: `c${++n}`, level, unread, projectId, at });
const unread = (c: Card) => c.unread;
const said = (parts: readonly SummaryPart[]) => parts.map((p) => p.text).join('');
const buttons = (parts: readonly SummaryPart[]) => parts.flatMap((p) => (p.kind === 'filter' ? [[p.filter, p.text]] : []));

describe('Home greets the reader, sums up what came in, then shows the feed, the most urgent first [criterion:85c17859]', () => {
	it('greets by the reader’s hour and first name', () => {
		expect(greeting(9, 'Carmen Durand')).toBe('Good morning, Carmen');
		expect(greeting(14, 'Carmen')).toBe('Good afternoon, Carmen');
		expect(greeting(20, '')).toBe('Good evening');
		expect(greeting(3, 'Carmen')).toBe('Good evening, Carmen');
	});

	it('orders the cards by level, the most urgent first, newest first within a level', () => {
		const old = card('drift', true, 'a', '2026-11-01T10:00:00.000Z');
		const fresh = card('drift', false, 'a', '2026-11-02T10:00:00.000Z');
		const info = card('info', true);
		const critical = card('critical', true);
		const action = card('action', false);
		expect(feedInOrder([info, old, critical, fresh, action]).map((c) => c.id)).toEqual([critical.id, fresh.id, old.id, action.id, info.id]);
	});

	it('says since when the oldest unread card came in, and nothing when none is unread', () => {
		const cards = [card('info', true, 'a', '2026-11-03T08:00:00.000Z'), card('info', true, 'a', '2026-11-02T18:40:00.000Z'), card('info', false, 'a', '2026-10-01T08:00:00.000Z')];
		expect(feedSince(cards, unread)).toBe('2026-11-02T18:40:00.000Z');
		expect(feedSince([card('info', false)], unread)).toBeNull();
	});
});

describe('One sentence sums up the feed, and its numbers filter it [criterion:bae09099]', () => {
	it('counts the new events, the decisions, the drifts with the critical ones, the actions and the missing pieces', () => {
		const cards = [
			card('critical', true, 'tsk'),
			card('drift', true, 'sig'),
			card('drift', true, 'sig'),
			card('action', true, 'tsk'),
			card('missing', true, 'exc'),
			card('info', true, 'flp'),
			card('info', false, 'tet')
		];
		const parts = feedSummary(cards, unread, 5);
		expect(said(parts)).toBe(
			'6 new events came in on 5 projects. 5 decisions wait for you. 3 drifts away from the spec, 1 critical. There are also 1 action to take and 1 missing piece of an evolution.'
		);
		expect(buttons(parts)).toEqual([
			['new', '6 new events'],
			['all', '5 projects'],
			['decisions', '5 decisions'],
			['drifts', '3 drifts']
		]);
		expect(parts.find((p) => p.text === '1 critical')?.kind).toBe('bold');
	});

	it('says what has nothing to count in its own words', () => {
		expect(said(feedSummary([card('info', true, 'a')], unread, 1))).toBe('1 new event came in on 1 project. Nothing waits for your decision. ');
		expect(said(feedSummary([card('action', true, 'a')], unread, 1))).toBe('1 new event came in on 1 project. 1 decision waits for you. There is also 1 action to take.');
		const quiet = feedSummary([card('drift', false, 'a')], unread, 1);
		expect(said(quiet)).toBe('Nothing new came in. Nothing waits for your decision, and every project follows its specification.');
		expect(buttons(quiet)).toEqual([]);
	});

	it('filters the feed on a number: the new events, the decisions or the drifts, every card again on the projects', () => {
		const cards = [card('drift', true, 'a'), card('info', true, 'a'), card('action', false, 'b'), card('critical', true, 'b')];
		const shown = (filter: Parameters<typeof inFeed>[1]) => cards.filter((c) => inFeed(c, filter, new Set(), unread)).map((c) => c.level);
		expect(shown('all')).toEqual(['drift', 'info', 'action', 'critical']);
		expect(shown('new')).toEqual(['drift', 'info', 'critical']);
		expect(shown('decisions')).toEqual(['drift', 'critical']);
		expect(shown('drifts')).toEqual(['drift', 'critical']);
	});
});

describe('The feed is limited to some projects from All projects [criterion:9d847801]', () => {
	it('lists the projects that have cards with their counts, and shows only the projects ticked', () => {
		const cards = [card('info', true, 'a'), card('info', true, 'b'), card('drift', true, 'b')];
		expect(feedProjects(cards)).toEqual([
			{ projectId: 'a', count: 1 },
			{ projectId: 'b', count: 2 }
		]);
		expect(cards.filter((c) => inFeed(c, 'all', new Set(['b']), unread)).map((c) => c.projectId)).toEqual(['b', 'b']);
		expect(cards.filter((c) => inFeed(c, 'drifts', new Set(['a']), unread))).toEqual([]);
	});
});

describe('A card of the feed is the bell’s card, larger, and its text opens on when and where [criterion:45137624]', () => {
	const read = (runs: readonly { text: string; strong?: boolean }[]) => runs.map((r) => (r.strong ? `**${r.text}**` : r.text)).join('');

	it('opens the text on when and where, the first word in a small letter', () => {
		expect(read(feedLead('2 hours ago', 'Reverse-Specification', [{ text: 'The AI went silent at ' }, { text: '62%', strong: true }, { text: '.' }]))).toBe(
			'2 hours ago, during the Reverse-Specification, the AI went silent at **62%**.'
		);
		expect(read(feedLead('Yesterday at 18:40', 'Code watch', [{ text: 'The code of ' }, { text: '“Login”', strong: true }, { text: ' changed outside Lyriks.' }]))).toBe(
			'Yesterday at 18:40, while watching the code, the code of **“Login”** changed outside Lyriks.'
		);
		expect(read(feedLead('Just now', 'Evolution', [{ text: 'You’re asked for your input.' }]))).toBe('Just now, on an evolution, you’re asked for your input.');
	});

	it('keeps a name as it is written', () => {
		expect(read(feedLead('5 minutes ago', 'Reverse-Specification', [{ text: 'Lyriks is now reading the product.' }]))).toBe(
			'5 minutes ago, during the Reverse-Specification, Lyriks is now reading the product.'
		);
		expect(read(feedLead('An hour ago', 'Evolution', [{ text: 'Guest access', strong: true }, { text: ' was cancelled.' }]))).toBe('An hour ago, on an evolution, **Guest access** was cancelled.');
	});

	it('leaves out where when the text already says it, or when the section has no words', () => {
		expect(read(feedLead('3 hours ago', 'Specification', [{ text: 'The specification of X was amended.' }]))).toBe('3 hours ago, the specification of X was amended.');
		expect(read(feedLead('3 hours ago', 'Discussion', [{ text: 'While you were away, two replies came in.' }]))).toBe('3 hours ago, while you were away, two replies came in.');
		expect(read(feedLead('3 hours ago', 'Specification 360°', [{ text: 'A note.' }]))).toBe('3 hours ago, a note.');
	});

	it('reads as a sentence of its own when the card has no text', () => {
		expect(read(feedLead('On Monday at 09:12', 'Team', []))).toBe('On Monday at 09:12, in the team.');
	});
});
