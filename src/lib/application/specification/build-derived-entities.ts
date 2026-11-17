import type { DerivedEntity } from '$domain/data';
import type { ProjectExperienceDraft } from '$domain/experience';

/**
 * Derives the entity set the data model OWES from how the Step 05 journeys
 * consume data: every Entity named in a step's Data-Consumed underlay becomes a
 * derived table, with the union of the fields those steps read/write. This is
 * what makes "data ontology is derived from journeys" real — coherence then
 * checks every derived name has an actual table (no forgotten table).
 */
export function buildDerivedEntities(experience: ProjectExperienceDraft | null): DerivedEntity[] {
	if (!experience) return [];
	const byName = new Map<string, Set<string>>();
	for (const read of experience.stepDataReads ?? []) {
		const name = typeof read?.entityName === 'string' ? read.entityName.trim() : '';
		if (!name) continue;
		const set = byName.get(name) ?? new Set<string>();
		for (const f of read?.fields ?? []) {
			const field = typeof f === 'string' ? f.trim() : '';
			if (field) set.add(field);
		}
		byName.set(name, set);
	}
	return [...byName.entries()].map(([name, fields]) => ({ name, fields: [...fields] }));
}
