import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { PLANS } from '$domain/tier';

const state = vi.hoisted(() => ({ page: { url: new URL('http://lyriks.test/'), data: {} } }));
vi.mock('$app/state', () => state);

const { default: PlansDialog } = await import('./PlansDialog.svelte');

/** Switching plan promises nothing a key alone does not do [issues.238] [issues.332]. */
describe('the Plans dialog says what switching plan takes', () => {
	const html = render(PlansDialog, { props: { current: PLANS[0], onclose: () => {} } }).body;

	it('offers Switch to <plan> for the other paid plans', () => {
		expect(html).toContain('href="/activate?plan=team"');
		expect(html).not.toContain('href="/activate?plan=community"');
	});

	it('says a key grants one of two editions and that the configuration moves the plan', () => {
		expect(html).toContain('a licence key grants one of two editions, Community or Enterprise.');
		expect(html).toContain('the key alone does not change which pages it opens.');
	});
});
