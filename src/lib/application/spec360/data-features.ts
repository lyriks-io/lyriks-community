import type { ProjectDataDraft } from '$domain/data';
import type { DataBehaviour } from '../specification/data-behaviour';

/**
 * Which tables each feature uses, read from the behaviour: a field linked to a
 * state of a feature (the state that carries its value, first or further)
 * puts the field's table under that feature. A table no feature state carries
 * is under none. Pure.
 */
export function tablesByFeature(draft: Pick<ProjectDataDraft, 'fields' | 'rules'>, behaviour: Pick<DataBehaviour, 'links' | 'states'>): Record<string, string[]> {
	const ownerOf = new Map(behaviour.states.filter((s) => s.owner).map((s) => [s.path, s.owner!.featureId] as const));
	const tableOf = new Map(draft.fields.map((f) => [f.id, f.entityId] as const));
	const out: Record<string, Set<string>> = {};
	const further = Object.entries(draft.rules?.alsoCarriedBy ?? {}).flatMap(([fieldId, paths]) => paths.map((path) => [fieldId, path] as const));
	for (const [fieldId, statePath] of [...behaviour.links, ...further]) {
		const featureId = ownerOf.get(statePath);
		const entityId = tableOf.get(fieldId);
		if (!featureId || !entityId) continue;
		(out[featureId] ??= new Set()).add(entityId);
	}
	return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

/** Which tables the reader keeps by their relations: all, the ones related to another, the ones related to none. */
export type RelationFilter = 'all' | 'related' | 'unrelated';

/**
 * The tables a Specification 360° reader keeps beyond the map's own filters:
 * the ones a core feature or a feature uses (null keeps all), and the ones
 * related or not to any other table.
 */
export function narrowTables(
	entityIds: ReadonlySet<string>,
	scope: { readonly used: ReadonlySet<string> | null; readonly relations: RelationFilter; readonly unrelated: ReadonlySet<string> }
): Set<string> {
	return new Set(
		[...entityIds].filter(
			(id) =>
				(!scope.used || scope.used.has(id)) &&
				(scope.relations === 'all' || (scope.relations === 'unrelated') === scope.unrelated.has(id))
		)
	);
}
