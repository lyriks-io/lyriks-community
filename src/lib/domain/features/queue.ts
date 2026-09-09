import type {
	ProjectFeaturesDraft,
	WorkAssignment,
	WorkStatus,
	WorkTarget
} from './draft';
import { assignmentTargetKey, workTargetKey } from './draft';

/** Resolve a live action name by (featureId, actionId). Supplied by the UI edge
 *  (which holds the kernel action index) so the domain stays free of it. */
export type ActionNameResolver = (featureId: string, actionId: string) => string | undefined;

/* Work-queue read model — pure projections over the Lyriks-owned `assignments`
 * and `sprints` residue. Framework-free (no store, no IO): the store mutates,
 * these derive. The queue distributes work at three altitudes (core / feature /
 * action) via a single ordered, per-member list. */

/** Reconstruct the {@link WorkTarget} an assignment points at, or null if malformed. */
export function assignmentToTarget(a: WorkAssignment): WorkTarget | null {
	if (a.kind === 'core' && a.coreId) return { kind: 'core', coreId: a.coreId };
	if (a.kind === 'feature' && a.featureId) return { kind: 'feature', featureId: a.featureId };
	if (a.kind === 'action' && a.featureId && a.actionId)
		return { kind: 'action', featureId: a.featureId, actionId: a.actionId };
	return null;
}

/** The assignment targeting `target`, or null when the item isn't queued. */
export function findAssignment(
	draft: ProjectFeaturesDraft,
	target: WorkTarget
): WorkAssignment | null {
	const key = workTargetKey(target);
	return (draft.assignments ?? []).find((a) => assignmentTargetKey(a) === key) ?? null;
}

/**
 * Status of a work item. Feature targets read `leafMeta.status` (so the roadmap's
 * release-progress % stays the single source of truth for features, mapping
 * `backlog` → `todo`); core/action targets carry their own `status`.
 */
export function workItemStatus(draft: ProjectFeaturesDraft, a: WorkAssignment): WorkStatus {
	if (a.kind === 'feature' && a.featureId) {
		const s = draft.leafMeta?.[a.featureId]?.status;
		return s === 'done' ? 'done' : s === 'in-progress' ? 'in-progress' : 'todo';
	}
	return a.status ?? 'todo';
}

/** Human-facing name of a work item: live from the draft/kernel, else the snapshot. */
export function workItemLabel(
	draft: ProjectFeaturesDraft,
	a: WorkAssignment,
	resolveActionName?: ActionNameResolver
): string {
	if (a.kind === 'core') {
		return draft.cores.find((c) => c.id === a.coreId)?.name || a.label || 'Core';
	}
	if (a.kind === 'feature') {
		return draft.features.find((f) => f.id === a.featureId)?.name || a.label || 'Feature';
	}
	// action
	const live = a.featureId && a.actionId ? resolveActionName?.(a.featureId, a.actionId) : undefined;
	return live || a.label || 'Action';
}

/** The owning leaf feature's name for an action item (context in the queue). */
export function workItemParentName(draft: ProjectFeaturesDraft, a: WorkAssignment): string | null {
	if (a.kind === 'action' && a.featureId) {
		return draft.features.find((f) => f.id === a.featureId)?.name || null;
	}
	return null;
}

/** One member's slice of the queue (or the unassigned bucket when `assigneeId` is null). */
export interface QueueGroup {
	assigneeId: string | null;
	items: WorkAssignment[];
	/** First non-done item in queue order — the member's "next task", or null. */
	next: WorkAssignment | null;
	doneCount: number;
	totalCount: number;
}

/**
 * Group the queue by assignee (plus a trailing "Unassigned" bucket), each sorted
 * by `order`. Optionally scope to one sprint. The unassigned bucket is always last.
 */
export function queueByAssignee(
	draft: ProjectFeaturesDraft,
	opts: { sprintId?: string | null } = {}
): QueueGroup[] {
	let assignments = draft.assignments ?? [];
	if (opts.sprintId !== undefined && opts.sprintId !== null) {
		assignments = assignments.filter((a) => a.sprintId === opts.sprintId);
	}

	const byAssignee = new Map<string | null, WorkAssignment[]>();
	for (const a of assignments) {
		const key = a.assigneeId ?? null;
		const list = byAssignee.get(key) ?? [];
		list.push(a);
		byAssignee.set(key, list);
	}

	const groups: QueueGroup[] = [];
	for (const [assigneeId, items] of byAssignee) {
		if (assigneeId === null) continue; // unassigned bucket handled last
		groups.push(buildGroup(draft, assigneeId, items));
	}
	// Stable-ish ordering: by assignee id so the board doesn't jump between renders.
	groups.sort((a, b) => (a.assigneeId ?? '').localeCompare(b.assigneeId ?? ''));

	const unassigned = byAssignee.get(null);
	if (unassigned && unassigned.length > 0) groups.push(buildGroup(draft, null, unassigned));
	return groups;
}

function buildGroup(
	draft: ProjectFeaturesDraft,
	assigneeId: string | null,
	items: WorkAssignment[]
): QueueGroup {
	const sorted = [...items].sort((a, b) => a.order - b.order);
	const next = sorted.find((a) => workItemStatus(draft, a) !== 'done') ?? null;
	const doneCount = sorted.filter((a) => workItemStatus(draft, a) === 'done').length;
	return { assigneeId, items: sorted, next, doneCount, totalCount: sorted.length };
}

/** Distinct sprint ids referenced by any assignment (for a quick "in use" check). */
export function sprintsInUse(draft: ProjectFeaturesDraft): Set<string> {
	const out = new Set<string>();
	for (const a of draft.assignments ?? []) if (a.sprintId) out.add(a.sprintId);
	return out;
}
