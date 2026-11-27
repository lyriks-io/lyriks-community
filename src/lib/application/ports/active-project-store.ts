/**
 * Outbound port for the projects an installation works on (EVO-001,
 * Installation.activeProjectId; EVO-016, N of them): the ids chosen for the
 * whole installation, most recently made active first, empty until one is
 * chosen. Only an installation whose key grants a number of projects reads it;
 * every other one opens every project.
 */
export interface ActiveProjectStorePort {
	load(): Promise<string[]>;
	save(projectIds: readonly string[]): Promise<void>;
}
