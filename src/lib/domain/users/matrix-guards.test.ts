import { describe, expect, it } from 'vitest';
import { conditionUnderRole, readMatrixAgainstGuards, type MatrixGuardLeaf } from './matrix-guards';
import { declaredStatePaths, roleValuesOutsideBehavior } from './role-behavior-values';
import type { PermissionGrant, Role } from './draft';

const role = (id: string, name: string, values: Role['behaviorValues'] = []): Role => ({
	id,
	name,
	description: '',
	userCountMin: 1,
	userCountMax: null,
	tone: 'admin',
	sourceIds: [],
	...(values.length ? { behaviorValues: values } : {})
});
const grant = (roleId: string, featureId: string, actionId: string): PermissionGrant => ({
	roleId,
	capabilityId: `action:${featureId}:${actionId}`,
	capabilitySource: 'feature'
});
const block = (condition: unknown, reason: string) => ({ condition, effect: { type: 'block_action', reason } });
const feature = (actions: unknown[], states: string[] = ['session.workspaceRole']): unknown => ({
	surfaces: [{ stateDefinitions: states.map((path) => ({ path })), rules: [], actions }],
	constants: [{ name: 'OWNER', value: 'owner' }]
});

const owner = role('owner', 'Workspace Owner', [{ path: 'session.workspaceRole', value: 'owner' }]);
const admin = role('admin', 'Workspace Admin', [{ path: 'session.workspaceRole', value: 'admin' }]);
const member = role('member', 'Member', [{ path: 'session.workspaceRole', value: 'member' }]);
const manager = role('pm', 'Project Manager', [{ path: 'session.projectRole', value: 'project_manager' }]);

// Taskora, 2026-11-05: Lock period refuses members and guests; the matrix grants it to admins and owners.
const lockPeriod = {
	id: 'lock',
	name: 'Lock period',
	rules: [
		block(
			{
				kind: 'any',
				conditions: [
					{ left: 'session.workspaceRole', operator: 'equals', right: 'member' },
					{ left: 'session.workspaceRole', operator: 'equals', right: 'guest' }
				]
			},
			'Only admins lock a period'
		)
	]
};

describe('conditionUnderRole', () => {
	const env = new Map([['session.workspaceRole', 'admin' as const]]);
	it('reads a leaf on the role, a const and a composite in three values', () => {
		expect(conditionUnderRole({ left: 'session.workspaceRole', operator: 'equals', right: 'admin' }, env, new Map())).toBe('T');
		expect(conditionUnderRole({ left: 'session.workspaceRole', operator: 'not_equals', right: { kind: 'const', name: 'OWNER' } }, env, new Map([['OWNER', 'owner']]))).toBe('T');
		// A rule that also reads the plan refuses the role only if the plan part is decided.
		const mixed = {
			kind: 'any',
			conditions: [
				{ left: 'audit.plan', operator: 'not_equals', right: 'enterprise' },
				{ left: 'session.workspaceRole', operator: 'equals', right: 'member' }
			]
		};
		expect(conditionUnderRole(mixed, env, new Map())).toBe('U');
		expect(conditionUnderRole(mixed, new Map([['session.workspaceRole', 'member' as const]]), new Map())).toBe('T');
		expect(conditionUnderRole({ kind: 'not', condition: { left: 'x', operator: 'is_true' } }, env, new Map())).toBe('U');
	});
});

