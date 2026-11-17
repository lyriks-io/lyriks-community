import { test, expect } from '@playwright/test';

/** Modules the product retired stay gone, and the page that outlived them still renders. */

const PROJECT = process.env.PW_PROJECT ?? 'checkout-flow';

test('retired modules are absent and Baselines still renders', async ({ page }) => {
	await page.goto(`/projects/${PROJECT}/traceability?tab=baselines`);
	await expect(page.getByRole('tab', { name: 'Baselines', selected: true })).toBeVisible();
	for (const module of ['supervision', 'finops']) {
		await expect(page.locator(`a[href*="/${module}"]`)).toHaveCount(0);
		const response = await page.goto(`/projects/${PROJECT}/${module}`);
		expect(response?.status(), module).toBe(404);
	}
});

