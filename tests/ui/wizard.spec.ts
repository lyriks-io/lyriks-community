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

test('retired modules are absent and Baselines still renders', async ({ page }) => {
	await page.goto(`/projects/${PROJECT}/traceability?tab=baselines`);
	await expect(page.getByRole('heading', { name: 'Named versions of the spec.' })).toBeVisible();
	for (const module of ['supervision', 'finops']) {
		await expect(page.locator(`a[href*="/${module}"]`)).toHaveCount(0);
		const response = await page.goto(`/projects/${PROJECT}/${module}`);
		expect(response?.status(), module).toBe(404);
	}
});

test('Foundation autosaves a typed field and persists it across reload', async ({ page }) => {
	test.skip(!MUTATION_PROJECT, 'PW_MUTATION_PROJECT must name a disposable project');
	await page.goto(`/projects/${MUTATION_PROJECT}/foundation`);

	await expect(page.locator('[data-lyriks-hydrated="true"]')).toBeVisible();
	await page.getByRole('button', { name: 'Product name' }).click();
	const name = page.getByRole('textbox', { name: 'Product name' });
	await expect(name).toBeVisible();

	const value = `UI E2E ${Date.now()}`;
	await name.fill(value);
	await name.press('Enter');
	// Autosave is debounced; give it time to flush to the server, then reload so
	// the value comes back through the SvelteKit server load (not client state).
	await page.waitForTimeout(1500);
	await page.reload();

	await expect(page.getByRole('button', { name: 'Product name' })).toHaveText(value);
});
