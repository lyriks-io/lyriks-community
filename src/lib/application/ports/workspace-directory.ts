/**
 * The workspaces ("teams") the current caller belongs to, with their role in
 * each. Sourced from lyriks-back (the identity authority) and scoped to the
 * caller's token. Used by the platform to let a multi-team user pick the team a
 * new project lands in (the "active workspace").
 */
export interface WorkspaceSummary {
	readonly id: string;
	readonly name: string;
	/** The caller's role in this workspace (admin | owner | designer | viewer | …). */
	readonly role: string;
	readonly plan?: string;
}

export interface WorkspaceDirectoryPort {
	/** Workspaces the current caller is a member of (empty if none / disabled). */
	listForCaller(): Promise<WorkspaceSummary[]>;
	/**
	 * Create a workspace owned by the current caller (self-provision). Used only
	 * for the opt-in auto-workspace bootstrap; returns null on failure / disabled.
	 */
	createForCaller(name: string): Promise<WorkspaceSummary | null>;
	/**
	 * Rename a workspace the caller owns or administers. The appliance seeds one
	 * at install time, so for most installs this is the only way its name is ever
	 * chosen deliberately. Returns null when the back refuses (not an admin, name
	 * out of bounds) or is disabled, so the caller reports a failure rather than
	 * showing a rename that did not happen.
	 */
	renameForCaller(workspaceId: string, name: string): Promise<WorkspaceSummary | null>;
}
