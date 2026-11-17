import { describe, expect, it } from 'vitest';
import {
	anchorDomId,
	anchorKind,
	anchorOf,
	applyDiscussionAct,
	discussionEvents,
	discussionHref,
	emptyDiscussions,
	isAnchor,
	onFeaturesPages,
	placeOfAnchor,
	type DiscussionAct,
	type DiscussionAuthor,
	type DiscussionsDocument
} from './index';

const carmen: DiscussionAuthor = { email: 'carmen@acme.test', name: 'Carmen R.' };
const sarah: DiscussionAuthor = { email: 'sarah@acme.test', name: 'Sarah K.' };
const lea: DiscussionAuthor = { email: 'lea@acme.test', name: 'Léa P.' };

function play(steps: [DiscussionAct, DiscussionAuthor, string][]): DiscussionsDocument {
	let doc = emptyDiscussions();
	steps.forEach(([act, author, at], i) => {
		const out = applyDiscussionAct(doc, act, { author, at, threadId: 't1', messageId: `m${i}` });
		if (!out.ok) throw new Error(out.refusal);
		doc = out.document;
	});
	return doc;
}

describe('discussion events', () => {
	const doc = play([
		[{ kind: 'open', anchor: 'health:supervision', anchorTitle: 'Supervision', text: 'Who owns monitoring?', notify: ['sarah@acme.test'] }, carmen, '2026-10-26T09:00:00.000Z'],
		[{ kind: 'reply', threadId: 't1', text: 'I do.' }, sarah, '2026-10-26T10:00:00.000Z'],
		[{ kind: 'reply', threadId: 't1', text: 'Adding a probe.' }, lea, '2026-10-26T11:00:00.000Z'],
		[{ kind: 'resolve', threadId: 't1' }, sarah, '2026-10-26T12:00:00.000Z']
	]);
	const events = discussionEvents(doc, 'shop-1');

	it('lists what people did, newest first', () => {
		expect(events.map((e) => [e.kind, e.authorName])).toEqual([
			['resolved', 'Sarah K.'],
			['reply', 'Léa P.'],
			['reply', 'Sarah K.'],
			['opened', 'Carmen R.']
		]);
	});

	it('notifies everyone concerned, never the author', () => {
		const byKind = (kind: string, author: string) => events.find((e) => e.kind === kind && e.authorEmail === author)!;
		expect(byKind('opened', carmen.email).notify).toEqual(['sarah@acme.test']);
		expect(byKind('reply', sarah.email).notify).toEqual(['carmen@acme.test']);
		expect(byKind('reply', lea.email).notify).toEqual(['carmen@acme.test', 'sarah@acme.test']);
		expect(byKind('resolved', sarah.email).notify).toEqual(['carmen@acme.test', 'lea@acme.test']);
	});

	it('carries the element and a link to the thread', () => {
		const opened = events.find((e) => e.kind === 'opened')!;
		expect(opened).toMatchObject({ threadId: 't1', anchor: 'health:supervision', anchorTitle: 'Supervision', text: 'Who owns monitoring?' });
		expect(opened.href).toBe('/projects/shop-1/spec/tech/operations?discussion=t1');
		expect(events.find((e) => e.kind === 'resolved')!.text).toBe('Who owns monitoring?');
	});
});

describe('anchors', () => {
	it('are built from a kind and the element ids, and validated', () => {
		expect(anchorOf('rule', 'feat-a', 'r-1')).toBe('rule:feat-a:r-1');
		expect(anchorOf('problem')).toBe('problem');
		expect(anchorKind('term:term-1')).toBe('term');
		expect(isAnchor('rule:feat-a:r-1')).toBe(true);
		expect(isAnchor('rule::r-1')).toBe(false);
		expect(isAnchor('rule:a b')).toBe(false);
		expect(isAnchor('unknown:x')).toBe(false);
	});

	it('say which page holds the element', () => {
		expect(placeOfAnchor('problem')).toBe('');
		expect(placeOfAnchor('feature:feat-a')).toBe('features/feat-a');
		expect(placeOfAnchor('rule:feat-a:r-1')).toBe('features/feat-a');
		// An action reads on its own page (criterion 7d1e80b6), a core feature on its own, never on At a glance.
		expect(placeOfAnchor('action:feat-a:act-1')).toBe('features/feat-a');
		expect(placeOfAnchor('core:core-1')).toBe('features/core-1');
		expect(placeOfAnchor('rule:project:inv-1')).toBe('features');
		// A user and an action discussed for one user read on the user's page (criteria 4146848b, ddd20a3e).
		expect(placeOfAnchor('role:role-1')).toBe('users/role-1');
		expect(placeOfAnchor('permissions:role-1:action:feat-a:act-1')).toBe('users/role-1');
		expect(placeOfAnchor('permissions')).toBe('users');
		expect(placeOfAnchor('component:cmp-1')).toBe('experience');
		expect(placeOfAnchor('datamap')).toBe('tech/data-map');
		expect(placeOfAnchor('stack:tech-react')).toBe('tech/architecture');
		expect(placeOfAnchor('constraint:c-1')).toBe('tech/requirements');
		// A frame of the Overview is discussed as a whole on the Overview, never one item of it (criterion 416e4885).
		expect(isAnchor('overview:what')).toBe(true);
		expect(anchorOf('overview', 'who')).toBe('overview:who');
		expect(placeOfAnchor('overview:noticed')).toBe('');
		expect(placeOfAnchor('term:t-1')).toBe('glossary');
	});

	it('tell the elements the Features pages show, the core features included', () => {
		expect(['core:c-1', 'feature:feat-a', 'action:feat-a:a-1', 'rule:feat-a:r-1', 'flow:feat-a'].every(onFeaturesPages)).toBe(true);
		expect(['problem', 'journey:j-1', 'role:role-1', 'term:t-1', 'nowhere:x'].some(onFeaturesPages)).toBe(false);
	});

	it('give a DOM id and a link', () => {
		expect(anchorDomId('rule:feat-a:r.1')).toBe('kbt-rule_feat-a_r_1');
		expect(discussionHref('p 1', 'problem', 't/1')).toBe('/projects/p%201/spec?discussion=t%2F1');
	});
});

describe('a reopened discussion is told to everyone who took part [criterion:b7f648d8]', () => {
	const doc = play([
		[{ kind: 'open', anchor: 'health:supervision', anchorTitle: 'Supervision', text: 'Who owns monitoring?', notify: ['sarah@acme.test'] }, carmen, '2026-10-26T09:00:00.000Z'],
		[{ kind: 'reply', threadId: 't1', text: 'I do.' }, sarah, '2026-10-26T10:00:00.000Z'],
		[{ kind: 'resolve', threadId: 't1' }, sarah, '2026-10-27T12:00:00.000Z'],
		[{ kind: 'reopen', threadId: 't1' }, carmen, '2026-11-02T08:00:00.000Z']
	]);
	const events = discussionEvents(doc, 'shop-1');

	it('names when it opened and when it was resolved before, and never notifies the person who reopened it', () => {
		const reopened = events.find((e) => e.kind === 'reopened');
		expect(reopened).toMatchObject({ authorName: 'Carmen R.', openedAt: '2026-10-26T09:00:00.000Z', resolvedAt: '2026-10-27T12:00:00.000Z', notify: ['sarah@acme.test'], participants: 2 });
	});

	it('carries the message a reply follows', () => {
		expect(events.find((e) => e.kind === 'reply')?.previous).toEqual({ authorEmail: carmen.email, authorName: carmen.name, text: 'Who owns monitoring?' });
	});
});
