import type { FeatureActionIndex } from '$application/index-feature-actions';
import type { ProjectFeaturesDraft } from '$domain/features';

/** One feature/action a person is on, with HOW they are on it. */
export interface AssignedItem {
	key: string;
	kind: 'feature' | 'action';
	name: string;
	featureId: string;
	actionId: string | null;
	core: string | null;
	relation: 'Owner' | 'Contributor';
}

/**
 * The single source of truth for "what is assigned to a person" — every feature
 * and action they OWN (a WorkAssignment) or CONTRIBUTE to (the feature/action
 * people lists). Used by BOTH the My-work board and the Delivery board so the two
 * can never drift: My-work is exactly Delivery filtered to one contributor.
 * De-duplicated by target + relation.
 */
export function assignedItemsFor(
	draft: ProjectFeaturesDraft,
	featureActions: FeatureActionIndex,
	personId: string
): AssignedItem[] {
	const features = draft.features;
	const featureName = (id: string | undefined) =>
		features.find((f) => f.id === id)?.name || 'Untitled feature';
	const coreNameOf = (featureId: string | undefined) => {
		const f = features.find((x) => x.id === featureId);
		return f ? (draft.cores.find((c) => c.id === f.coreId)?.name ?? null) : null;
	};
	const actionName = (featureId: string, actionId: string) =>
		(featureActions[featureId] ?? []).find((a) => a.id === actionId)?.name || 'action';

	const out: AssignedItem[] = [];
	const seen = new Set<string>();
	const push = (
		kind: AssignedItem['kind'],
		featureId: string,
		actionId: string | null,
		name: string,
		relation: AssignedItem['relation']
	) => {
		const key = `${kind}:${featureId}:${actionId ?? ''}:${relation}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({ key, kind, name, featureId, actionId, core: coreNameOf(featureId), relation });
	};

	for (const a of draft.assignments ?? []) {
		if (a.assigneeId !== personId || !a.featureId) continue;
		if (a.kind === 'feature')
			push('feature', a.featureId, null, a.label || featureName(a.featureId), 'Owner');
		else if (a.kind === 'action' && a.actionId)
			push('action', a.featureId, a.actionId, a.label || actionName(a.featureId, a.actionId), 'Owner');
	}
	for (const f of features) {
		if ((draft.featureRoles?.[f.id] ?? []).includes(personId))
			push('feature', f.id, null, f.name || 'Untitled feature', 'Contributor');
	}
	for (const [key, ids] of Object.entries(draft.actionRoles ?? {})) {
		if (!ids.includes(personId)) continue;
		const [featureId, actionId] = key.split('::');
		push('action', featureId, actionId, actionName(featureId, actionId), 'Contributor');
	}
	return out;
}