describe('readMatrixAgainstGuards [criterion:26262450]', () => {
	it('names nothing to compare while no role says how the behaviour reads it', () => {
		const reading = readMatrixAgainstGuards(
			{ roles: [role('a', 'A')], permissions: [grant('a', 'f', 'lock')] },
			[{ id: 'f', name: 'Timesheets', feature: feature([lockPeriod]) }]
		);
		expect(reading).toMatchObject({ compared: false, grantsActions: true, actions: [], features: [] });
	});

	it('agrees when the matrix grants exactly the roles the rules let in', () => {
		const reading = readMatrixAgainstGuards(
			{ roles: [owner, admin, member], permissions: [grant('owner', 'f', 'lock'), grant('admin', 'f', 'lock')] },
			[{ id: 'f', name: 'Timesheets', feature: feature([lockPeriod]) }]
		);
		expect(reading.actions).toEqual([]);
	});

	it('names a granted role a rule refuses, and a role kept out that no rule refuses', () => {
		const reading = readMatrixAgainstGuards(
			{ roles: [owner, admin, member], permissions: [grant('owner', 'f', 'lock'), grant('member', 'f', 'lock')] },
			[{ id: 'f', name: 'Timesheets', feature: feature([lockPeriod]) }]
		);
		expect(reading.actions).toEqual([
			{
				featureId: 'f',
				featureName: 'Timesheets',
				actionId: 'lock',
				actionName: 'Lock period',
				refusedButGranted: [{ roleId: 'member', roleName: 'Member', rule: 'Only admins lock a period' }],
				letInButNotGranted: [{ roleId: 'admin', roleName: 'Workspace Admin' }]
			}
		]);
	});

	it('leaves a role of another dimension to the dimension the action reads', () => {
		const reading = readMatrixAgainstGuards(
			{ roles: [owner, admin, member, manager], permissions: [grant('owner', 'f', 'lock'), grant('admin', 'f', 'lock')] },
			[{ id: 'f', name: 'Timesheets', feature: feature([lockPeriod]) }]
		);
		expect(reading.actions).toEqual([]);
	});

	it('names a feature whose actions read no role while the matrix keeps roles out (Install Teams app)', () => {
		const install = {
			id: 'install',
			name: 'Install Teams app',
			rules: [block({ left: 'teams.betaOptIn', operator: 'is_false' }, 'Teams is a beta')]
		};
		const leaves: MatrixGuardLeaf[] = [{ id: 't', name: 'Teams', feature: feature([install], ['teams.betaOptIn']) }];
		const reading = readMatrixAgainstGuards(
			{ roles: [owner, admin, member], permissions: [grant('owner', 't', 'install'), grant('admin', 't', 'install')] },
			leaves
		);
		expect(reading.features).toEqual([
			{ featureId: 't', featureName: 'Teams', actions: [{ actionId: 'install', actionName: 'Install Teams app', keptOut: ['Member'] }] }
		]);
	});

	it('never compares what the system, a schedule or an event fires, nor a proposal', () => {
		const scheduled = { ...lockPeriod, id: 'auto', actor: 'schedule' };
		const handler = { ...lockPeriod, id: 'h', triggeredByEvent: 'period.closed' };
		const proposal = { ...lockPeriod, id: 'p', evolution: { status: 'proposed' } };
		const reading = readMatrixAgainstGuards(
			{ roles: [owner, admin, member], permissions: [grant('member', 'f', 'auto'), grant('member', 'f', 'h'), grant('member', 'f', 'p')] },
			[{ id: 'f', name: 'Timesheets', feature: feature([scheduled, handler, proposal]) }]
		);
		expect(reading.actions).toEqual([]);
		expect(reading.features).toEqual([]);
	});

	it('reads a grant on the whole feature as a grant on each of its actions', () => {
		const reading = readMatrixAgainstGuards(
			{
				roles: [owner, admin, member],
				permissions: [
					{ roleId: 'owner', capabilityId: 'f', capabilitySource: 'feature' },
					{ roleId: 'admin', capabilityId: 'f', capabilitySource: 'feature' }
				]
			},
			[{ id: 'f', name: 'Timesheets', feature: feature([lockPeriod]) }]
		);
		expect(reading.actions).toEqual([]);
	});
});

describe('role values and the declared states [criterion:8763ca70]', () => {
	it('names a value whose state no feature declares', () => {
		const declared = declaredStatePaths([feature([], ['session.workspaceRole']), null]);
		expect(roleValuesOutsideBehavior([owner, manager], declared)).toEqual([
			{
				path: 'roles[1].behaviorValues[0].path',
				message: expect.stringContaining('"session.projectRole" of role "Project Manager"')
			}
		]);
	});
});
