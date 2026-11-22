import { describe, expect, it } from 'vitest';
import {
	activeProjectAccess,
	defaultActiveProject,
	evolutionAccess,
	evolutionOpeningSentence,
	isUpgradePlan,
	lockedSentence,
	planOpening,
	PRICING_ADDRESS,
	projectCreation
} from './community-scope';

describe('the Community scope (EVO-001)', () => {
	it('refuses a second project on Community only, with the offer of Solo Builder [criterion:ac-leaf-343d6e7d-aac1-4ec5-8a47-75da99d08d33]', () => {
		const refused = projectCreation('community', 1);
		expect(refused).toEqual({
			ok: false,
			reason: 'More active projects are available from the Solo Builder plan. Upgrade to keep building.',
			detail: 'See https://lyriks.io/pricing.',
			plan: 'solo_builder'
		});
		expect(projectCreation('community', 0).ok).toBe(true);
		expect(projectCreation('enterprise', 5).ok).toBe(true);
		expect(projectCreation(undefined, 5).ok).toBe(true);
	});

	it('locks every Evolution operation on Community with the offer of Solo Builder [criterion:ac-leaf-14ef9bc4-cba7-4e8a-97eb-4138ee43b8bd]', () => {
		expect(evolutionAccess('community')).toEqual({
			ok: false,
			reason: 'Evolutions are available from the Solo Builder plan. Upgrade to keep building.',
			detail: 'See https://lyriks.io/pricing.',
			plan: 'solo_builder'
		});
		expect(evolutionAccess('enterprise').ok).toBe(true);
	});

	it('words New Project and Evolutions as offers of Solo Builder followed by Upgrade; Share the project names Team, and a solver proof names Enterprise [criterion:ac-leaf-5939f8ea-76e4-4ca8-89f2-97de3a264a9f]', () => {
		expect(lockedSentence('secondProject')).toBe('More active projects are available from the Solo Builder plan. Upgrade to keep building.');
		expect(lockedSentence('evolutions')).toBe('Evolutions are available from the Solo Builder plan. Upgrade to keep building.');
		// Sharing and the solver keep their own sentences, each naming its plan (EVO-006, Solution).
		expect(planOpening('sharing')).toBe('team');
		expect(lockedSentence('sharing')).toBe('Community holds one user. Team opens sharing with your team.');
		expect(planOpening('solver')).toBe('enterprise');
		expect(lockedSentence('solver')).toBe('Proving a rule for every value is part of Enterprise.');
	});

	it('words opening an evolution from a page as the offer for this evolution [criterion:ac-leaf-abf964ef-8922-4890-80c6-22921807af7e]', () => {
		expect(evolutionOpeningSentence()).toBe('Evolutions are available from the Solo Builder plan. Upgrade to open this evolution and keep building.');
	});

	it('reads a plan only when it names one, and writes the address of the plans as text', () => {
		expect(isUpgradePlan('solo_builder')).toBe(true);
		expect(isUpgradePlan('toString')).toBe(false);
		expect(isUpgradePlan(undefined)).toBe(false);
		expect(PRICING_ADDRESS).toBe('lyriks.io/pricing');
	});

	it('holds an inactive project shut on a Community installation moved down from a paid plan', () => {
		const input = { projectId: 'b', activeProjectId: 'a', projectCount: 3 };
		expect(activeProjectAccess('community', input)).toMatchObject({ ok: false });
		expect(activeProjectAccess('community', { ...input, projectId: 'a' }).ok).toBe(true);
		expect(activeProjectAccess('community', { ...input, projectCount: 1 }).ok).toBe(true);
		expect(activeProjectAccess('enterprise', input).ok).toBe(true);
	});

	it('takes the project saved last as active when none was chosen', () => {
		expect(defaultActiveProject([])).toBeNull();
		expect(
			defaultActiveProject([
				{ id: 'old', lastSavedAt: '2026-01-01T00:00:00Z' },
				{ id: 'new', lastSavedAt: '2026-11-01T00:00:00Z' },
				{ id: 'never', lastSavedAt: null }
			])
		).toBe('new');
	});
});
