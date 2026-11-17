import { describe, expect, it } from 'vitest';
import { matrixGuardGaps } from './matrix-guard-gaps';
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
});
