import type { GateDoor, RoleGatePort } from '$application/ports';

/**
 * Doors on a single-operator install (auth on, no Back): the one account is the
 * writer and the MCP user, so a session opens every door. The session wall in
 * hooks is what proves the caller holds the operator's credential; this only
 * refuses a request that carries none, exactly like SingleOperatorProjectAccess.
 */
export class SingleOperatorRoleGate implements RoleGatePort {
	async allows(
		token: string | null | undefined,
		_door: GateDoor,
		_activeWorkspaceId: string | null | undefined
	): Promise<boolean> {
		return Boolean(token);
	}
}
