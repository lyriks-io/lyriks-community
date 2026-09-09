import { collectionKey, entityToCollection, syncEntityIntoCollections } from '$domain/experience';
import type { LoadExperienceDraftUseCase } from './load-experience-draft';
import type { LoadDataDraftUseCase } from './load-data-draft';
import type { SaveExperienceDraftUseCase } from './save-experience-draft';
import type { PushEnvelopeToBackUseCase } from './push-envelope-to-back';

export interface ImportDataCollectionsResult {
	/** Entity names turned into new simulator collections this call. */
	imported: string[];
	/**
	 * Entity names whose existing collection was refreshed from the model
	 * (refresh mode only; empty in the default import-once mode).
	 */
	updated: string[];
	/** Entity names left untouched: already backed by a collection (and, in
	 *  refresh mode, already in sync with the model). */
	skipped: string[];
	/** Total collections on the builder after the import. */
	total: number;
	/** Entity name → simulator collection id, including already-present selections. */
	collectionIds: Record<string, string>;
	/** Entity name → (field name → simulator field id), ready for bindings. */
	fieldIds: Record<string, Record<string, string>>;
	/**
	 * Entity name → full field specs (id, name, generator kind, enum `options`
	 * pool) — so a caller can SEE whether declared enum values survived the
	 * import without re-reading the whole experience section.
	 */
	fields: Record<string, Array<{ id: string; name: string; kind: string; options?: string[] }>>;
}

/**
 * Raise prototype fidelity by seeding the simulator's fake backend from the REAL
 * Step-07 data model: each entity becomes an editable collection whose fields
 * carry the right generator kind for their declared type (via `entityToCollection`
 * / the data-bridge), so a list or form in the prototype reads the same shapes the
 * product will persist. The human UI already does this per-entity (BackendPanel);
 * this use-case does it in bulk so an AI can do it over MCP without recomputing
 * field kinds. Idempotent: an entity that already backs a collection (matched by
 * recorded `sourceEntityId` provenance, or by name for pre-provenance imports) is
 * left untouched (import-once-editable). With `refresh: true`, drifted existing
 * collections are refreshed from the model instead (name and fields follow the
 * model; seed counts and authored rows are kept), so an AI can re-sync demo data
 * after the data model changed, just like the Demo data tab's re-sync buttons.
 */
export class ImportDataCollectionsUseCase {
	constructor(
		private readonly loadExperience: LoadExperienceDraftUseCase,
		private readonly loadData: LoadDataDraftUseCase,
		private readonly saveExperience: SaveExperienceDraftUseCase,
		private readonly pushEnvelope: PushEnvelopeToBackUseCase
	) {}

	async execute(
		projectId: string,
		entityNames?: string[],
		opts?: { refresh?: boolean }
	): Promise<ImportDataCollectionsResult> {
		const [draft, data] = await Promise.all([
			this.loadExperience.execute(projectId),
			this.loadData.execute(projectId)
		]);

		const norm = (s: string) => s.trim().toLowerCase();
		const want = entityNames?.length ? new Set(entityNames.map(norm)) : null;
		// The collection already backing an entity: recorded provenance first, then a
		// name match for collections imported before provenance existed.
		const backingCollection = (entity: { id: string; name: string }) =>
			draft.builder.collections.find((c) => c.sourceEntityId === entity.id) ??
			draft.builder.collections.find((c) => collectionKey(c.name) === collectionKey(entity.name));

		const refresh = opts?.refresh === true;
		const imported: string[] = [];
		const updated: string[] = [];
		const skipped: string[] = [];
		let mutated = false;
		for (const entity of data.entities) {
			if (want && !want.has(norm(entity.name))) continue;
			const key = collectionKey(entity.name);
			if (!key) continue;
			if (refresh) {
				const r = syncEntityIntoCollections(draft.builder.collections, entity, data.fields);
				mutated = mutated || r.changed;
				if (r.outcome === 'imported') imported.push(entity.name);
				else if (r.outcome === 'updated') updated.push(entity.name);
				else skipped.push(entity.name);
				continue;
			}
			if (backingCollection(entity)) {
				skipped.push(entity.name);
				continue;
			}
			draft.builder.collections.push(entityToCollection(entity, data.fields));
			mutated = true;
			imported.push(entity.name);
		}

		if (mutated) {
			// SaveExperience now projects the behavior graph into the kernel itself
			// (Phase 4), so there is no separate sync step — just mirror the push.
			await this.saveExperience.execute(draft);
			void this.pushEnvelope.execute(projectId);
		}

		// Result maps are keyed by ENTITY name, resolved through the same
		// provenance-first match, so a renamed entity still reports its collection.
		const selectedPairs = data.entities
			.filter((entity) => !want || want.has(norm(entity.name)))
			.flatMap((entity) => {
				const collection = backingCollection(entity);
				return collection ? [[entity.name, collection] as const] : [];
			});
		const collectionIds = Object.fromEntries(
			selectedPairs.map(([name, collection]) => [name, collection.id])
		);
		const fieldIds = Object.fromEntries(
			selectedPairs.map(([name, collection]) => [
				name,
				Object.fromEntries(collection.fields.map((field) => [field.name, field.id]))
			])
		);
		const fields = Object.fromEntries(
			selectedPairs.map(([name, collection]) => [
				name,
				collection.fields.map((field) => ({
					id: field.id,
					name: field.name,
					kind: field.kind as string,
					...(field.options && field.options.length > 0 ? { options: field.options } : {})
				}))
			])
		);

		return {
			imported,
			updated,
			skipped,
			total: draft.builder.collections.length,
			collectionIds,
			fieldIds,
			fields
		};
	}
}
