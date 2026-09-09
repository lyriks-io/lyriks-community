/**
 * The display name a workspace knows the caller by, when an external identity
 * source keeps one. The open-source build resolves names from the operator
 * profile instead and answers '' here.
 */
export interface WorkspaceMemberNamePort {
	/** The caller's name inside `workspaceId`, or '' when unresolved. */
	nameOf(workspaceId: string, email?: string): Promise<string>;
}
