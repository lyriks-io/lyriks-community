import { describe, expect, it } from 'vitest';
import { computeUsersCoherence } from './coherence';
import {
	capabilityActions,
	capabilityKindOf,
	permissionCoverage,
	type ProjectUsersDraft
} from './draft';
import type { PermissionAction } from './enums';
import { CAPABILITY_SOURCES, SYSTEM_CAPABILITIES } from './enums';

const sys = (roleId: string) =>
	SYSTEM_CAPABILITIES.map((c) => ({
		roleId,
		capabilityId: c.id,
		capabilitySource: 'system' as const
	}));

function draft(over: Partial<ProjectUsersDraft> = {}): ProjectUsersDraft {
	return {
		projectId: 'p1',
		roles: [{ id: 'r1', name: 'Admin', description: '', userCountMin: 1, userCountMax: null, tone: 'admin', sourceIds: [] }],
		offStructureCapabilities: [],
		permissions: [],
		capabilityProfiles: [],
		lastSavedAt: null,
		...over
	};
}

describe('permissionCoverage', () => {
	it('counts a capability covered when ANY role holds it, and flags orphans', () => {
		const d = draft({
			roles: [
				{ id: 'r1', name: 'A', description: '', userCountMin: 1, userCountMax: null, tone: 'admin', sourceIds: [] },
				{ id: 'r2', name: 'B', description: '', userCountMin: 1, userCountMax: null, tone: 'ops', sourceIds: [] }
			],
			permissions: [{ roleId: 'r1', capabilityId: 'feat-x', capabilitySource: 'feature' }]
		});
		const cov = permissionCoverage(d, ['feat-x', 'feat-y']);
		// Unused system facilities are optional; the two derived features are scope.
		expect(cov.totalCapabilities).toBe(2);
		expect(cov.uncoveredCapabilityIds).toContain('feat-y');
		expect(cov.uncoveredCapabilityIds).not.toEqual(
			expect.arrayContaining(SYSTEM_CAPABILITIES.map((c) => c.id))
		);
		// r2 holds nothing → uncovered role
		expect(cov.uncoveredRoleIds).toEqual(['r2']);
		expect(cov.coveredRoles).toBe(1);
	});

	it('reaches 100% when every capability has ≥1 role — without every role holding every cap', () => {
		const d = draft({
			roles: [
				{ id: 'r1', name: 'A', description: '', userCountMin: 1, userCountMax: null, tone: 'admin', sourceIds: [] },
				{ id: 'r2', name: 'B', description: '', userCountMin: 1, userCountMax: null, tone: 'ops', sourceIds: [] }
			],
			permissions: [
				...sys('r1'), // r1 owns all system caps
				{ roleId: 'r2', capabilityId: 'feat-x', capabilitySource: 'feature' } // r2 owns the feature
			]
		});
		const cov = permissionCoverage(d, ['feat-x']);
		expect(cov.uncoveredCapabilityIds).toEqual([]);
		expect(cov.uncoveredRoleIds).toEqual([]);
		expect(cov.pct).toBe(100); // full coverage despite a sparse cell grid
	});
});

describe('computeUsersCoherence — coverage-based', () => {
	it('scores 100/strong when every capability and role is covered', () => {
		const d = draft({
			permissions: [...sys('r1'), { roleId: 'r1', capabilityId: 'feat-x', capabilitySource: 'feature' }]
		});
		const res = computeUsersCoherence(d, ['feat-x']);
		expect(res.score).toBe(100);
		expect(res.tone).toBe('strong');
		expect(res.issues).toEqual([]);
	});

	it('flags the orphan capability that keeps the matrix incomplete', () => {
		const d = draft({ permissions: sys('r1') }); // system covered, feature not
		const res = computeUsersCoherence(d, ['feat-x']);
		expect(res.score).toBeLessThan(100);
		expect(res.issues.map((i) => i.code)).toContain('capability-unassigned');
	});

	it('does not punish least-privilege: a role need not hold every capability', () => {
		// Two roles, each owns a disjoint slice — full coverage, top score.
		const d = draft({
			roles: [
				{ id: 'r1', name: 'A', description: '', userCountMin: 1, userCountMax: null, tone: 'admin', sourceIds: [] },
				{ id: 'r2', name: 'B', description: '', userCountMin: 1, userCountMax: null, tone: 'ops', sourceIds: [] }
			],
			permissions: [...sys('r1'), { roleId: 'r2', capabilityId: 'feat-x', capabilitySource: 'feature' }]
		});
		expect(computeUsersCoherence(d, ['feat-x']).score).toBe(100);
	});
});

describe('the permission verbs a capability offers', () => {
	it('offers every row the same five essentials, whatever its source', () => {
		// Ten verbs was more choice than the matrix needs today: the wider
		// vocabulary is hidden (not deleted), so a row's kind no longer narrows
		// the list — intersecting an `action` row's defaults with the active verbs
		// would have left it offering nothing but "Visible".
		for (const source of CAPABILITY_SOURCES) {
			expect(capabilityActions([], 'x', source.code)).toEqual([
				'view',
				'create',
				'read',
				'update',
				'delete'
			]);
		}
	});

	it('never offers a hidden verb, even to a profile that authored one', () => {
		expect(
			capabilityActions(
				[{ capabilityId: 'cap-1', kind: 'action', actions: ['view', 'export', 'read'] }],
				'cap-1',
				'off_structure'
			)
		).toEqual(['view', 'read']);
	});

	it('falls back to the five when an override survives no filtering', () => {
		// A row with nothing grantable would read as an orphan capability forever.
		for (const actions of [[], ['export', 'manage'] as PermissionAction[]]) {
			expect(
				capabilityActions([{ capabilityId: 'cap-1', kind: 'action', actions }], 'cap-1', 'off_structure')
			).toEqual(['view', 'create', 'read', 'update', 'delete']);
		}
	});

	it('still records what a row IS — the kind outlives the reduced vocabulary', () => {
		expect(capabilityKindOf([], 'cap-1', 'off_structure', 'surface')).toBe('surface');
		expect(
			capabilityKindOf([{ capabilityId: 'cap-1', kind: 'governance' }], 'cap-1', 'off_structure', 'surface')
		).toBe('governance');
	});
});
