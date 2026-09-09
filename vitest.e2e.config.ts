import { defineConfig } from 'vitest/config';

/**
 * E2E smoke config — deliberately plugin-free (no SvelteKit, no auto-companions)
 * so it never spawns the dev stack or needs `$lib` aliases. The tests are pure
 * HTTP against an already-running server (see tests/e2e/*), gated by `V3_E2E_URL`.
 *
 * Run:  V3_E2E_URL=http://localhost:5173 pnpm test:e2e
 * CI:   pnpm build && (node build &) ... then run with V3_E2E_URL set.
 */
export default defineConfig({
	test: {
		include: ['tests/e2e/**/*.test.ts'],
		// E2E hits a real server; give each request room.
		testTimeout: 30_000,
		hookTimeout: 30_000
	}
});
