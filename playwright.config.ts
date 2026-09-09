import { defineConfig } from '@playwright/test';

/**
 * Browser E2E for the rendered wizard UI. Complements the HTTP smoke
 * (`tests/e2e/`, vitest) by actually driving Chromium.
 *
 * By default it builds the app and serves the adapter-node output standalone on
 * PW_PORT (no dev companions, no port fights with the back). Point at an
 * already-running server instead with `PW_BASE_URL=http://localhost:5173`.
 */
const PORT = process.env.PW_PORT ?? '4321';
const BASE = process.env.PW_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: 'tests/ui',
	timeout: 30_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	reporter: 'list',
	use: { baseURL: BASE, headless: true, browserName: 'chromium' },
	// Skip the managed server when pointed at an existing one.
	webServer: process.env.PW_BASE_URL
		? undefined
		: {
				command: 'pnpm build && node build',
				env: { PORT, HOST: '127.0.0.1' },
				url: BASE,
				timeout: 120_000,
				reuseExistingServer: !process.env.CI
			}
});
