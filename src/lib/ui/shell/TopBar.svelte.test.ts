import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TopBar from './TopBar.svelte';
import { shell } from './shell-state.svelte';

const bar = () => render(TopBar).body.replace(/<!--.*?-->/g, '');

afterEach(() => {
	shell.menuOpen = false;
});

describe("the bar above every page holds the Menu alone: no trail, no chip of the reader's AI [criterion:8a6a568b] [criterion:4cb97f74]", () => {
	it('holds one control, the Menu that opens the navigation, and no text of its own', () => {
		const html = bar();
		expect(html.match(/<(button|a)\b/g)).toHaveLength(1);
		expect(html).toMatch(/<button[^>]*aria-label="Menu"/);
		expect(html.replace(/<[^>]*>/g, '').trim()).toBe('');
	});

	it('says whether the navigation it opens is open', () => {
		expect(bar()).toMatch(/aria-label="Menu"[^>]*aria-expanded="false"/);
		shell.menuOpen = true;
		expect(bar()).toMatch(/aria-label="Menu"[^>]*aria-expanded="true"/);
	});

	it('keeps the role of the old app bar, what sticks under the top of the page sticking under it', () => {
		expect(bar()).toMatch(/<header[^>]*data-app-bar/);
	});
});
