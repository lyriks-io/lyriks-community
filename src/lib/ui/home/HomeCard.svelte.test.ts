import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import HomeCard from './HomeCard.svelte';
import type { FeedCard } from '$lib/shared/home-feed';
import { LEVEL_WORD } from '$ui/shell/notification-view';

const drift: FeedCard = {
	id: 'sig|drift:f1:abc',
	projectId: 'sig',
	kind: 'alert',
	where: 'Signal for iOS · Code watch',
	at: new Date(Date.now() - 2 * 3600_000).toISOString(),
	level: 'drift',
	title: 'A change was made outside the process.',
	body: [{ text: 'The code of ' }, { text: '“Change phone number”', strong: true }, { text: ' changed outside Lyriks.' }],
	line: 'Change phone number: 1 element no longer matches the code',
	visual: { kind: 'speccode', rows: [{ spec: 'A user waits 30 days', code: 'let waitDays = 7', where: 'ChangePhoneNumber.swift:42', gone: false }], more: 0 },
	action: { label: 'Review on Mismatch', icon: 'go' },
	dismiss: 'Later',
	unread: true,
	initials: '',
	color: '',
	href: '/projects/sig/drift'
};
// The markup as read, without the scoping classes and the hydration marks.
const html = (card: FeedCard, unread: boolean) =>
	render(HomeCard, { props: { card, unread, onopen: () => {}, onaside: () => {} } })
		.body.replace(/<!--.*?-->/g, '')
		.replace(/ class="svelte-[a-z0-9]+"/g, '')
		.replace(/ svelte-[a-z0-9]+/g, '');

describe('A card of the feed is the bell’s card, larger [criterion:45137624]', () => {
	it('reads its project with no mark, its level, its title, its text opened by when and where, its action and Later', () => {
		const out = html(drift, true);
		expect(out).toContain('Signal for iOS');
		expect(out).toContain('2 hours ago, while watching the code, the code of <b>“Change phone number”</b> changed outside Lyriks.');
		expect(out).toContain('>Drift</span>');
		expect(out).toContain('A change was made outside the process.');
		expect(out).toContain('<b>“Change phone number”</b>');
		expect(out).toContain('Review on Mismatch');
		expect(out).toContain('>Later</button>');
	});

	it('says CRITICAL when it is', () => {
		const out = html({ ...drift, level: 'critical' }, true);
		expect(out).toMatch(/<article[^>]*data-level="critical"/);
		expect(out).toContain(`>${LEVEL_WORD.critical}</span>`);
		expect(out).not.toContain('>Drift</span>');
	});
});

describe('A feature whose code changed outside Lyriks reads as a DRIFT card that opens Mismatch [criterion:d18e3e74]', () => {
	it('draws what the specification says beside what the code does now', () => {
		const out = html(drift, true);
		expect(out).not.toContain('Specification ⟷ Code');
		expect(out).toContain('Specification says');
		expect(out).toContain('Code does');
		expect(out).toContain('A user waits 30 days');
		expect(out).toContain('<code>let waitDays = 7</code>');
		expect(html({ ...drift, visual: { kind: 'speccode', rows: [{ spec: 'The days left are shown', code: '', where: 'a.swift:3', gone: true }], more: 2 } }, true)).toContain('Removed from the code');
	});
});

describe('Got it or Later puts a card aside, the same read mark as the bell [criterion:7c08bd42]', () => {
	it('fades a card already read where it is, without Got it or Later', () => {
		const out = html(drift, false);
		expect(out).not.toContain('>Later</button>');
		expect(out).toContain('Review on Mismatch');
	});
});
