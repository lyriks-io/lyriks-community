/**
 * Read-only signature of every authorable project section except the scope
 * ledger itself. Completion uses it to invalidate an audit after any model save.
 */
export interface ProjectModelRevisionPort {
	fingerprint(projectId: string): Promise<string>;
}
