import type { ProjectFeaturesDraft, WorkStatus } from '$domain/features';
import { queueByAssignee, workItemLabel, workItemParentName, workItemStatus } from '$domain/features';
import type { Collaborator } from '$domain/team/team';

/**
 * Read-only view of the Features work queue for the Supervision task board.
 * The queue (assignments + sprints, owned by the Features section) stays the
 * single source of truth for feature work; Supervision only mirrors it so
 * "who is doing what" is one picture. Serializable: built server-side in the
 * supervision page load.
 */
export interface FeatureWorkItem {
	id: string;
	label: string;
	/** Owning leaf feature name for action items (context), else null. */
	parent: string | null;
	kind: 'core' | 'feature' | 'action';
	status: WorkStatus;
}

export interface FeatureWorkGroup {
	/** Collaborator display name, or null for the unassigned bucket. */
	assignee: string | null;
	doneCount: number;
	totalCount: number;
	items: FeatureWorkItem[];
}

export function buildFeatureWorkView(
	draft: ProjectFeaturesDraft,
	collaborators: readonly Collaborator[]
): FeatureWorkGroup[] {
	const nameOf = (id: string) =>
		collaborators.find((c) => c.id === id)?.name.trim() || 'Unknown member';
	return queueByAssignee(draft).map((g) => ({
		assignee: g.assigneeId === null ? null : nameOf(g.assigneeId),
		doneCount: g.doneCount,
		totalCount: g.totalCount,
		items: g.items.map((a) => ({
			id: a.id,
			label: workItemLabel(draft, a),
			parent: workItemParentName(draft, a),
			kind: a.kind,
			status: workItemStatus(draft, a)
		}))
	}));
}
