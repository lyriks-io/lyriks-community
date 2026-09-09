import type { Feature, ProjectFeaturesDraft, Release, Sprint, WorkAssignment } from './draft';
import { workItemStatus } from './queue';

/* Roadmap read model, pure projections over releases, sprints and statuses.
 * One definition of "done" for the dashboard, the HTTP API and the MCP: a
 * release/sprint is DONE when it is non-empty and every feature/item in it is
 * done, and ARCHIVED only when a human (or an MCP client) explicitly stamped
 * `archivedAt`. Derivation never writes; archiving is the only persisted act. */

/** Where a release or sprint sits in its life. `done` is derived and can flip
 *  back when a feature reopens; `archived` is an explicit stamp and stable. */
export type RoadmapLifecycle = 'planned' | 'in-progress' | 'done' | 'archived';

/** The leaf features assigned to a release, in assignment order. */
export function featuresOfRelease(draft: ProjectFeaturesDraft, releaseId: string): Feature[] {
	return draft.roadmapAssignments
		.filter((r) => r.releaseId === releaseId)
		.map((r) => draft.features.find((f) => f.id === r.featureId))
		.filter((f): f is Feature => f !== undefined);
}

function leafStatus(draft: ProjectFeaturesDraft, featureId: string): 'backlog' | 'in-progress' | 'done' {
	return draft.leafMeta?.[featureId]?.status ?? 'backlog';
}

/** Release completion, 0-100: done leaves / total leaves (0 when empty). */
export function releaseProgress(draft: ProjectFeaturesDraft, releaseId: string): number {
	const feats = featuresOfRelease(draft, releaseId);
	if (feats.length === 0) return 0;
	const done = feats.filter((f) => leafStatus(draft, f.id) === 'done').length;
	return Math.round((done / feats.length) * 100);
}

/** Derived "done": non-empty and every leaf is done. An empty release is never done. */
export function releaseAllDone(draft: ProjectFeaturesDraft, releaseId: string): boolean {
	const feats = featuresOfRelease(draft, releaseId);
	return feats.length > 0 && feats.every((f) => leafStatus(draft, f.id) === 'done');
}

export function releaseLifecycle(draft: ProjectFeaturesDraft, release: Release): RoadmapLifecycle {
	if (release.archivedAt) return 'archived';
	if (releaseAllDone(draft, release.id)) return 'done';
	const feats = featuresOfRelease(draft, release.id);
	const started = feats.some((f) => leafStatus(draft, f.id) !== 'backlog');
	return started ? 'in-progress' : 'planned';
}

/** The work items placed in a sprint (any target kind), unsorted. */
export function sprintItems(draft: ProjectFeaturesDraft, sprintId: string): WorkAssignment[] {
	return (draft.assignments ?? []).filter((a) => a.sprintId === sprintId);
}

/** Sprint completion, 0-100: done items / total items (0 when empty). */
export function sprintProgress(draft: ProjectFeaturesDraft, sprintId: string): number {
	const items = sprintItems(draft, sprintId);
	if (items.length === 0) return 0;
	const done = items.filter((a) => workItemStatus(draft, a) === 'done').length;
	return Math.round((done / items.length) * 100);
}

/** Derived "done": non-empty and every item is done. An empty sprint is never done. */
export function sprintAllDone(draft: ProjectFeaturesDraft, sprintId: string): boolean {
	const items = sprintItems(draft, sprintId);
	return items.length > 0 && items.every((a) => workItemStatus(draft, a) === 'done');
}

export function sprintLifecycle(draft: ProjectFeaturesDraft, sprint: Sprint): RoadmapLifecycle {
	if (sprint.archivedAt) return 'archived';
	if (sprintAllDone(draft, sprint.id)) return 'done';
	const started = sprintItems(draft, sprint.id).some((a) => workItemStatus(draft, a) !== 'todo');
	return started ? 'in-progress' : 'planned';
}

/** How a release is named in a sentence: its badge, plus its name when that
 *  adds something ("V1 \"Checkout\"", but just "MVP" when name and badge agree). */
export function releaseLabel(release: Pick<Release, 'name' | 'version'>): string {
	const version = (release.version ?? '').trim();
	const name = (release.name ?? '').trim();
	if (!version) return name ? `"${name}"` : 'the release';
	return name && name.toLowerCase() !== version.toLowerCase() ? `${version} "${name}"` : version;
}

/** First unused "V<n>" badge (case-insensitive), so a new release never
 *  duplicates the label of one already on the board. */
export function nextReleaseVersion(draft: ProjectFeaturesDraft): string {
	const taken = new Set(draft.releases.map((r) => (r.version ?? '').trim().toUpperCase()));
	let n = 1;
	while (taken.has(`V${n}`)) n += 1;
	return `V${n}`;
}

/** Releases still on the board: neither archived nor derived-done. */
export function activeReleases(draft: ProjectFeaturesDraft): Release[] {
	return draft.releases.filter(
		(r) => !r.archivedAt && !releaseAllDone(draft, r.id)
	);
}

/** Releases off the board: explicitly archived, or derived-done (awaiting the stamp). */
export function shippedReleases(draft: ProjectFeaturesDraft): Release[] {
	return draft.releases.filter((r) => Boolean(r.archivedAt) || releaseAllDone(draft, r.id));
}

/** Sprints still offered by pickers and filters: not archived. Derived-done
 *  sprints stay active until archived, so a reopened task keeps its bucket. */
export function activeSprints(draft: ProjectFeaturesDraft): Sprint[] {
	return (draft.sprints ?? []).filter((s) => !s.archivedAt);
}

export function archivedSprints(draft: ProjectFeaturesDraft): Sprint[] {
	return (draft.sprints ?? []).filter((s) => Boolean(s.archivedAt));
}

/* ── Claim versus evidence ───────────────────────────────────────────────── */

/** The three honest disagreements between what the roadmap claims and what the
 *  last code-adoption sync actually found. */
export type ImplementationDrift =
	| 'spec-moved-since-sync'
	| 'done-but-code-incomplete'
	| 'code-complete-but-not-done';

export interface DriftInput {
	status: 'backlog' | 'in-progress' | 'done';
	/** Spec entities the last sync located in code. */
	found: number;
	/** Spec entities that sync expected, frozen at push time. */
	expected: number;
	/** ISO of that push, null when the sidecar carries no timestamp. */
	syncedAt: string | null;
	/** ISO of the kernel feature's last spec edit, null when unreadable. */
	specUpdatedAt: string | null;
}

const parsedMs = (iso: string | null): number | null => {
	if (!iso) return null;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : ms;
};

/**
 * Which disagreement to report for one leaf, or null when claim and evidence
 * agree. Coverage is a SNAPSHOT: `found` and `expected` were both frozen when
 * the index was last synced, so an edit to the spec afterwards moves neither
 * counter. `spec-moved-since-sync` therefore comes FIRST. Once the spec has
 * moved under the map, the other two comparisons judge the current claim
 * against evidence that no longer describes the current spec, and re-syncing is
 * the only next step that means anything.
 */
export function implementationDrift(input: DriftInput): ImplementationDrift | null {
	const spec = parsedMs(input.specUpdatedAt);
	const synced = parsedMs(input.syncedAt);
	if (spec !== null && synced !== null && spec > synced) return 'spec-moved-since-sync';
	if (input.status === 'done' && input.found < input.expected) return 'done-but-code-incomplete';
	if (input.status !== 'done' && input.found >= input.expected) return 'code-complete-but-not-done';
	return null;
}
