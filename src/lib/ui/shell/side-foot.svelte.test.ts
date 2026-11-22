import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { SIDE_ASK_ELSE_ID, SIDE_ASK_ID } from './side-ask';

/** The foot of the navigation holds Ask my AI right above Help & support, on every page (criteria 44aa7b4f, 8f9301b8). */

const at = vi.hoisted(() => ({ path: '/projects/kutt/spec' }));
vi.mock('$app/state', () => ({
	get page() {
		return { url: new URL(`http://lyriks.test${at.path}`), data: {}, params: {} };
	}
}));
const SideFoot = (await import('./SideFoot.svelte')).default;
const foot = (path: string) => {
	at.path = path;
	return render(SideFoot, { props: { live: [], steps: [] } }).body.replace(/<!--.*?-->/g, '');
};

describe('one Ask my AI, in the navigation, for every page [criterion:44aa7b4f]', () => {
	it("keeps the place of the page's own Ask my AI, then the project's own, right above Help & support", () => {
		const html = foot('/projects/kutt/spec/features');
		const order = [`id="${SIDE_ASK_ID}"`, `id="${SIDE_ASK_ELSE_ID}"`, 'data-tip="Help &amp; support"'].map((s) => html.indexOf(s));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		// Nothing else stands between Ask my AI and Help & support.
		expect(html.slice(order[1], html.lastIndexOf('<button', order[2]))).not.toMatch(/<(button|a)\b/);
	});

	it('greys Ask my AI outside a project, saying to open one first [criterion:8f9301b8]', () => {
		const html = foot('/settings');
		expect(html).toMatch(/<span[^>]*aria-disabled="true"[^>]*data-tip="Ask my AI: open a project first"/);
		expect(html).not.toContain(`id="${SIDE_ASK_ELSE_ID}"`);
		expect(foot('/projects/kutt/evolution')).not.toContain('open a project first');
	});
});
