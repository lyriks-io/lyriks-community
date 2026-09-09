import { test, expect } from '@playwright/test';

/**
 * Rendered-UI smoke for the core project capabilities. Proves the pages actually
 * render in a browser and that the autosave → server-load loop round-trips a
 * user's input (the core "fill an input and it persists" guarantee).
 */

const PROJECT = process.env.PW_PROJECT ?? 'checkout-flow';
const MUTATION_PROJECT = process.env.PW_MUTATION_PROJECT;

const CAPABILITIES: ReadonlyArray<readonly [path: string, eyebrow: string]> = [
	['foundation', 'Foundation'],
	['users', 'Users & Permissions'],
	['features', 'Features & Prioritization'],
	['experience', 'Design & Experience'],
	['infrastructure', 'Data & Architecture'],
	['glossary', 'Glossary']
];

test('all core project capabilities render in the browser', async ({ page }) => {
	for (const [path, eyebrow] of CAPABILITIES) {
		const res = await page.goto(`/projects/${PROJECT}/${path}`);
		expect(res?.status(), `${path} status`).toBeLessThan(400);
		await expect(page.getByText(eyebrow).first(), `${path} eyebrow`).toBeVisible();
	}
});

test('Foundation autosaves a typed field and persists it across reload', async ({ page }) => {
	test.skip(!MUTATION_PROJECT, 'PW_MUTATION_PROJECT must name a disposable project');
	await page.goto(`/projects/${MUTATION_PROJECT}/foundation`);

	const name = page.getByPlaceholder('e.g. Checkout Flow');
	await expect(name).toBeVisible();

	const value = `UI E2E ${Date.now()}`;
	await name.fill(value);
	// Autosave is debounced; give it time to flush to the server, then reload so
	// the value comes back through the SvelteKit server load (not client state).
	await page.waitForTimeout(1500);
	await page.reload();

	await expect(page.getByPlaceholder('e.g. Checkout Flow')).toHaveValue(value);
});
