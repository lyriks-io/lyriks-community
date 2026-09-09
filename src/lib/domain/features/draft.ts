import type { CoreTone, MvpTier } from './enums';

/* ── Entities — mirror of Unspaghettit feature 1e95b087 ─────────────── */

export interface Core {
	readonly id: string;
	name: string;
	description: string;
	tone: CoreTone;
}

export interface Family {
	readonly id: string;
	name: string;
	coreId: string;
	parentFamilyId: string | null;
	description: string;
}

/**
 * Leaf node. id == unspaghettitFeatureId by construction; the duplicate field
 * makes the binding first-class for downstream readers (Step 05+) and lets a
 * future schema version decouple if needed.
 */
export interface Feature {
	readonly id: string;
	name: string;
	coreId: string;
	parentFamilyId: string | null;
	description: string;
	readonly unspaghettitFeatureId: string;
}

export interface MvpAssignment {
	readonly featureId: string;
	tier: MvpTier;
}

/**
 * The spec calls this `RoadmapPhase` (state path `features.roadmapPhases`) but
 * the user-facing UI calls it a Release — same entity, renamed in code for
 * clarity. The version + week range fields were added in the spec extension.
 */
export interface Release {
	readonly id: string;
	name: string;
	version: string;
	weekStart: number;
	weekEnd: number;
	order: number;
	description: string;
	/** ISO instant stamped when the release is explicitly shipped/archived. Being
	 * "done" is always DERIVED from feature statuses (see `roadmap.ts`); this stamp
	 * is the deliberate act that pins it in history, so a later reopened feature
	 * cannot silently pull a shipped release back onto the board. Optional so
	 * pre-existing residue parses unchanged. */
	archivedAt?: string;
}

export interface RoadmapAssignment {
	readonly featureId: string;
	releaseId: string;
}

/** One acceptance criterion on a leaf feature — plain text so authors can write
 *  a bullet or a Given/When/Then line, keyed by id for stable list editing. */
export interface AcceptanceCriterion {
	readonly id: string;
	text: string;
}

/* ── Work distribution (Lyriks-owned) ───────────────────────────────────
 * The day-to-day layer on top of the tree: who is doing what, in which sprint,
 * in what order. A WorkAssignment can target any of three granularities — a
 * whole core, a single leaf feature, or one kernel action inside a feature —
 * so the same queue distributes work at every altitude. Sprints are first-class
 * objects (like Releases). Both live in the features RESIDUE, invisible to the
 * kernel, so pre-existing drafts parse unchanged. */

/** Which altitude a WorkAssignment points at. */
export type WorkTargetKind = 'core' | 'feature' | 'action';

/** Queue status for a work item. Feature targets DERIVE this from their
 *  `leafMeta.status` instead (so release progress stays the single source);
 *  core/action targets carry it here. `backlog` maps to `todo` for display. */
export type WorkStatus = 'todo' | 'in-progress' | 'done';
/** Closed vocabulary for {@link WorkStatus}, shared by the parser and the
 *  authoring schema so both gates validate against the same list. */
export const WORK_STATUSES: readonly WorkStatus[] = ['todo', 'in-progress', 'done'];

/**
 * One unit of assignable/queueable work. Identified by its own `id`; the target
 * is addressed by `kind` + the id fields for that kind (see {@link workTargetKey}).
 * `assigneeId` null means "queued but not yet handed to anyone".
 */
export interface WorkAssignment {
	readonly id: string;
	kind: WorkTargetKind;
	/** Present for kind 'core'. */
	coreId?: string;
	/** Owning leaf feature — present for kind 'feature' and 'action'. */
	featureId?: string;
	/** Present for kind 'action' (action ids are only unique within a feature). */
	actionId?: string;
	/** Snapshot of the target's name so the queue reads without a kernel round-trip. */
	label?: string;
	/** Collaborator id, or null when queued but unassigned. */
	assigneeId: string | null;
	/** Owning sprint, or null when not in a sprint. */
	sprintId: string | null;
	/** Status for core/action targets; features derive from `leafMeta.status`. */
	status?: WorkStatus;
	/** Position within the assignee's queue (ascending). */
	order: number;
}

