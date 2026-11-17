/**
 * Outbound port for the project a Community installation works on (EVO-001,
 * Installation.activeProjectId): one id for the whole installation, null until
 * one is chosen. Only Community reads it; every other edition opens every project.
 */
export interface ActiveProjectStorePort {
	load(): Promise<string | null>;
	save(projectId: string): Promise<void>;
}
