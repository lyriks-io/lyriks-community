import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SideHead from './SideHead.svelte';

const head = (folded: boolean) => render(SideHead, { props: { folded, iconsOnly: folded } }).body;

describe('folded, the head of the navigation is the Lyriks mark that opens it [criterion:53c5c6f0]', () => {
	it('shows the mark, its three bars and an arrow, on the button that unfolds the navigation', () => {
		const html = head(true);
		expect(html).toContain('class="mk"');
		expect(html.match(/<rect x="0" y="\d+" width="\d+" height="4" fill="var\(--color-(blue|violet|orange)\)"/g)).toHaveLength(3);
		expect(html).toContain('aria-label="Expand the sidebar"');
		expect(html).toContain('data-tip="Expand the sidebar ( [ )"');
		// The unfold icon is there too, shown in place of the mark under the pointer or the keyboard.
		expect(html).toContain('class="pn"');
	});

	it('unfolded, keeps the logo leading Home and the fold button, without the mark', () => {
		const html = head(false);
		expect(html).toContain('aria-label="Lyriks, home"');
		expect(html).toContain('aria-label="Collapse the sidebar"');
		expect(html).not.toContain('class="mk"');
		expect(html).not.toContain('data-tip=');
	});
});
