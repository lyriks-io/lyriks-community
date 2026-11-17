import type { CapabilitySource, ProjectUsersDraft } from '$domain/users';

/**
 * A cell of who can do what ticked on the Specification 360° (criterion
 * eba33558): an empty cell gives the user access to the action, a cell with
 * access takes it back. It is the same one line the Access matrix ticks, since
 * a grant carries no verb. Null when the cell already reads what was asked. Pure.
 */
export function tickMatrixCell(users: ProjectUsersDraft, roleId: string, capabilityId: string, source: CapabilitySource, on: boolean): ProjectUsersDraft | null {
	if (!users.roles.some((r) => r.id === roleId)) return null;
	const held = users.permissions.some((g) => g.roleId === roleId && g.capabilityId === capabilityId);
	if (held === on) return null;
	const permissions = on
		? [...users.permissions, { roleId, capabilityId, capabilitySource: source }]
		: users.permissions.filter((g) => !(g.roleId === roleId && g.capabilityId === capabilityId));
	return { ...users, permissions };
}
