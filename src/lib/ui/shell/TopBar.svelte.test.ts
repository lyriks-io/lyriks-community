import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const state = vi.hoisted(() => ({ page: { url: new URL('http://lyriks.test/'), data: {} } }));
vi.mock('$app/state', () => state);

const { default: TopBar } = await import('./TopBar.svelte');

const bar = (path: string) => {
	state.page.url = new URL(`http://lyriks.test${path}`);
	return render(TopBar).body;
};

describe('no trail names where a page sits, and no chip of the reader\'s AI [criterion:8a6a568b] [criterion:4cb97f74]', () => {
	it('shows no breadcrumb on any page, Knowledge and Changes included', () => {
		for (const path of ['/', '/projects/kutt/spec', '/projects/kutt/spec/users', '/projects/kutt/evolution', '/projects/kutt/drift', '/settings']) {
			const html = bar(path);
			expect(html, path).toContain('data-app-bar');
			expect(html, path).toContain('aria-label="Menu"');
			expect(html, path).not.toContain('aria-label="Breadcrumb"');
			expect(html, path).not.toContain('>Kutt<');
		}
	});

	it('marks the bar bare on every page, so a wide screen hides it and a phone keeps it for its Menu', () => {
		for (const path of ['/', '/projects/kutt/spec', '/projects/kutt/drift', '/settings']) expect(bar(path), path).toMatch(/class="lk-top[^"]*\bbare\b/);
	});

	it('holds no chip of the reader\'s AI: Ask my AI in the navigation says where it stands', () => {
		expect(bar('/projects/kutt/spec')).not.toContain('Your AI');
	});
});
