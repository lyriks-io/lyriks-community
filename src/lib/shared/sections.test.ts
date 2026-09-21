import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECTIONS, SECTION_AUDIENCE, SECTION_REVISION_STORAGE, isAgentAuthorable, isSection } from './sections';

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

	it('exposes every section that has a write endpoint', () => {
		expect([...SECTIONS].sort()).toEqual(draftRoutes.sort());
	});

	it('reads revisions from the same channel as each public save endpoint', () => {
		for (const section of SECTIONS) {
			const route = readFileSync(join('src/routes/api/draft', section, '+server.ts'), 'utf8');
			const atomic = /atomic:\s*true/.test(route);
			expect(SECTION_REVISION_STORAGE[section], section).toBe(atomic ? 'document' : 'legacy');
		}
	});

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
