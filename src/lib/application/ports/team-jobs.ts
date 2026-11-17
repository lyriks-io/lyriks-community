/**
 * What each person does, as their workspace says it: their roles in one
 * project when someone set them, else their job. Only a source of suggestions:
 * a job grants nothing (ac-team-jobs-no-rights). People are keyed by email, in
 * lower case, the way the roster names them.
 */
export interface PersonJobs {
	/** The ids of the jobs the person holds on the project. */
	readonly jobIds: readonly string[];
	/** The same jobs by name, as the workspace's list spells them. */
	readonly names: readonly string[];
}

export interface TeamJobsPort {
	/** What each member of the workspace does on the project; empty where nobody named a job. */
	forProject(workspaceId: string, projectId: string): Promise<ReadonlyMap<string, PersonJobs>>;
	/** Human members who can currently reach this project, with their effective project jobs. */
	participantsForProject?(workspaceId: string, projectId: string): Promise<readonly (PersonJobs & { readonly email: string; readonly name: string; readonly role?: string })[]>;
}
