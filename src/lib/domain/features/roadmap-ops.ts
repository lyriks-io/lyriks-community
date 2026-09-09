import {
	createRelease,
	createSprint,
	createWorkAssignment,
	type LeafMeta,
	type ProjectFeaturesDraft,
	type Release,
	type Sprint,
	type WorkAssignment
} from './draft';
import { findAssignment } from './queue';
import { nextReleaseVersion } from './roadmap';

/* Typed roadmap mutations, one per thing a human can do on the Roadmap tab.
 * The HTTP API (and through it the MCP's apply_roadmap_batch) applies these to
 * a loaded draft so every cascade the dashboard's store performs (release
 * removal cleaning its assignments, sprint removal detaching its items) happens
 * server-side too, instead of leaving dangling rows for the parser to silently
 * drop. Pure: no IO, ids/instants injected by the caller. */

export type LeafStatus = NonNullable<LeafMeta['status']>;

export type RoadmapOperation =
	| { op: 'create_release'; id?: string; name?: string; version?: string; weekStart?: number; weekEnd?: number; description?: string }
	| { op: 'update_release'; releaseId: string; name?: string; version?: string; weekStart?: number; weekEnd?: number; order?: number; description?: string }
	| { op: 'archive_release'; releaseId: string }
	| { op: 'unarchive_release'; releaseId: string }
	| { op: 'remove_release'; releaseId: string }
	| { op: 'create_sprint'; id?: string; name?: string; startDate?: string; endDate?: string }
	| { op: 'update_sprint'; sprintId: string; name?: string; startDate?: string; endDate?: string; order?: number }
	| { op: 'archive_sprint'; sprintId: string }
	| { op: 'unarchive_sprint'; sprintId: string }
	| { op: 'remove_sprint'; sprintId: string }
	| { op: 'assign_feature_to_release'; featureId: string; releaseId: string | null }
	| { op: 'set_feature_sprint'; featureId: string; sprintId: string | null }
	| { op: 'set_feature_status'; featureId: string; status: LeafStatus }
	| { op: 'set_feature_assignee'; featureId: string; assigneeId: string | null };

/** Raised when an operation references an id the draft does not contain. The
 *  batch is atomic: the caller persists nothing when any op fails. */
export class RoadmapOperationError extends Error {
	constructor(index: number, message: string) {
		super(`operations[${index}]: ${message}`);
		this.name = 'RoadmapOperationError';
	}
}

export interface RoadmapOperationResult {
	op: RoadmapOperation['op'];
	/** The id the op created or touched, for the caller's echo. */
	id: string;
}

export function applyRoadmapOperations(
	draft: ProjectFeaturesDraft,
	operations: readonly RoadmapOperation[],
	nowIso: string
): RoadmapOperationResult[] {
	return operations.map((operation, index) => ({
		op: operation.op,
		id: applyOne(draft, operation, index, nowIso)
	}));
}

function release(draft: ProjectFeaturesDraft, id: string, index: number): Release {
	const found = draft.releases.find((r) => r.id === id);
	if (!found) throw new RoadmapOperationError(index, `unknown release "${id}"`);
	return found;
}

function sprint(draft: ProjectFeaturesDraft, id: string, index: number): Sprint {
	const found = (draft.sprints ?? []).find((s) => s.id === id);
	if (!found) throw new RoadmapOperationError(index, `unknown sprint "${id}"`);
	return found;
}

function requireFeature(draft: ProjectFeaturesDraft, id: string, index: number): void {
	if (!draft.features.some((f) => f.id === id)) {
		throw new RoadmapOperationError(index, `unknown feature "${id}"`);
	}
}

/** Mirror of the store's queue append: next order slot within one assignee's queue. */
function nextOrder(draft: ProjectFeaturesDraft, assigneeId: string | null): number {
	const peers = (draft.assignments ?? []).filter((a) => (a.assigneeId ?? null) === assigneeId);
	return peers.reduce((max, a) => Math.max(max, a.order), -1) + 1;
}

/** Mirror of the store's `#ensureAssignment` for feature targets. */
function ensureFeatureAssignment(draft: ProjectFeaturesDraft, featureId: string): WorkAssignment {
	if (!draft.assignments) draft.assignments = [];
	const target = { kind: 'feature' as const, featureId };
	const existing = findAssignment(draft, target);
	if (existing) return existing;
	const created = createWorkAssignment(target, {
		order: nextOrder(draft, null),
		label: draft.features.find((f) => f.id === featureId)?.name
	});
	draft.assignments.push(created);
	return created;
}

