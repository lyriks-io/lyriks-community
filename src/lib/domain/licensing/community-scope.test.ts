import { describe, expect, it } from 'vitest';
import {
	activeProjectAccess,
	defaultActiveProject,
	defaultActiveProjects,
	evolutionAccess,
	evolutionOpeningSentence,
	isUpgradePlan,
	lockedSentence,
	planOpening,
	PRICING_ADDRESS,
	projectCreation,
	projectsInForce,
	resolveActiveProjects
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
		const input = { projectId: 'b', activeProjectIds: ['a'], projectCount: 3, granted: 1 };
		expect(activeProjectAccess('community', input)).toMatchObject({ ok: false, plan: 'solo_builder' });
		expect(activeProjectAccess('community', { ...input, projectId: 'a' }).ok).toBe(true);
		expect(activeProjectAccess('community', { ...input, projectCount: 1 }).ok).toBe(true);
		expect(activeProjectAccess('enterprise', { ...input, granted: null }).ok).toBe(true);
	});

	// EVO-016, criterion e00f8726: the Community rule with N instead of 1.
	it('holds shut every project but the N active ones when the key grants fewer than the installation holds [criterion:ac-leaf-e00f8726-ec61-4b51-b8f6-a32794c70c36]', () => {
		const input = { projectId: 'c', activeProjectIds: ['a', 'b'], projectCount: 3, granted: 2 };
		const held = activeProjectAccess('enterprise', input);
		expect(held).toMatchObject({ ok: false, plan: null });
		expect(held.ok ? '' : held.reason).toBe(
			"This project is inactive: this installation's licence holds 2 active projects. Make it an active project to open it."
		);
		expect(activeProjectAccess('enterprise', { ...input, projectId: 'b' }).ok).toBe(true);
		expect(activeProjectAccess('enterprise', { ...input, projectCount: 2 }).ok).toBe(true);
	});

	it('reads the number of active projects in force: 1 on Community, the key number on Enterprise, every project without one', () => {
		expect(projectsInForce('community', 7)).toBe(1);
		expect(projectsInForce('enterprise', 3)).toBe(3);
		expect(projectsInForce('enterprise', null)).toBeNull();
		expect(projectsInForce(undefined, null)).toBeNull();
	});

	// EVO-016, criteria ff8aad5f and 55c38a1e.
	it('refuses a project beyond the number an Enterprise key grants, and creates as before below it or without a number [criterion:ac-leaf-ff8aad5f-23ae-48f8-b999-9ad426ac53b4] [criterion:ac-leaf-55c38a1e-a7de-445d-a584-3e992c46cdfb]', () => {
		const refused = projectCreation('enterprise', 3, 3);
		expect(refused).toMatchObject({
			ok: false,
			plan: null,
			reason: "This installation's licence holds 3 active projects. Ask for a key with more projects to keep building."
		});
		expect(projectCreation('enterprise', 2, 3).ok).toBe(true);
		expect(projectCreation('enterprise', 40, null).ok).toBe(true);
		expect(projectCreation('enterprise', 1, 1)).toMatchObject({
			ok: false,
			reason: "This installation's licence holds 1 active project. Ask for a key with more projects to keep building."
		});
	});

	// EVO-016, criterion abf6f54e.
	it('takes the N projects saved last as active when nobody chose, and completes a choice with them [criterion:ac-leaf-abf6f54e-6aa4-41f4-93ff-62a247dfb181]', () => {
		const projects = [
			{ id: 'old', lastSavedAt: '2026-01-01T00:00:00Z' },
			{ id: 'mid', lastSavedAt: '2026-06-01T00:00:00Z' },
			{ id: 'new', lastSavedAt: '2026-11-01T00:00:00Z' },
			{ id: 'never', lastSavedAt: null }
		];
		expect(defaultActiveProjects(projects, 2)).toEqual(['new', 'mid']);
		expect(resolveActiveProjects(projects, [], 2)).toEqual(['new', 'mid']);
		expect(resolveActiveProjects(projects, ['old'], 2)).toEqual(['old', 'new']);
		expect(resolveActiveProjects(projects, ['gone', 'never', 'old', 'mid'], 2)).toEqual(['never', 'old']);
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