/** A lightweight, first-class delivery bucket for day-to-day planning. */
export interface Sprint {
	readonly id: string;
	name: string;
	/** Optional ISO dates (yyyy-mm-dd) — planning only, never validated as a range. */
	startDate?: string;
	endDate?: string;
	order: number;
	/** ISO instant stamped when the sprint is explicitly closed/archived. Same
	 * contract as {@link Release.archivedAt}: "done" derives from item statuses,
	 * the stamp freezes the sprint in history. Optional for back-compat. */
	archivedAt?: string;
}

/** A resolved pointer to whatever a WorkAssignment targets. */
export type WorkTarget =
	| { kind: 'core'; coreId: string }
	| { kind: 'feature'; featureId: string }
	| { kind: 'action'; featureId: string; actionId: string };

/** Stable identity for a target, so an existing assignment can be found/upserted. */
export function workTargetKey(target: WorkTarget): string {
	switch (target.kind) {
		case 'core':
			return `core:${target.coreId}`;
		case 'feature':
			return `feature:${target.featureId}`;
		case 'action':
			return `action:${target.featureId}::${target.actionId}`;
	}
}

/** The same key for a stored assignment (mirrors {@link workTargetKey}). */
export function assignmentTargetKey(a: WorkAssignment): string {
	if (a.kind === 'core') return `core:${a.coreId ?? ''}`;
	if (a.kind === 'feature') return `feature:${a.featureId ?? ''}`;
	return `action:${a.featureId ?? ''}::${a.actionId ?? ''}`;
}

/**
 * Lyriks-owned authoring/status decoration for a single leaf feature, keyed by
 * feature id. Persists through the features RESIDUE blob (see
 * `features-projection.ts`) — NOT the unspa kernel schema — so it is additive
 * and optional: existing saved data with no `leafMeta` parses unchanged. Every
 * field is optional and empty strings are meaningful (an explicitly cleared
 * authoring note), so consumers must not coalesce `''` away.
 */
export interface LeafMeta {
	status?: 'backlog' | 'in-progress' | 'done';
	/** Manual readiness override, stored on the legacy 1-9 TRL scale (the UI
	    reads and writes it as a spec-maturity stage, `$ui/design-system`
	    stageFromTrl/trlOfStage). When unset, readiness derives from the engine
	    maturity score. */
	trl?: number;
	objective?: string;
	expectedEffect?: string;
	problem?: string;
	value?: string;
	code?: string;
	/** Testable acceptance criteria for this feature (requirements backbone). */
	acceptanceCriteria?: AcceptanceCriterion[];
	/** Ids of other leaf features this one depends on. */
	dependsOn?: string[];
	/** Stable ids from the project Documents & Sources register. */
	sourceIds?: string[];
	/** Legacy or free-form citation kept for backwards compatibility. */
	sourceLink?: string;
}

/**
 * Key of one action-ownership entry. Action ids are only unique within their
 * feature, so the owning feature is part of the key.
 */
export function actionAssignmentKey(featureId: string, actionId: string): string {
	return `${featureId}::${actionId}`;
}

/**
 * The persisted content of Step 04. `features` is the LEAF SET — every entry
 * here is also an Unspaghettit Feature shell on disk (same id). Cores and
 * Families are organizational only.
 */
