import { describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SECTIONS, SECTION_AUDIENCE, SECTION_REVISION_STORAGE, isAgentAuthorable, isSection } from './sections';
import { requestEvent, type TestEvent } from '$lib/server/request-event.fixture';

/** The spec the last draft route handed to the save protocol, which stores nothing here. */
const saved = vi.hoisted(() => ({ spec: null as { readonly atomic?: boolean } | null }));
vi.mock('$lib/server/section-save.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/section-save.server')>()),
	saveSectionDraft: async (_event: unknown, spec: { readonly atomic?: boolean }) => {
		saved.spec = spec;
		return new Response(null, { status: 204 });
	}
}));
/** Read through a call, so the reset to null before each route does not narrow what the route then set. */
const lastSpec = () => saved.spec;
const draftRoute = import.meta.glob<{ PUT: (event: TestEvent) => unknown }>('/src/routes/api/draft/*/+server.ts');

/**
 * The wire vocabulary must cover exactly what the app can save. A section with a
 * `PUT /api/draft/<name>` route but no entry here is authorable in the UI and
 * invisible to every out-of-process author; an entry with no route is a promise
 * the API cannot keep. The MCP mirrors this list by hand (its tool enums are
 * built at registration time, before it can call us), so a section that never
 * lands here can never reach it — `approvals` and `baselines` were
 * reachable in the app and missing from the MCP for exactly that reason.
 *
 * Only DIRECT child directories of /api/draft are wire sections: the Foundation
 * slice routes (foundation/identity|definition|operations) are nested and stay
 * out of the public vocabulary.
 */
describe('the authorable section vocabulary', () => {
	const draftRoutes = readdirSync('src/routes/api/draft', { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join('src/routes/api/draft', entry.name, '+server.ts')))
		.map((entry) => entry.name);

	// Evolution is read like a section and written only through its typed
	// operations (POST /api/evolution, apply_evolution_batch): no raw PUT exists
	// that could walk past the lifecycle guards.
	const raw = SECTIONS.filter((section) => section !== 'evolution');

	it('exposes every section that has a write endpoint', () => {
		expect([...raw].sort()).toEqual(draftRoutes.sort());
		expect(existsSync('src/routes/api/draft/evolution/+server.ts')).toBe(false);
		expect(existsSync('src/routes/api/evolution/+server.ts')).toBe(true);
	});

	it('reads revisions from the same channel as each public save endpoint', async () => {
		// What each route really hands the save protocol: the spec it saves with,
		// whether written inline or taken from the shared registry a landing uses too.
		const routes = await Promise.all(raw.map((section) => draftRoute[`/src/routes/api/draft/${section}/+server.ts`]()));
		for (const [i, section] of raw.entries()) {
			const route = routes[i];
			saved.spec = null;
			await route.PUT(requestEvent({ path: `/api/draft/${section}`, method: 'PUT' }));
			const spec = lastSpec();
			expect(spec, section).not.toBeNull();
			expect(SECTION_REVISION_STORAGE[section], section).toBe(spec?.atomic ? 'document' : 'legacy');
		}
	}, 60_000);

	it('rejects anything else', () => {
		expect(isSection('foundation')).toBe(true);
		expect(isSection('initialization')).toBe(false);
		expect(isSection('framing')).toBe(false);
		expect(isSection('foundations')).toBe(false);
		expect(isSection('')).toBe(false);
		expect(isSection('supervision')).toBe(false);
		expect(isSection('finops')).toBe(false);
	});

	it('keeps derived surfaces out of agent authoring, Evolution included', () => {
		expect(SECTIONS.filter((section) => SECTION_AUDIENCE[section] === 'derived')).toEqual([
			'coherence',
			'baselines',
			'evolution'
		]);
		expect(isAgentAuthorable('foundation')).toBe(true);
		// A dossier is driven by apply_evolution_batch, so the completion gate
		// never asks an author for a verdict on it.
		expect(isAgentAuthorable('evolution')).toBe(false);
	});
});
