import {
	findAssignment,
	leafFeatures,
	workTargetKey,
	type ProjectFeaturesDraft,
	type WorkTarget,
	type WorkTargetKind
} from '$domain/features';
import type { FeatureActionIndex } from '$application/index-feature-actions';

/**
 * Everything a sprint (or the work queue) can take in, at the three altitudes
 * the queue distributes: whole cores, leaf features, kernel actions. Pure over
 * the draft + the read-only action index, so the Roadmap tab's "Add task"
 * picker and any future entry point list the same candidates.
 */
export interface WorkItemCandidate {
	/** Stable identity, same as {@link workTargetKey}. */
	key: string;
	target: WorkTarget;
	kind: WorkTargetKind;
	label: string;
	/** Where the item sits in the tree: the core for a feature, the feature for an action. */
	context: string | null;
	/** Sprint the item is currently parked in (null when unsprinted or not queued). */
	sprintId: string | null;
	/** Whether the item is already in the work queue at all. */
	queued: boolean;
}

export function workItemCandidates(
	draft: ProjectFeaturesDraft,
	featureActions: FeatureActionIndex
): WorkItemCandidate[] {
	const out: WorkItemCandidate[] = [];
	const push = (target: WorkTarget, label: string, context: string | null) => {
		const assignment = findAssignment(draft, target);
		out.push({
			key: workTargetKey(target),
			target,
			kind: target.kind,
			label,
			context,
			sprintId: assignment?.sprintId ?? null,
			queued: assignment !== null
		});
	};

	for (const core of draft.cores) {
		push({ kind: 'core', coreId: core.id }, core.name || 'Untitled core', null);
	}
	const coreName = new Map(draft.cores.map((c) => [c.id, c.name || 'Untitled core']));
	const leaves = leafFeatures(draft);
	for (const feat of leaves) {
		push(
			{ kind: 'feature', featureId: feat.id },
			feat.name || 'Untitled feature',
			coreName.get(feat.coreId) ?? null
		);
	}
	for (const feat of leaves) {
		for (const action of featureActions[feat.id] ?? []) {
			push(
				{ kind: 'action', featureId: feat.id, actionId: action.id },
				action.name || 'Untitled action',
				feat.name || 'Untitled feature'
			);
		}
	}
	return out;
}
