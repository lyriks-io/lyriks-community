import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

/** The project's entries in the navigation, one row each under no heading (feat-feedback-docs). */

const at = vi.hoisted(() => ({ path: '/projects/kutt/spec/features/c1' }));
vi.mock('$app/state', () => ({
	get page() {
		return { url: new URL(`http://lyriks.test${at.path}`), data: {}, params: {} };
	},
	navigating: { to: null }
}));

const SideProjectNav = (await import('./SideProjectNav.svelte')).default;

const tabs = (list: ('retro' | 'spec' | 'evolutions')[], reversed = true) => ({ tabs: list, specBadge: 'validated' as const, specProgress: null, reversed, laterRunOpen: false });
const html = (props: Partial<{ tabs: ReturnType<typeof tabs>; openEvolutions: number; drift: { pending: number } | null }>) =>
	render(SideProjectNav, { props: { projectId: 'kutt', tabs: tabs(['spec', 'evolutions']), openEvolutions: 0, drift: null, ...props } }).body;
const labels = (body: string) => [...body.matchAll(/data-tip="([^"]+)"/g)].map((m) => m[1]);

describe('the project entries run flat, Reverse, Knowledge, Changes, Mismatch and Health [criterion:b2f17eef]', () => {
	it('lists the entries in their order, under no heading', () => {
		const body = html({ drift: { pending: 0 } });
		expect(labels(body)).toEqual(['Reverse', 'Knowledge', 'Changes', 'Mismatch', 'Health']);
		expect(body).not.toMatch(/Specification 360|Follow-up/);
	});

	it('counts the evolutions under way and the code changes waiting, and nothing when there is none', () => {
		const body = html({ openEvolutions: 4, drift: { pending: 2 } });
		expect(body).toMatch(/data-tip="Changes"[^>]*>.*?<span class="ncount">4<\/span>/s);
		expect(body).toMatch(/data-tip="Mismatch"[^>]*>.*?<span class="ncount">2<\/span>/s);
		expect(html({ openEvolutions: 0, drift: { pending: 0 } })).not.toContain('ncount');
	});

	it('keeps Knowledge lit on every page of a chapter, never Health there [criterion:8e942b12]', () => {
		expect(html({})).toMatch(/<a class="si on" href="\/projects\/kutt\/spec" aria-current="page" data-tip="Knowledge"/);
		at.path = '/projects/kutt/spec/noticed';
		expect(html({})).toMatch(/<a class="si on" href="\/projects\/kutt\/spec\/noticed" aria-current="page" data-tip="Health"/);
		at.path = '/projects/kutt/spec/features/c1';
	});
});

describe('Reverse opens the run under way, else the Reverse-Specifications of the product [criterion:9359cb3c]', () => {
	const ALL = ['Reverse', 'Knowledge', 'Changes', 'Mismatch', 'Health'];

	it('opens the run while it reads, every other entry kept', () => {
		const body = html({ tabs: tabs(['retro', 'spec', 'evolutions']) });
		expect(body).toMatch(/href="\/projects\/kutt\/retrospec"[^>]*data-tip="Reverse"/);
		expect(labels(body)).toEqual(ALL);
	});

	it('opens the Reverse page once the run is over, its history there [criterion:2dbed801]', () => {
		expect(html({})).toMatch(/href="\/projects\/kutt\/retrospec"[^>]*data-tip="Reverse"/);
		expect(html({})).not.toContain('?retro');
	});

	it('keeps the same five entries for a first run, a project never reversed and one with nothing yet [criterion:b2f17eef]', () => {
		expect(labels(html({ tabs: tabs(['retro'], true) }))).toEqual(ALL);
		expect(labels(html({ tabs: tabs(['spec'], false) }))).toEqual(ALL);
		expect(labels(html({ tabs: tabs([], false), drift: null }))).toEqual(ALL);
	});
});
