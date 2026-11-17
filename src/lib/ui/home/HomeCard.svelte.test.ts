import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import HomeCard from './HomeCard.svelte';
import type { FeedCard } from '$lib/shared/home-feed';

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
		expect(out).toMatch(/<span class="ctx">.*Signal for iOS<\/span>/);
		expect(out).not.toContain('class="mk"');
		expect(out).toContain('2 hours ago, while watching the code, the code of <b>“Change phone number”</b> changed outside Lyriks.');
		expect(out).toContain('>Drift</span>');
		expect(out).toContain('A change was made outside the process.');
		expect(out).toContain('<b>“Change phone number”</b>');
		expect(out).toContain('Review on Mismatch');
		expect(out).toContain('>Later</button>');
	});

	it('wears a heavy frame when CRITICAL', () => {
		expect(html({ ...drift, level: 'critical' }, true)).toMatch(/class="fc[^"]*critical/);
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
		expect(out).toMatch(/class="fc[^"]*read/);
		expect(out).not.toContain('>Later</button>');
		expect(out).toContain('Review on Mismatch');
	});
});

describe('the action of a card keeps its slant when pressed [criterion:45137624]', () => {
	const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
	const css = source('./HomeCard.svelte');
	const app = source('../../../app.css');

	it('moves onto its shadow with translate, never with transform', () => {
		const pressed = css.slice(css.indexOf('.bev:active'), css.indexOf('}', css.indexOf('.bev:active')));
		expect(pressed).toContain('translate: 3px 3px');
		expect(pressed).not.toContain('transform');
	});

	it('keeps a hard shadow once grey on a card already read, moving as the orange one does', () => {
		const grey = css.slice(css.indexOf('.fc.read .bev'), css.indexOf('}', css.indexOf('.fc.read .bev')));
		expect(grey).toContain('--bev-shadow: var(--hm-faded)');
		expect(grey).not.toContain('box-shadow');
		expect(css).toContain('box-shadow: 3px 3px 0 var(--bev-shadow)');
		expect(css).toContain('box-shadow: 4px 4px 0 var(--bev-shadow)');
		expect(css).toContain('box-shadow: 0 0 0 var(--bev-shadow)');
	});

	it('is left out of the press the app gives its buttons', () => {
		expect(css).toContain('class="bev" data-own-press');
		expect(app.match(/\.evo-motion :where\(button\):not\([^)]*\[data-own-press\]\):(hover|active)/g)).toHaveLength(2);
	});
});
