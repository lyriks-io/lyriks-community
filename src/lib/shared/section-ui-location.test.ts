import { describe, expect, it } from 'vitest';
import { UI_LOCATION } from './section-ui-location';
import { SECTIONS } from './sections';

/**
 * Every place an agent is told about is a page or a tab of the current
 * navigation, named as the interface names it (criterion 0aa782c2): the
 * Specification 360° chapters, Evolutions, or "not shown in the interface".
 */
describe('UI_LOCATION (criterion 0aa782c2)', () => {
	it('places every section in the current navigation, or says no page shows it', () => {
		for (const section of SECTIONS) {
			expect(UI_LOCATION[section], section).toMatch(/^(Specification 360° ›|Evolutions ›|Not shown in the interface|Not listed in the interface)/);
		}
	});

	it('names no page the interface no longer has', () => {
		const retired = /Foundation(?! document)|Control Center|Traceability|Rules tab|Roadmap|Work queue|Tech & Data|Users & Permissions|At a glance|Project health \(coverage/;
		for (const section of SECTIONS) expect(UI_LOCATION[section], section).not.toMatch(retired);
	});

	it('says which parts no page shows, so an agent does not author them', () => {
		expect(UI_LOCATION.foundation).toContain('NOT SHOWN in the interface');
		expect(UI_LOCATION.foundation).toContain('`definition.constraints.items`');
		expect(UI_LOCATION.foundation).toContain('`operations.testFixtures`');
		expect(UI_LOCATION.rules).toContain('`rules[]`, `inventory[]` and the edge cases');
		expect(UI_LOCATION.features).toContain('implementation index');
	});
});
