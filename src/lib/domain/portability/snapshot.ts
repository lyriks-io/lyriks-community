/**
 * The complete, storage-level state a single project owns — the unit that
 * export writes out and import writes back.
 *
 * Deliberately storage-shaped rather than read-model-shaped: sections like
 * Features, Experience and Data are *projections* of the behavior kernel plus
 * residue (see the composition root), so exporting the projections and saving
 * them back would re-derive content instead of copying it. Copying the rows and
 * the kernel folder verbatim is the only shape that round-trips exactly.
 *
 * The inventory mirrors what `PgProjectCatalogRepository.remove` deletes — what
 * a delete erases is exactly what a full copy must carry. One exception, by
 * design: `back_project_links` is never carried, because it names the *source*
 * install's back service (see `ProjectRowSnapshot`).
 */

/** One row of the consolidated `project_section_documents` store. */
export interface SectionDocumentRow {
	readonly schemaVersion: number;
	readonly document: unknown;
	readonly revision: number;
}

/**
 * A project's org placement (`project_meta`).
 *
 * There is no stage here on purpose: every pre-ship stage is *derived* from the
 * live spec (see `deriveProjectStage`), and the one thing a human declares —
 * "this shipped" — is the timestamp.
 */
export interface ProjectMetaRow {
	readonly domainId: string | null;
	readonly shippedAt: string | null;
}

/** The Domain a project is filed under, carried by name so it can be re-created. */
export interface DomainRef {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly icon: string;
}

/**
 * Every PostgreSQL row a project owns.
 *
 * `legacyDocuments` are the pre-consolidation per-section tables (keyed by table
 * name). Most projects have only `project_drafts` — the Foundation identity
 * draft, whose presence IS the project's existence (see `CreateProjectUseCase`)
 * — but an install that never re-saved an old project still holds its only copy
 * of some sections there, so they travel too.
 */
export interface ProjectRowSnapshot {
	readonly legacyDocuments: Readonly<Record<string, unknown>>;
	readonly sectionDocuments: Readonly<Record<string, SectionDocumentRow>>;
	readonly residue: Readonly<Record<string, unknown>>;
	readonly revisions: Readonly<Record<string, number>>;
	readonly meta: ProjectMetaRow | null;
}

/** One `*.feature.json` from the kernel folder, by its content id. */
export interface KernelFeature {
	readonly id: string;
	readonly feature: Record<string, unknown>;
}

/** The `data/unspa/<projectId>/` folder: the manifest plus every feature shell. */
export interface ProjectKernelSnapshot {
	readonly project: Record<string, unknown> | null;
	readonly features: readonly KernelFeature[];
}

/** A project, whole. */
export interface ProjectSnapshot {
	readonly projectId: string;
	/** Display name (the Foundation identity's `productName`), for the manifest. */
	readonly name: string;
	readonly description: string;
	readonly rows: ProjectRowSnapshot;
	readonly kernel: ProjectKernelSnapshot;
	/** The Domain record itself, so the target install can re-create it by name. */
	readonly domain: DomainRef | null;
}

/** An empty row set — the shape a project with no PostgreSQL state exports as. */
export function emptyRowSnapshot(): ProjectRowSnapshot {
	return { legacyDocuments: {}, sectionDocuments: {}, residue: {}, revisions: {}, meta: null };
}

/**
 * A project's display name and description, read from the same place the
 * catalog reads them: the Foundation identity draft in `project_drafts`
 * (`productName` / `brief`). Falls back to the id, exactly as the catalog does
 * for a project whose identity was never filled in.
 */
export function describeProject(
	rows: ProjectRowSnapshot,
	projectId: string
): { name: string; description: string } {
	const identity = rows.legacyDocuments['project_drafts'];
	if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
		return { name: projectId, description: '' };
	}
	const draft = identity as { productName?: unknown; brief?: unknown };
	const name = typeof draft.productName === 'string' ? draft.productName.trim() : '';
	const description = typeof draft.brief === 'string' ? draft.brief.trim() : '';
	return { name: name || projectId, description };
}
