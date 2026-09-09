import { describe, it, expect } from 'vitest';
import { buildScreenAccessMap, canAccessScreen, governingCapabilityIds } from './run-access';

const screens = [
	{ id: 'submit-1', category: 'core-capture' },
	{ id: 'policy-1', category: 'core-policy' },
	{ id: 'login', category: 'Auth' } // no capability owns this Core → ungated
];
// Matrix projection: capabilities grouped by Core, each with the roles that hold
// `read`. The policy Core has both a journey (Finance) and an admin config cap.
const capabilityAccess = [
	{ id: 'jrn-submit', roleIds: ['emp', 'admin'], coreId: 'core-capture' },
	{ id: 'ftr-capture', roleIds: ['emp'], coreId: 'core-capture' },
	{ id: 'jrn-policy', roleIds: ['finance'], coreId: 'core-policy' },
	{ id: 'ftr-policy-config', roleIds: ['admin'], coreId: 'core-policy' },
	{ id: 'cap-export', roleIds: ['finance', 'auditor'], coreId: null } // off-structure, no Core
];

const access = buildScreenAccessMap(screens, capabilityAccess);

describe('buildScreenAccessMap', () => {
	it('maps a screen to every capability of its Core', () => {
		expect([...access.screenCapabilityIds['submit-1']].sort()).toEqual(['ftr-capture', 'jrn-submit']);
		expect([...access.screenCapabilityIds['policy-1']].sort()).toEqual([
			'ftr-policy-config',
			'jrn-policy'
		]);
	});

	it('leaves a screen ungated when no capability owns its Core', () => {
		expect(access.screenCapabilityIds['login']).toBeUndefined();
		expect(governingCapabilityIds(access, 'login')).toEqual([]);
	});
});

describe('canAccessScreen', () => {
	it('author mode (null persona) sees every screen', () => {
		expect(canAccessScreen(access, 'submit-1', null)).toBe(true);
		expect(canAccessScreen(access, 'policy-1', null)).toBe(true);
	});

	it('ungated screens are open to every persona', () => {
		expect(canAccessScreen(access, 'login', 'emp')).toBe(true);
	});

	it('grants access when the role holds read on ANY capability of the Core', () => {
		expect(canAccessScreen(access, 'submit-1', 'emp')).toBe(true); // employee can capture
		expect(canAccessScreen(access, 'submit-1', 'finance')).toBe(false); // finance cannot
		expect(canAccessScreen(access, 'policy-1', 'finance')).toBe(true); // via journey cap
		expect(canAccessScreen(access, 'policy-1', 'admin')).toBe(true); // via admin config cap
		expect(canAccessScreen(access, 'policy-1', 'emp')).toBe(false);
	});

	it('a null access map disables gating entirely', () => {
		expect(canAccessScreen(null, 'policy-1', 'emp')).toBe(true);
	});
});

describe('a screen governed by its own surface row', () => {
	// "Visible" on the page's own matrix row is a direct answer, so it must win
	// over whatever the screen inherits from its Core.
	const withOwnRow = buildScreenAccessMap(screens, [
		...capabilityAccess,
		{ id: 'screen:policy-1', roleIds: ['auditor'], coreId: 'core-policy', screenId: 'policy-1' }
	]);

	it('replaces the Core-inherited capabilities instead of adding to them', () => {
		expect(withOwnRow.screenCapabilityIds['policy-1']).toEqual(['screen:policy-1']);
		expect(canAccessScreen(withOwnRow, 'policy-1', 'auditor')).toBe(true);
		// finance reached it through the Core's journey; the page's own row does not
		// grant it, so it is now locked out.
		expect(canAccessScreen(withOwnRow, 'policy-1', 'finance')).toBe(false);
	});

	it('falls back to the Core while nobody holds the page row', () => {
		// A surface row exists for every page as soon as Experience is authored;
		// an ungranted one means "not governed yet", not "forbidden to everyone".
		const ungranted = buildScreenAccessMap(screens, [
			...capabilityAccess,
			{ id: 'screen:policy-1', roleIds: [], coreId: 'core-policy', screenId: 'policy-1' }
		]);
		expect([...ungranted.screenCapabilityIds['policy-1']].sort()).toEqual([
			'ftr-policy-config',
			'jrn-policy'
		]);
		expect(canAccessScreen(ungranted, 'policy-1', 'finance')).toBe(true);
	});
});
