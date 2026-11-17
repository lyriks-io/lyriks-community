import type { ProjectUsersDraft, RoleTone } from '../users';
import { SYSTEM_CAPABILITIES, featureOfActionCapability } from '../users';
import type { PermissionMatrix, RetroItem, RetrospecSpec, RoleItem, UsersLayout } from './reading';
import { clean } from './reading-text';

/**
 * The Users of the review: the roles, end users then admins, and the
 * permission matrix as the specification grants it. Pure.
 */

const ADMIN_TONES: ReadonlySet<RoleTone> = new Set(['admin', 'ops']);

export function usersLayout(spec: RetrospecSpec): { layout: UsersLayout; items: RetroItem[] } {
	const roles = spec.users.roles.filter((r) => clean(r.name));
	let n = 0;
	const roleItem = (role: (typeof roles)[number]): RoleItem => {
		n += 1;
		return { tone: role.tone, item: { id: `role:${role.id}`, ref: `US-${n}`, tab: 'users', title: clean(role.name), desc: clean(role.description), rejectable: true } };
	};
	const groups = [
		{ label: 'END USERS', roles: roles.filter((r) => !ADMIN_TONES.has(r.tone)).map(roleItem) },
		{ label: 'ADMIN USERS', roles: roles.filter((r) => ADMIN_TONES.has(r.tone)).map(roleItem) }
	].filter((g) => g.roles.length > 0);
	const permissions = permissionMatrix(spec, roles);
	const items = [...groups.flatMap((g) => g.roles.map((r) => r.item)), ...(permissions ? [permissions.item] : [])];
	return { layout: { groups, permissions }, items };
}

function permissionMatrix(spec: RetrospecSpec, roles: ProjectUsersDraft['roles']): PermissionMatrix | null {
	const grants = spec.users.permissions;
	if (roles.length === 0 || grants.length === 0) return null;
	const granted = new Set(grants.map((g) => `${g.roleId}|${g.capabilityId}`));
	const access = (capId: string) => roles.map((role) => granted.has(`${role.id}|${capId}`));
	const rows: PermissionMatrix['rows'][number][] = [];
	const used = new Set(grants.map((g) => g.capabilityId));
	// The actions of each feature first, under the feature's name, as the matrix grants them.
	for (const feature of spec.features.features) {
		const actions = (spec.behavior.actionsByFeature[feature.id] ?? []).filter((action) => used.has(`action:${feature.id}:${action.id}`));
		const whole = used.has(feature.id);
		if (actions.length === 0 && !whole) continue;
		rows.push({ head: clean(feature.name) || feature.id });
		if (whole) rows.push({ label: 'The whole feature', access: access(feature.id) });
		for (const action of actions) rows.push({ label: clean(action.name) || action.id, access: access(`action:${feature.id}:${action.id}`) });
	}
	const shown = new Set<string>();
	for (const row of spec.features.features) {
		shown.add(row.id);
		for (const action of spec.behavior.actionsByFeature[row.id] ?? []) shown.add(`action:${row.id}:${action.id}`);
	}
	const otherLabels = new Map<string, string>([
		...spec.users.offStructureCapabilities.map((c) => [c.id, clean(c.label) || c.id] as const),
		...SYSTEM_CAPABILITIES.map((c) => [c.id, c.label] as const)
	]);
	const others = [...used].filter((capId) => !shown.has(capId) && featureOfActionCapability(capId) === null);
	if (others.length > 0) {
		rows.push({ head: 'Other capabilities' });
		for (const capId of others.sort((x, y) => (otherLabels.get(x) ?? x).localeCompare(otherLabels.get(y) ?? y))) rows.push({ label: otherLabels.get(capId) ?? capId, access: access(capId) });
	}
	if (rows.length === 0) return null;
	return {
		item: { id: 'users:permissions', ref: 'PM-1', tab: 'users', title: 'Permissions', desc: '', rejectable: false },
		roles: roles.map((r) => ({ id: r.id, name: clean(r.name) })),
		rows
	};
}
