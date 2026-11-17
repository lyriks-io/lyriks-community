import { describe, expect, it } from 'vitest';
import { computeUsersCoherence, usersCountsLine } from './coherence';
import { permissionCoverage, type ProjectUsersDraft } from './draft';
import { SYSTEM_CAPABILITIES } from './enums';

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
		dismissedSuggestions: [],
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

describe('the Users counts read accesses [criterion:8554bd0d]', () => {
	it('counts one access per role and capability, however many verbs were stored', () => {
		const stored = ['create', 'read', 'update', 'delete'].map(
			(action) => ({ roleId: 'r1', capabilityId: 'action:f1:a1', capabilitySource: 'feature', action }) as never
		);
		const d = draft({ permissions: [...stored, { roleId: 'r1', capabilityId: 'action:f1:a2', capabilitySource: 'feature' }] });
		expect(usersCountsLine(d)).toBe('1 role(s) · 2 access grant(s)');
		expect(usersCountsLine(d, 'fr')).toBe('1 rôle(s) · 2 accès');
	});
});
