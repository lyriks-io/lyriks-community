import type { FoundationDefinitionDraft } from '$domain/foundation';

/**
 * Outbound port for persisting Foundation definition drafts. Parallel to
 * `FoundationIdentityRepositoryPort`. Each slice's draft lives in its own
 * collection / table so the schemas evolve independently and a tenant who
 * skips a slice doesn't pay for an empty row in another.
 */
export interface FoundationDefinitionRepositoryPort {
	load(projectId: string): Promise<FoundationDefinitionDraft | null>;
	save(draft: FoundationDefinitionDraft): Promise<void>;
}
