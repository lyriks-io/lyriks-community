import { describe, expect, it } from 'vitest';
import { MATRIX_GRANTS_NOBODY_CAUSE, matrixGuardGaps } from './matrix-guard-gaps';
import { effectivePenalties } from '$domain/coherence/incoherence';
import type { Role } from '$domain/users';

const role = (id: string, name: string, value?: string): Role => ({
	id,
	name,
	description: '',
	userCountMin: 1,
	userCountMax: null,
	tone: 'admin',
	sourceIds: [],
	...(value ? { behaviorValues: [{ path: 'session.workspaceRole', value }] } : {})
});
const leaf = {
	id: 't',
	name: 'Teams',
	snapshot: {
		format: 'unspaghettit-feature',
		version: 1,
		feature: {
			surfaces: [
				{
					stateDefinitions: [{ path: 'teams.betaOptIn' }, { path: 'session.workspaceRole' }],
					rules: [],
					actions: [
						{
							id: 'install',
							name: 'Install Teams app',
							rules: [{ condition: { left: 'teams.betaOptIn', operator: 'is_false' }, effect: { type: 'block_action', reason: 'beta' } }]
						}
					]
				}
			]
		}
	}
} as never;
const grantTo = (roleId: string) => ({ roleId, capabilityId: 'action:t:install', capabilitySource: 'feature' as const });

describe('matrixGuardGaps [criterion:26262450]', () => {
	it('says once, low, that the matrix cannot be compared while no role carries values', () => {
		const gaps = matrixGuardGaps({ roles: [role('a', 'Admin')], permissions: [grantTo('a')] }, [leaf]);
		expect(gaps).toHaveLength(1);
		expect(gaps[0]).toMatchObject({ id: 'gap-users-matrix-unchecked', severity: 'low', blocking: false, checkId: 'users.matrix-guards' });
	});

	it('says nothing when the matrix grants no action', () => {
		expect(matrixGuardGaps({ roles: [role('a', 'Admin')], permissions: [] }, [leaf])).toEqual([]);
	});

	it('names the feature whose behaviour lets every role in, in French too', () => {
		const users = { roles: [role('a', 'Admin', 'admin'), role('m', 'Member', 'member')], permissions: [grantTo('a')] };
		const [gap] = matrixGuardGaps(users, [leaf], 'fr');
		expect(gap).toMatchObject({ id: 'gap-users-matrix-blind-t', kind: 'misalignment', severity: 'medium', featureRef: 't' });
		expect(gap.detail).toContain('Install Teams app');
		expect(gap.detail).toContain('Member');
	});

	it('gives the actions the matrix grants to nobody one cause, so they weigh once [criterion:43a4becb]', () => {
		const guarded = (id: string) => ({
			id,
			name: `Action ${id}`,
			rules: [{ condition: { left: 'session.workspaceRole', operator: 'equals', right: 'viewer' }, effect: { type: 'block_action', reason: 'viewers read only' } }]
		});
		const reads = {
			id: 'r',
			name: 'Reports',
			snapshot: { format: 'unspaghettit-feature', version: 1, feature: { surfaces: [{ stateDefinitions: [], rules: [], actions: [guarded('a1'), guarded('a2'), guarded('a3')] }] } }
		} as never;
		const users = {
			roles: [role('a', 'Admin', 'admin'), role('m', 'Member', 'member')],
			permissions: [{ roleId: 'a', capabilityId: 'action:r:a3', capabilitySource: 'feature' as const }]
		};
		const gaps = matrixGuardGaps(users, [reads]);
		const [a1, a2, a3] = ['a1', 'a2', 'a3'].map((id) => gaps.find((g) => g.id === `gap-users-matrix-guards-r-${id}`)!);
		expect(a1.cause).toBe(MATRIX_GRANTS_NOBODY_CAUSE);
		expect(a2.cause).toBe(MATRIX_GRANTS_NOBODY_CAUSE);
		expect(a1.detail).toBe('The access matrix grants this action to no profile, while its rules let "Admin" and "Member" in.');
		// Granted to a profile, the disagreement is its own decision and weighs on its own.
		expect(a3.cause).toBeUndefined();
		const penalties = effectivePenalties([a1, a2, a3]);
		expect(penalties.filter((p) => p > 0)).toHaveLength(2);
	});
});
