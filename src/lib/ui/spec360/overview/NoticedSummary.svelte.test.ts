import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { NoticedSummary as Summary } from '$application/spec360/noticed';
import NoticedSummary from './NoticedSummary.svelte';

const summary = (over: Partial<Summary> = {}): Summary => ({
	total: 300,
	toConfirm: 0,
	pending: 271,
	settled: 29,
	major: 3,
	minor: 268,
	types: [
		{ key: 'code', label: 'Code', meaning: 'What the code says', count: 185, major: 0 },
		{ key: 'final-check', label: 'Final check', meaning: 'What the final check could not confirm', count: 1, major: 1 }
	],
	...over
});
const html = (s: Summary) => render(NoticedSummary, { props: { summary: s, href: '/projects/p/spec/noticed' } }).body.replace(/<!--.*?-->/g, '');

describe('the Overview sums up What Lyriks noticed, whose list has a page of its own [criterion:55a7fe86]', () => {
	it('reads the bar and its legend, one line per type with its count and its major points, then Review the N points', () => {
		const body = html(summary());
		expect(body).toContain('aria-label="3 major and 268 minor to review, 29 settled"');
		expect(body).toMatch(/<b class="text-ink">3<\/b>major/);
		expect(body).toMatch(/<b class="text-ink">29<\/b>settled/);
		expect(body).toContain('href="/projects/p/spec/noticed?type=code"');
		expect(body).toContain('title="What the code says"');
		expect(body).toMatch(/>185<\/b>\u00a0points</);
		expect(body).toMatch(/>1<\/b>\u00a0point</);
		// A type with major points says how many in a red tag; one without reads none.
		expect(body.match(/ major<\/span>/g)).toHaveLength(1);
		expect(body).toContain('1 major</span>');
		expect(body).toContain('href="/projects/p/spec/noticed"');
		expect(body).toContain('Review the 271 points');
	});

	it('names the button after what is left: one point, or every point once all are settled', () => {
		expect(html(summary({ pending: 1, settled: 299 }))).toContain('Review the point<');
		expect(html(summary({ pending: 0, settled: 300, major: 0, minor: 0 }))).toContain('See the 300 points');
	});
});

describe('the fixes waiting for confirmation are counted apart [criterion:e75b8909]', () => {
	it('reads N fixes to confirm on a line of its own that opens Health on them, and none when there is none', () => {
		const body = html(summary({ toConfirm: 3 }));
		expect(body).toContain('3 fixes to confirm');
		expect(body).toContain('href="/projects/p/spec/noticed?type=fix-to-confirm"');
		expect(html(summary())).not.toContain('to confirm');
	});
});