export interface ProjectFeaturesDraft {
	projectId: string;
	cores: Core[];
	families: Family[];
	features: Feature[];
	mvpAssignments: MvpAssignment[];
	releases: Release[];
	roadmapAssignments: RoadmapAssignment[];
	/** Per-leaf authoring/status decoration, keyed by feature id. Optional so
	 * pre-existing drafts parse unchanged; persisted via the features residue. */
	leafMeta?: Record<string, LeafMeta>;
	/**
	 * Who owns each action, keyed by `actionAssignmentKey` → collaborator id.
	 * The actions themselves belong to the behavior kernel; only the ownership
	 * is Lyriks-owned, so it rides in the features residue. Optional for the
	 * same backward-compatibility reason as `leafMeta`.
	 */
	actionAssignments?: Record<string, string>;
	/** Per-action manual TRL readiness (1-9), keyed by `actionAssignmentKey`.
	 * Actions carry no engine score, so this hand-set level is their only
	 * readiness source. Optional for back-compat, in the features residue. */
	actionTrl?: Record<string, number>;
	/** Per-action release assignment, keyed by `actionAssignmentKey` → release id.
	 * Lets a single action ship in a different release than its parent feature.
	 * Optional for back-compat, in the features residue. */
	actionRelease?: Record<string, string>;
	/** Per-feature CONTRIBUTORS, keyed by feature id → collaborator ids (the team
	 * members who contribute to it). Kept under the legacy `featureRoles` key for
	 * back-compat. A feature can carry one or more people. Lyriks-owned residue. */
	featureRoles?: Record<string, string[]>;
	/** Per-action CONTRIBUTORS, keyed by `actionAssignmentKey` → collaborator ids,
	 * so a single action can name its own people independently of its parent
	 * feature. Legacy `actionRoles` key kept for back-compat. Residue. */
	actionRoles?: Record<string, string[]>;
	/** First-class delivery buckets for the work queue. Optional for the same
	 * backward-compatibility reason as `leafMeta`. */
	sprints?: Sprint[];
	/** Who is doing what (core / feature / action), in which sprint, in what
	 * queue order. Lyriks-owned, in the features residue. Optional for back-compat. */
	assignments?: WorkAssignment[];
	lastSavedAt: string | null;
}

export function createEmptyFeaturesDraft(projectId: string): ProjectFeaturesDraft {
	return {
		projectId,
		cores: [],
		families: [],
		features: [],
		mvpAssignments: [],
		releases: [],
		roadmapAssignments: [],
		leafMeta: {},
		actionAssignments: {},
		actionTrl: {},
		actionRelease: {},
		featureRoles: {},
		actionRoles: {},
		sprints: [],
		assignments: [],
		lastSavedAt: null
	};
}

function newId(): string {
	return crypto.randomUUID();
}

export function createAcceptanceCriterion(text = ''): AcceptanceCriterion {
	return { id: newId(), text };
}

export function createCore(overrides: Partial<Core> = {}): Core {
	return { id: newId(), name: '', description: '', tone: 'custom', ...overrides };
}

export function createFamily(
	coreId: string,
	parentFamilyId: string | null,
	overrides: Partial<Family> = {}
): Family {
	return { id: newId(), name: '', coreId, parentFamilyId, description: '', ...overrides };
}

export function createFeature(
	coreId: string,
	parentFamilyId: string | null,
	overrides: Partial<Omit<Feature, 'unspaghettitFeatureId'>> = {}
): Feature {
	const id = overrides.id ?? newId();
	const base: Feature = {
		id,
		name: '',
		coreId,
		parentFamilyId,
		description: '',
		unspaghettitFeatureId: id
	};
	// Apply overrides but keep id + unspaghettitFeatureId in lockstep.
	return { ...base, ...overrides, id, unspaghettitFeatureId: id };
}

export function createSprint(overrides: Partial<Sprint> = {}): Sprint {
	return { id: newId(), name: '', order: 0, ...overrides };
}

export function createWorkAssignment(
	target: WorkTarget,
	overrides: Partial<Omit<WorkAssignment, 'id' | 'kind'>> = {}
): WorkAssignment {
	const base: WorkAssignment = {
		id: newId(),
		kind: target.kind,
		assigneeId: null,
		sprintId: null,
		order: 0,
		...(target.kind === 'core'
			? { coreId: target.coreId }
			: target.kind === 'feature'
				? { featureId: target.featureId }
				: { featureId: target.featureId, actionId: target.actionId })
	};
	return { ...base, ...overrides };
}

export function createRelease(overrides: Partial<Release> = {}): Release {
	return {
		id: newId(),
		name: '',
		version: 'V1',
		weekStart: 1,
		weekEnd: 6,
		order: 0,
		description: '',
		...overrides
	};
}
