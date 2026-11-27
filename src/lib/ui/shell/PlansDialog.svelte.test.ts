import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { PLANS } from '$domain/tier';

const state = vi.hoisted(() => ({ page: { url: new URL('http://lyriks.test/'), data: {} } }));
vi.mock('$app/state', () => state);

const { default: PlansDialog } = await import('./PlansDialog.svelte');

/** Switching plan promises nothing a key alone does not do [issues.238] [issues.332]. */
describe('the Plans dialog says what switching plan takes [criterion:8b10c7cd]', () => {
	const html = render(PlansDialog, { props: { current: PLANS[0], onclose: () => {} } }).body;

	it('offers Switch to <plan> for the other paid plans', () => {
		expect(html).toContain('href="/activate?plan=team"');
		expect(html).not.toContain('href="/activate?plan=community"');
	});

	it('says a key grants one of two editions and that it decides alone on the Enterprise images', () => {
		expect(html).toContain('a licence key grants one of two editions, Community or Enterprise,');
		expect(html).toContain('the key in force decides what it opens');
		expect(html).toContain('it installs the Enterprise images.');
	});

	// EVO-016: the dialog says a key also states the number of active projects it grants.
	it('says a key grants a number of active projects too', () => {
		expect(html).toMatch(/and the number of active projects: one on Community, the number an Enterprise key states\./);
	});
});
