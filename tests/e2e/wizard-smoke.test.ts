import { describe, expect, it } from 'vitest';

/**
 * HTTP smoke test for the current project capabilities against a RUNNING app
 * server. Skipped unless `V3_E2E_URL` is set (e.g. http://localhost:5173), so
 * CI/local runs opt in after booting the stack. Pure fetch — no browser, no app
 * imports. Codifies the manual smoke + guards the v3↔back mirror fixes.
 *
 *   V3_E2E_URL=http://localhost:5173 pnpm test:e2e
 *   # optional: also assert the back mirror landed
 *   V3_E2E_URL=… V3_E2E_BACK_URL=http://127.0.0.1:3000 pnpm test:e2e
 */

const BASE = process.env.V3_E2E_URL?.replace(/\/$/, '');
const BACK = process.env.V3_E2E_BACK_URL?.replace(/\/$/, '');
const PROJECT = process.env.V3_E2E_PROJECT ?? 'checkout-flow';
const MUTATION_PROJECT = process.env.V3_E2E_MUTATION_PROJECT;
const BACK_PROJECT = process.env.V3_E2E_BACK_PROJECT_ID;
const BACK_EMAIL = process.env.LYRIKS_BACK_DEV_EMAIL ?? 'dev@lyriks.local';
const BACK_PASSWORD = process.env.LYRIKS_BACK_DEV_PASSWORD ?? 'LocalDevPass1!';

const CAPABILITIES = [
	'foundation',
	'users',
	'features',
	'experience',
	'infrastructure',
	'glossary',
	'documents',
	'traceability',
	'coherence'
] as const;

/**
 * Capabilities withdrawn from the product: registered and still authorable over
 * `/api/draft/*`, but with no page a user can reach. Asserted as 404 so a
 * re-exposed route fails the smoke run instead of quietly coming back.
 */
const WITHDRAWN_CAPABILITIES = ['supervision', 'finops'] as const;
const url = (path: string): string => `${BASE}${path}`;

const save = (projectId: string, path: string, body: Record<string, unknown>): Promise<Response> =>
	fetch(url(path), {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ projectId, ...body })
	});

describe.skipIf(!BASE)('Lyriks project smoke', () => {
	it('every core capability server-loads', async () => {
		for (const capability of CAPABILITIES) {
			const res = await fetch(url(`/projects/${PROJECT}/${capability}`));
			expect(res.status, `page ${capability}`).toBe(200);
		}
	});

	it('withdrawn capabilities are unreachable, drafts included', async () => {
		for (const capability of WITHDRAWN_CAPABILITIES) {
			const res = await fetch(url(`/projects/${PROJECT}/${capability}`), { redirect: 'manual' });
			expect(res.status, `page ${capability}`).toBe(404);
		}
		// The section stays in the wire vocabulary: it is still readable and writable
		// over the MCP surface, only its page is gone.
		const read = await fetch(url(`/api/sections?projectId=${PROJECT}&section=supervision`));
		expect(read.status, 'supervision section read').toBe(200);
	});

	it.skipIf(!MUTATION_PROJECT)('draft endpoints save a disposable project', async () => {
		const projectId = MUTATION_PROJECT!;
		expect(
			(await save(projectId, '/api/draft/foundation/identity', { productName: 'E2E Smoke' })).status
		).toBe(200);
		expect((await save(projectId, '/api/draft/foundation/definition', {})).status).toBe(200);
		expect((await save(projectId, '/api/draft/users', {})).status).toBe(200);
		expect((await save(projectId, '/api/draft/features', {})).status).toBe(200);
	});

	it('feature scoring endpoint responds with an availability flag', async () => {
		const res = await fetch(url(`/api/features/score?projectId=${PROJECT}`));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { available?: unknown; advice?: unknown };
		expect(body).toHaveProperty('available');
		expect(Array.isArray(body.advice)).toBe(true);
	});

	it('rejects a draft save with no projectId (400)', async () => {
		const res = await fetch(url('/api/draft'), {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ productName: 'no project' })
		});
		expect(res.status).toBe(400);
	});
});

// Optional: prove the v3 → Lyriks-back mirror landed (envelope keys present).
describe.skipIf(!BASE || !BACK || !BACK_PROJECT || !MUTATION_PROJECT)('platform → Lyriks Back mirror', () => {
	it('mirrors the wizard envelope onto the back project', async () => {
		await save(MUTATION_PROJECT!, '/api/draft', { productName: 'E2E Smoke' });

		const login = await fetch(`${BACK}/v1/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: BACK_EMAIL, password: BACK_PASSWORD })
		});
		expect(login.status, 'back login').toBe(200);
		const token = ((await login.json()) as { data: { token: string } }).data.token;

		let envelope: Record<string, unknown> = {};
		for (let attempt = 0; attempt < 20; attempt++) {
			const project = await fetch(`${BACK}/v1/projects/${BACK_PROJECT}`, {
				headers: { authorization: `Bearer ${token}` }
			});
			expect(project.status).toBe(200);
			envelope =
				((await project.json()) as { data: { wizard_envelope?: Record<string, unknown> } }).data
					.wizard_envelope ?? {};
			if (envelope.foundation) break;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		expect(Object.keys(envelope)).toContain('foundation');
	});
});
