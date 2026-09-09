import type { ProjectRowSnapshot } from '$domain/portability';

/**
 * Outbound port for the *whole* PostgreSQL state of one project, read and
 * written as a single unit.
 *
 * Deliberately below the per-section repositories: those project the behavior
 * kernel and merge residue, so round-tripping a project through them would
 * re-derive its content rather than copy it. A faithful copy moves rows.
 *
 * `back_project_links` is not part of the unit, on purpose — it names the
 * *source* install's back service and must never follow a project to a new home.
 */
export interface ProjectPortabilityStorePort {
	read(projectId: string): Promise<ProjectRowSnapshot>;
	/** Replace every row this project owns, in one transaction. */
	write(projectId: string, rows: ProjectRowSnapshot): Promise<void>;
	/** Whether any row already exists under this id — the import collision guard. */
	exists(projectId: string): Promise<boolean>;
}
