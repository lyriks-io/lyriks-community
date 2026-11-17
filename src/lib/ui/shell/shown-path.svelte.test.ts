import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	navigating: { to: null as { url: URL } | null },
	page: { url: new URL('http://lyriks.test/projects/p1/evolution') }
}));
vi.mock('$app/state', () => state);

const { shownPath } = await import('./shown-path.svelte');

describe('a tab lights the moment it is pressed [criterion:d7b34c94]', () => {
	it('marks the page being opened while it loads', () => {
		state.navigating.to = { url: new URL('http://lyriks.test/projects/p1/spec/features') };
		expect(shownPath()).toBe('/projects/p1/spec/features');
	});

	it('gives the mark back to the page still shown once the navigation fails or is given up', () => {
		state.navigating.to = null;
		expect(shownPath()).toBe('/projects/p1/evolution');
	});
});
