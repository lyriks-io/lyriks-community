import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const state = vi.hoisted(() => ({
	page: { url: new URL('http://lyriks.test/'), data: {} as Record<string, unknown>, params: {} }
}));
vi.mock('$app/state', () => state);
vi.mock('$app/navigation', () => ({ afterNavigate: () => {}, goto: async () => {}, invalidateAll: async () => {}, replaceState: () => {} }));

const { openOnboarding } = await import('./onboarding.svelte');
const { default: OnboardingDialog } = await import('./OnboardingDialog.svelte');

// EVO-016: New Project shows the key's limit instead of its form, with no plan to buy.
describe('New Project on an installation whose key holds no more projects [criterion:ac-leaf-ff8aad5f-23ae-48f8-b999-9ad426ac53b4]', () => {
	it('shows the notice instead of the form', () => {
		const reason = "This installation's licence holds 2 active projects. Ask for a key with more projects to keep building.";
		state.page.data = { projectCreation: { ok: false, reason, detail: '', plan: null } };
		openOnboarding();
		const html = render(OnboardingDialog, { props: { hasProject: true } }).body;
		expect(html).toContain(reason);
		expect(html).toContain('data-project-limit');
		expect(html).not.toContain('Project name');
		expect(html).not.toContain('data-community-lock');
	});
});
