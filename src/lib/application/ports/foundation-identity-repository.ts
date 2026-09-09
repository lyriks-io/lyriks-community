import type { FoundationIdentityDraft } from '$domain/foundation';

/**
 * Outbound port for persisting Foundation identity drafts. The
 * domain/application layers depend on THIS interface; concrete stores
 * (PostgreSQL today) live in infrastructure and are injected by the
 * composition root. Swapping the store never touches a use-case.
 */
export interface FoundationIdentityRepositoryPort {
	/** Returns the stored draft for a project, or `null` if none exists yet. */
	load(projectId: string): Promise<FoundationIdentityDraft | null>;

	/** Upserts the full draft. Implementations persist verbatim. */
	save(draft: FoundationIdentityDraft): Promise<void>;
}
