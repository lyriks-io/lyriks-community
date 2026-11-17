import type { DataRulesSetup, ProjectDataDraft } from '$domain/data';

/** Outbound port for persisting Step 07 drafts. Parallel to Steps 01-06. */
export interface DataDraftRepositoryPort {
	load(projectId: string): Promise<ProjectDataDraft | null>;
	save(draft: ProjectDataDraft): Promise<void>;
	/**
	 * Record which project invariants the rules sync generated from the model.
	 * Server-owned: a save never writes it, only the sync does.
	 */
	saveGeneratedRules?(projectId: string, generated: DataRulesSetup['generated']): Promise<void>;
	/**
	 * Record who linked each field to its state, and the fields a person
	 * unlinked. Server-owned like the generated rules: a save never writes it.
	 */
	saveLinkRecord?(projectId: string, record: Pick<DataRulesSetup, 'linkedBy' | 'declined' | 'alsoCarriedBy'>): Promise<void>;
}
