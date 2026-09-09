/**
 * The Lyriks-owned RESIDUE store, keyed by (projectId, section). unspa models
 * only BEHAVIOR, so this holds everything else: concepts unspa cannot model at
 * all (definition, org scaffolding, Experience presentation/brand, RBAC governance,
 * UI state) AND the product facet of the same feature/surface/action entities the
 * kernel owns (rationale, priority, product copy, ownership, docs), keyed by the
 * kernel's content-id. One entity, two facets, each owned exactly once.
 *
 * Payload is an opaque JSON document per section — the projection builder for that
 * section knows its shape. Stored in the platform PostgreSQL database.
 */
export interface ProjectResidueRepositoryPort {
	load(projectId: string, section: string): Promise<unknown | null>;
	save(projectId: string, section: string, payload: unknown): Promise<void>;
}
