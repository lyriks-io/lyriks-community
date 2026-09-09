/**
 * The two doors a session opens beyond reading: authoring (the editors, the
 * downloads, the behavior dashboard) and the MCP gateway.
 */
export type GateDoor = 'write' | 'mcp';

/**
 * Who may pass a door, judged from the session token alone. Enterprise reads
 * the caller's role in the active workspace (or any of theirs) from lyriks-back;
 * the open-source build has one operator account, so a session is the operator.
 * Fail closed by contract: no token, a refused token, or a source that cannot
 * answer is a no.
 */
export interface RoleGatePort {
	allows(
		token: string | null | undefined,
		door: GateDoor,
		activeWorkspaceId: string | null | undefined
	): Promise<boolean>;
}
