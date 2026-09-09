import type { ProjectRulesDraft } from '$domain/rules';

/** Outbound port for persisting Step 06 drafts. Parallel to Steps 01-05. */
export interface RulesDraftRepositoryPort {
	load(projectId: string): Promise<ProjectRulesDraft | null>;
	save(draft: ProjectRulesDraft): Promise<void>;
}
