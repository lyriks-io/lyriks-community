import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const state = vi.hoisted(() => ({ page: { url: new URL('http://lyriks.test/'), data: { onlineHelp: true } as Record<string, unknown> } }));
vi.mock('$app/state', () => state);

const { default: CommunityLock } = await import('./CommunityLock.svelte');

const STEP_LINK = '<a class="step svelte-';

beforeEach(() => {
	state.page.data = { onlineHelp: true };
});

/** Every lock Solo Builder opens reads as an offer with View plans (EVO-006). */
describe('the Community lock reads as an offer with View plans', () => {
	it('reads on Changes the offer of Evolutions under the Solo Builder tag, with View plans opening lyriks.io/pricing in a new tab [criterion:ac-leaf-14ef9bc4-cba7-4e8a-97eb-4138ee43b8bd] [criterion:ac-leaf-5939f8ea-76e4-4ca8-89f2-97de3a264a9f]', () => {
		const html = render(CommunityLock, { props: { lock: 'evolutions', title: 'Changes' } }).body;
		expect(html).toContain('<h1');
		expect(html).toContain('Changes');
		expect(html).toMatch(/<span class="plan[^"]*">Solo Builder<\/span>Evolutions are available from the Solo Builder plan\. Upgrade to keep building\./);
		expect(html).toContain(STEP_LINK);
		expect(html).toMatch(/href="https:\/\/lyriks\.io\/pricing" target="_blank" rel="noopener noreferrer">View plans<\/a>/);
		expect(html).not.toContain('See the plans');
	});

	it('shows on New Project the offer of more active projects, with View plans, instead of the form [criterion:ac-leaf-343d6e7d-aac1-4ec5-8a47-75da99d08d33] [criterion:ac-leaf-5939f8ea-76e4-4ca8-89f2-97de3a264a9f]', () => {
		const html = render(CommunityLock, { props: { lock: 'secondProject', title: 'Create your project' } }).body;
		expect(html).toContain('More active projects are available from the Solo Builder plan. Upgrade to keep building.');
		expect(html).toMatch(/target="_blank" rel="noopener noreferrer">View plans<\/a>/);
		expect(html).not.toContain('<form');
	});

	it('writes the address as text on an installation that allows no link out', () => {
		state.page.data = { onlineHelp: false };
		const html = render(CommunityLock, { props: { lock: 'evolutions' } }).body;
		expect(html).toContain('The plans: lyriks.io/pricing');
		expect(html).not.toContain('<a ');
	});
});
