import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { SECTIONS, SECTION_AUDIENCE, isAgentAuthorable, isSection } from './sections';

/**
 * The wire vocabulary must cover exactly what the app can save. A section with a
 * `PUT /api/draft/<name>` route but no entry here is authorable in the UI and
 * invisible to every out-of-process author; an entry with no route is a promise
 * the API cannot keep. The MCP mirrors this list by hand (its tool enums are
 * built at registration time, before it can call us), so a section that never
 * lands here can never reach it — `finops`, `approvals` and `baselines` were
 * reachable in the app and missing from the MCP for exactly that reason.
 *
 * Only DIRECT child directories of /api/draft are wire sections: the Foundation
 * slice routes (foundation/identity|definition|operations) are nested and stay
 * out of the public vocabulary.
 */
describe('the authorable section vocabulary', () => {
	const draftRoutes = readdirSync('src/routes/api/draft', { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	it('exposes every section that has a write endpoint', () => {
		expect([...SECTIONS].sort()).toEqual(draftRoutes.sort());
	});

	it('rejects anything else', () => {
		expect(isSection('foundation')).toBe(true);
		expect(isSection('initialization')).toBe(false);
		expect(isSection('framing')).toBe(false);
		expect(isSection('foundations')).toBe(false);
		expect(isSection('')).toBe(false);
	});

	// The workspace's own running data is not the customer's product spec. An
	// agent that authors it invents a team roster and an AI budget for a real
	// organisation, so it must stay out of everything that ASKS for content.
	it('keeps the operator-owned and derived surfaces out of agent authoring', () => {
		expect(SECTIONS.filter((section) => SECTION_AUDIENCE[section] === 'operator')).toEqual([
			'supervision',
			'finops'
		]);
		expect(SECTIONS.filter((section) => SECTION_AUDIENCE[section] === 'derived')).toEqual([
			'coherence',
			'baselines'
		]);
		expect(isAgentAuthorable('supervision')).toBe(false);
		expect(isAgentAuthorable('finops')).toBe(false);
		expect(isAgentAuthorable('foundation')).toBe(true);
	});
});