function applyOne(
	draft: ProjectFeaturesDraft,
	operation: RoadmapOperation,
	index: number,
	nowIso: string
): string {
	switch (operation.op) {
		case 'create_release': {
			const { op: _op, ...overrides } = operation;
			const created = createRelease({
				order: (draft.releases.at(-1)?.order ?? -1) + 1,
				version: nextReleaseVersion(draft),
				...overrides
			});
			draft.releases.push(created);
			return created.id;
		}
		case 'update_release': {
			const target = release(draft, operation.releaseId, index);
			const { op: _op, releaseId: _id, ...patch } = operation;
			Object.assign(target, patch);
			return target.id;
		}
		case 'archive_release': {
			const target = release(draft, operation.releaseId, index);
			if (!target.archivedAt) target.archivedAt = nowIso;
			return target.id;
		}
		case 'unarchive_release': {
			const target = release(draft, operation.releaseId, index);
			delete target.archivedAt;
			return target.id;
		}
		case 'remove_release': {
			release(draft, operation.releaseId, index);
			draft.releases = draft.releases.filter((r) => r.id !== operation.releaseId);
			draft.roadmapAssignments = draft.roadmapAssignments.filter(
				(r) => r.releaseId !== operation.releaseId
			);
			// Per-action overrides pointing at the removed release go with it.
			for (const key of Object.keys(draft.actionRelease ?? {})) {
				if (draft.actionRelease![key] === operation.releaseId) delete draft.actionRelease![key];
			}
			return operation.releaseId;
		}
		case 'create_sprint': {
			if (!draft.sprints) draft.sprints = [];
			const { op: _op, ...overrides } = operation;
			const created = createSprint({
				order: (draft.sprints.at(-1)?.order ?? -1) + 1,
				name: `Sprint ${draft.sprints.length + 1}`,
				...overrides
			});
			draft.sprints.push(created);
			return created.id;
		}
		case 'update_sprint': {
			const target = sprint(draft, operation.sprintId, index);
			const { op: _op, sprintId: _id, ...patch } = operation;
			Object.assign(target, patch);
			return target.id;
		}
		case 'archive_sprint': {
			const target = sprint(draft, operation.sprintId, index);
			if (!target.archivedAt) target.archivedAt = nowIso;
			return target.id;
		}
		case 'unarchive_sprint': {
			const target = sprint(draft, operation.sprintId, index);
			delete target.archivedAt;
			return target.id;
		}
		case 'remove_sprint': {
			sprint(draft, operation.sprintId, index);
			draft.sprints = (draft.sprints ?? []).filter((s) => s.id !== operation.sprintId);
			for (const a of draft.assignments ?? []) {
				if (a.sprintId === operation.sprintId) a.sprintId = null;
			}
			return operation.sprintId;
		}
		case 'assign_feature_to_release': {
			requireFeature(draft, operation.featureId, index);
			if (operation.releaseId === null) {
				draft.roadmapAssignments = draft.roadmapAssignments.filter(
					(r) => r.featureId !== operation.featureId
				);
				return operation.featureId;
			}
			release(draft, operation.releaseId, index);
			const existing = draft.roadmapAssignments.find((r) => r.featureId === operation.featureId);
			if (existing) existing.releaseId = operation.releaseId;
			else draft.roadmapAssignments.push({ featureId: operation.featureId, releaseId: operation.releaseId });
			return operation.featureId;
		}
		case 'set_feature_sprint': {
			requireFeature(draft, operation.featureId, index);
			if (operation.sprintId !== null) sprint(draft, operation.sprintId, index);
			ensureFeatureAssignment(draft, operation.featureId).sprintId = operation.sprintId;
			return operation.featureId;
		}
		case 'set_feature_status': {
			requireFeature(draft, operation.featureId, index);
			if (!draft.leafMeta) draft.leafMeta = {};
			draft.leafMeta[operation.featureId] = {
				...draft.leafMeta[operation.featureId],
				status: operation.status
			};
			return operation.featureId;
		}
		case 'set_feature_assignee': {
			requireFeature(draft, operation.featureId, index);
			const assignment = ensureFeatureAssignment(draft, operation.featureId);
			if (assignment.assigneeId !== operation.assigneeId) {
				assignment.assigneeId = operation.assigneeId;
				assignment.order = nextOrder(draft, operation.assigneeId);
			}
			return operation.featureId;
		}
	}
}
