import {
	assignmentTargetKey,
	computeFeaturesCoherence,
	createAcceptanceCriterion,
	createCore,
	createFamily,
	createFeature,
	createRelease,
	createSprint,
	createWorkAssignment,
	familyIdsUnderCore,
	familyIdsUnderFamily,
	featureIdsUnderCore,
	featureIdsUnderFamily,
	featuresCanAdvance,
	findAssignment,
	leafFeatures,
	nextReleaseVersion,
	releaseLabel,
	missingFeaturesRequirements,
	workTargetKey,
	type Core,
	type Family,
	type Feature,
	type FeaturesTab,
	type LeafMeta,
	type MvpTier,
	type ProjectFeaturesDraft,
	type Release,
	type Sprint,
	type WorkAssignment,
	type WorkStatus,
	type WorkTarget
} from '$domain/features';
import type { CoherenceResult } from '$domain/shared';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * Step 04 store — orchestrator for the Functional Structure screen. Mirror of
 * Step 02/03 stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `1e95b087` is honored uniformly. Tab state is
 * local-only.
 */
export class FeaturesStore {
	draft = $state<ProjectFeaturesDraft>(null as unknown as ProjectFeaturesDraft);
	activeTab = $state<FeaturesTab>('tree');
	selectedFeatureId = $state<string | null>(null);

	coherence = $derived.by<CoherenceResult>(() => computeFeaturesCoherence(this.draft));
	canAdvance = $derived.by<boolean>(() => featuresCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingFeaturesRequirements(this.draft));

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectFeaturesDraft>;

	constructor(
		initial: ProjectFeaturesDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/features',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
		this.#migrateLegacyActionAssignments();
	}

	/**
	 * One-time migration: fold the legacy per-action `actionAssignments`
	 * (`featureId::actionId` → collaborator id) into the unified `assignments`
	 * model, then clear the old map so we don't re-import on the next load. No-op
	 * once `assignments` already carries entries (or the legacy map is empty).
	 */
	#migrateLegacyActionAssignments = () => {
		if (!this.draft.assignments) this.draft.assignments = [];
		if (!this.draft.sprints) this.draft.sprints = [];
		const legacy = this.draft.actionAssignments ?? {};
		const keys = Object.keys(legacy);
		if (keys.length === 0 || this.draft.assignments.length > 0) return;
		let order = 0;
		for (const key of keys) {
			const sep = key.indexOf('::');
			if (sep < 0) continue;
			const featureId = key.slice(0, sep);
			const actionId = key.slice(sep + 2);
			this.draft.assignments.push(
				createWorkAssignment(
					{ kind: 'action', featureId, actionId },
					{ assigneeId: legacy[key], order: order++ }
				)
			);
		}
		this.draft.actionAssignments = {};
		this.#touch('features.assignments.migrate');
	};

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}

	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	hydrate = (incoming: ProjectFeaturesDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	switchTab = (tab: FeaturesTab) => {
		this.activeTab = tab;
	};

	/* ─────────────────────────── CORES ─────────────────────────────────── */
	addCore = (overrides: Partial<Core> = {}): string => {
		const tones = ['customer', 'invoicing', 'payment', 'dunning', 'reporting'] as const;
		const core = createCore({ tone: tones[this.draft.cores.length % tones.length], ...overrides });
		this.draft.cores.push(core);
		this.#touch('features.cores');
		return core.id;
	};

	updateCore = <K extends keyof Core>(coreId: string, field: K, value: Core[K]) => {
		const c = this.draft.cores.find((c) => c.id === coreId);
		if (!c) return;
		(c as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('features.cores');
	};

	removeCore = (coreId: string) => {
		const idx = this.draft.cores.findIndex((c) => c.id === coreId);
		if (idx < 0) return;
		const familyIds = new Set(familyIdsUnderCore(this.draft, coreId));
		const featureIds = new Set(featureIdsUnderCore(this.draft, coreId));
		this.draft.cores.splice(idx, 1);
		this.draft.families = this.draft.families.filter((f) => !familyIds.has(f.id));
		this.draft.features = this.draft.features.filter((f) => !featureIds.has(f.id));
		this.draft.mvpAssignments = this.draft.mvpAssignments.filter(
			(m) => !featureIds.has(m.featureId)
		);
		this.draft.roadmapAssignments = this.draft.roadmapAssignments.filter(
			(r) => !featureIds.has(r.featureId)
		);
		// Drop work items for the removed features and for the core itself.
		this.#dropAssignmentsForFeatures(featureIds);
		this.draft.assignments = (this.draft.assignments ?? []).filter((a) => a.coreId !== coreId);
		this.#touch('features.cores');
	};

	/* ────────────────────────── FAMILIES ───────────────────────────────── */
	addFamilyToCore = (coreId: string, overrides: Partial<Family> = {}): string => {
		const fam = createFamily(coreId, null, overrides);
		this.draft.families.push(fam);
		this.#touch('features.families');
		return fam.id;
	};

	addSubFamily = (parentFamilyId: string, overrides: Partial<Family> = {}): string => {
		const parent = this.draft.families.find((f) => f.id === parentFamilyId);
		if (!parent) throw new Error('parent family not found');
		const fam = createFamily(parent.coreId, parentFamilyId, overrides);
		this.draft.families.push(fam);
		this.#touch('features.families');
		return fam.id;
	};

	updateFamily = <K extends keyof Family>(familyId: string, field: K, value: Family[K]) => {
		const f = this.draft.families.find((f) => f.id === familyId);
		if (!f) return;
		(f as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('features.families');
	};

	removeFamily = (familyId: string) => {
		const familyIds = new Set(familyIdsUnderFamily(this.draft, familyId));
		const featureIds = new Set(featureIdsUnderFamily(this.draft, familyId));
		this.draft.families = this.draft.families.filter((f) => !familyIds.has(f.id));
		this.draft.features = this.draft.features.filter((f) => !featureIds.has(f.id));
		this.draft.mvpAssignments = this.draft.mvpAssignments.filter(
			(m) => !featureIds.has(m.featureId)
		);
		this.draft.roadmapAssignments = this.draft.roadmapAssignments.filter(
			(r) => !featureIds.has(r.featureId)
		);
		this.#touch('features.families');
	};

	/* ────────────────────────── FEATURES ───────────────────────────────── */
	addFeatureToCore = (coreId: string, name = ''): string => {
		const feat = createFeature(coreId, null, { name });
		this.draft.features.push(feat);
		this.selectedFeatureId = feat.id;
		this.#touch('features.features');
		return feat.id;
	};

	addFeatureToFamily = (familyId: string, name = ''): string => {
		const fam = this.draft.families.find((f) => f.id === familyId);
		if (!fam) throw new Error('family not found');
		const feat = createFeature(fam.coreId, familyId, { name });
		this.draft.features.push(feat);
		this.selectedFeatureId = feat.id;
		this.#touch('features.features');
		return feat.id;
	};

	updateFeature = <K extends keyof Feature>(featureId: string, field: K, value: Feature[K]) => {
		// Block writes to the immutable identity fields.
		if (field === 'id' || field === 'unspaghettitFeatureId') return;
		const f = this.draft.features.find((f) => f.id === featureId);
		if (!f) return;
		(f as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('features.features');
	};

	removeFeature = (featureId: string) => {
		this.draft.features = this.draft.features.filter((f) => f.id !== featureId);
		this.draft.mvpAssignments = this.draft.mvpAssignments.filter(
			(m) => m.featureId !== featureId
		);
		this.draft.roadmapAssignments = this.draft.roadmapAssignments.filter(
			(r) => r.featureId !== featureId
		);
		if (this.draft.leafMeta && featureId in this.draft.leafMeta) {
			delete this.draft.leafMeta[featureId];
		}
		// Ownership is keyed by feature — drop it with the feature it belonged to.
		for (const key of Object.keys(this.draft.actionAssignments ?? {})) {
			if (key.startsWith(`${featureId}::`)) delete this.draft.actionAssignments![key];
		}
		this.#dropAssignmentsForFeatures(new Set([featureId]));
		if (this.selectedFeatureId === featureId) this.selectedFeatureId = null;
		this.#touch('features.features');
	};

	/* ─────────────────────── LEAF META (status + authoring) ─────────────── */
	/** Read a leaf's authoring/status decoration. Returns `{}` when absent. */
	getLeafMeta = (featureId: string): LeafMeta => this.draft.leafMeta?.[featureId] ?? {};

	/**
	 * Shallow-merge `patch` into a leaf's meta, creating the map/entry as needed,
	 * then persist through the same #touch/autosave path as the other mutators.
	 * Empty-string values are kept (an explicitly cleared field is meaningful).
	 */
	updateLeafMeta = (featureId: string, patch: Partial<LeafMeta>) => {
		if (!this.draft.leafMeta) this.draft.leafMeta = {};
		this.draft.leafMeta[featureId] = { ...this.draft.leafMeta[featureId], ...patch };
		this.#touch('features.leafMeta');
	};

	/**
	 * Set a manual TRL (1-9) readiness for a leaf, or clear it (null → back to the
	 * engine-computed readiness). Clearing deletes the key so the residue stays
	 * clean rather than carrying an `undefined`.
	 */
	setLeafTrl = (featureId: string, level: number | null) => {
		if (level == null) {
			const meta = this.draft.leafMeta?.[featureId];
			if (meta && meta.trl !== undefined) {
				delete meta.trl;
				this.#touch('features.leafMeta');
			}
			return;
		}
		this.updateLeafMeta(featureId, { trl: Math.max(1, Math.min(9, Math.round(level))) });
	};

	/** Manual TRL (1-9) of a single action, or null when unset. Actions have no
	 * engine score, so this hand-set level is their only readiness. */
	getActionTrl = (featureId: string, actionId: string): number | null =>
		this.draft.actionTrl?.[`${featureId}::${actionId}`] ?? null;

	/** Set (1-9) or clear (null) an action's manual TRL. */
	setActionTrl = (featureId: string, actionId: string, level: number | null) => {
		const key = `${featureId}::${actionId}`;
		if (level == null) {
			if (this.draft.actionTrl && key in this.draft.actionTrl) {
				delete this.draft.actionTrl[key];
				this.#touch('features.actionTrl');
			}
			return;
		}
		if (!this.draft.actionTrl) this.draft.actionTrl = {};
		this.draft.actionTrl[key] = Math.max(1, Math.min(9, Math.round(level)));
		this.#touch('features.actionTrl');
	};

	/** Release id an action is assigned to, or null when it rides with its feature. */
	getActionRelease = (featureId: string, actionId: string): string | null =>
		this.draft.actionRelease?.[`${featureId}::${actionId}`] ?? null;

	/** Assign (release id) or clear (null) an action's release. */
	setActionRelease = (featureId: string, actionId: string, releaseId: string | null) => {
		const key = `${featureId}::${actionId}`;
		if (!releaseId) {
			if (this.draft.actionRelease && key in this.draft.actionRelease) {
				delete this.draft.actionRelease[key];
				this.#touch('features.actionRelease');
			}
			return;
		}
		if (!this.draft.actionRelease) this.draft.actionRelease = {};
		this.draft.actionRelease[key] = releaseId;
		this.#touch('features.actionRelease');
	};

	/* ─────────── Contributors on a feature/action (team member ids) ───────── */
	/* Stored in the `featureRoles`/`actionRoles` residue maps (kept for
	 * back-compat) — the values are collaborator ids: the people who contribute
	 * to that feature/action. Empty ⇒ no one attached yet. */
	getFeatureContributors = (featureId: string): string[] => this.draft.featureRoles?.[featureId] ?? [];

	/** Add or remove a contributor from a feature; deletes the entry when empty. */
	toggleFeatureContributor = (featureId: string, collaboratorId: string) => {
		const current = this.getFeatureContributors(featureId);
		const next = current.includes(collaboratorId)
			? current.filter((id) => id !== collaboratorId)
			: [...current, collaboratorId];
		if (!this.draft.featureRoles) this.draft.featureRoles = {};
		if (next.length > 0) this.draft.featureRoles[featureId] = next;
		else delete this.draft.featureRoles[featureId];
		this.#touch('features.featureRoles');
	};

	/** Contributor ids on a single action (empty ⇒ inherits its feature's team). */
	getActionContributors = (featureId: string, actionId: string): string[] =>
		this.draft.actionRoles?.[`${featureId}::${actionId}`] ?? [];

	/** Add or remove a contributor from an action; deletes the entry when empty. */
	toggleActionContributor = (featureId: string, actionId: string, collaboratorId: string) => {
		const key = `${featureId}::${actionId}`;
		const current = this.getActionContributors(featureId, actionId);
		const next = current.includes(collaboratorId)
			? current.filter((id) => id !== collaboratorId)
			: [...current, collaboratorId];
		if (!this.draft.actionRoles) this.draft.actionRoles = {};
		if (next.length > 0) this.draft.actionRoles[key] = next;
		else delete this.draft.actionRoles[key];
		this.#touch('features.actionRoles');
	};

	/* Acceptance criteria — array-aware, so they can't use the shallow updateLeafMeta. */
	addAcceptanceCriterion = (featureId: string) => {
		const list = [...(this.getLeafMeta(featureId).acceptanceCriteria ?? []), createAcceptanceCriterion()];
		this.updateLeafMeta(featureId, { acceptanceCriteria: list });
	};
	updateAcceptanceCriterion = (featureId: string, criterionId: string, text: string) => {
		const list = (this.getLeafMeta(featureId).acceptanceCriteria ?? []).map((c) =>
			c.id === criterionId ? { ...c, text } : c
		);
		this.updateLeafMeta(featureId, { acceptanceCriteria: list });
	};
	removeAcceptanceCriterion = (featureId: string, criterionId: string) => {
		const list = (this.getLeafMeta(featureId).acceptanceCriteria ?? []).filter(
			(c) => c.id !== criterionId
		);
		this.updateLeafMeta(featureId, { acceptanceCriteria: list });
	};

	/* ───────────────── WORK DISTRIBUTION (assignments + sprints) ────────────
	 * A WorkAssignment queues a core / feature / action and (optionally) hands it
	 * to a member. Its mere existence = "in the queue"; `assigneeId` = who owns it.
	 * Feature status still lives in `leafMeta`; core/action status rides here. */

	/** The stored assignment for a target, or null when the item isn't queued. */
	getAssignment = (target: WorkTarget): WorkAssignment | null =>
		findAssignment(this.draft, target);

	#nextOrder = (assigneeId: string | null): number => {
		const peers = (this.draft.assignments ?? []).filter((a) => (a.assigneeId ?? null) === assigneeId);
		return peers.reduce((max, a) => Math.max(max, a.order), -1) + 1;
	};

	#label = (target: WorkTarget): string | undefined => {
		if (target.kind === 'core') return this.draft.cores.find((c) => c.id === target.coreId)?.name;
		if (target.kind === 'feature')
			return this.draft.features.find((f) => f.id === target.featureId)?.name;
		return undefined; // action labels resolve live from the kernel index at render
	};

	/** Ensure a target is queued (create the assignment if missing); returns it. */
	#ensureAssignment = (target: WorkTarget): WorkAssignment => {
		if (!this.draft.assignments) this.draft.assignments = [];
		const existing = findAssignment(this.draft, target);
		if (existing) return existing;
		const created = createWorkAssignment(target, {
			order: this.#nextOrder(null),
			label: this.#label(target)
		});
		this.draft.assignments.push(created);
		return created;
	};

	/** Toggle whether a target is in the work queue (unassigned when newly added). */
	toggleQueued = (target: WorkTarget) => {
		const key = workTargetKey(target);
		const list = this.draft.assignments ?? [];
		const idx = list.findIndex((a) => assignmentTargetKey(a) === key);
		if (idx >= 0) list.splice(idx, 1);
		else this.#ensureAssignment(target);
		this.draft.assignments = list;
		this.#touch('features.assignments');
	};

	/** Assign a target to a member (queuing it if needed); `null` unassigns but
	 *  keeps it in the queue. */
	assignWorkItem = (target: WorkTarget, assigneeId: string | null) => {
		const a = this.#ensureAssignment(target);
		if (a.assigneeId !== assigneeId) {
			a.assigneeId = assigneeId;
			a.order = this.#nextOrder(assigneeId); // append to the new owner's queue
		}
		this.#touch('features.assignments');
	};

	/** Place a queued target into a sprint (or `null` to remove it from any sprint). */
	setWorkItemSprint = (target: WorkTarget, sprintId: string | null) => {
		const a = this.#ensureAssignment(target);
		a.sprintId = sprintId;
		this.#touch('features.assignments');
	};

	/** Set the status of a core/action work item. Ignored for feature targets
	 *  (their status is the feature's `leafMeta.status`). */
	setWorkItemStatus = (target: WorkTarget, status: WorkStatus) => {
		if (target.kind === 'feature') {
			this.updateLeafMeta(target.featureId, {
				status: status === 'todo' ? 'backlog' : status
			});
			return;
		}
		const a = this.#ensureAssignment(target);
		a.status = status;
		this.#touch('features.assignments');
	};

	/** Reorder within one assignee's queue: move `id` to sit before `beforeId`
	 *  (or to the end when `beforeId` is null). Renumbers that assignee's `order`. */
	reorderQueue = (assigneeId: string | null, id: string, beforeId: string | null) => {
		const list = this.draft.assignments ?? [];
		const group = list
			.filter((a) => (a.assigneeId ?? null) === assigneeId)
			.sort((a, b) => a.order - b.order);
		const from = group.findIndex((a) => a.id === id);
		if (from < 0) return;
		const [moved] = group.splice(from, 1);
		const to = beforeId ? group.findIndex((a) => a.id === beforeId) : group.length;
		group.splice(to < 0 ? group.length : to, 0, moved);
		group.forEach((a, i) => (a.order = i));
		this.#touch('features.assignments.reorder');
	};

	/* Sprints — first-class delivery buckets (mirror the Release mutators). */
	addSprint = (overrides: Partial<Sprint> = {}): string => {
		if (!this.draft.sprints) this.draft.sprints = [];
		const nextOrder = (this.draft.sprints.at(-1)?.order ?? -1) + 1;
		const s = createSprint({ order: nextOrder, name: `Sprint ${this.draft.sprints.length + 1}`, ...overrides });
		this.draft.sprints.push(s);
		this.#touch('features.sprints');
		this.notifier.notify('info', `Sprint "${s.name}" added.`);
		return s.id;
	};

	updateSprint = <K extends keyof Sprint>(sprintId: string, field: K, value: Sprint[K]) => {
		const s = this.draft.sprints?.find((s) => s.id === sprintId);
		if (!s) return;
		(s as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('features.sprints');
	};

	/** Freeze a sprint in history: stamp `archivedAt` so it leaves pickers and
	 *  filters. Done-ness stays derived; this is the explicit closing act. */
	archiveSprint = (sprintId: string) => {
		const s = this.draft.sprints?.find((s) => s.id === sprintId);
		if (!s || s.archivedAt) return;
		s.archivedAt = new Date().toISOString();
		this.#touch('features.sprints');
		this.notifier.notify('info', `Sprint "${s.name || 'Untitled sprint'}" archived.`);
	};

	/** Bring an archived sprint back onto the board (clears the stamp). */
	unarchiveSprint = (sprintId: string) => {
		const s = this.draft.sprints?.find((s) => s.id === sprintId);
		if (!s || !s.archivedAt) return;
		delete s.archivedAt;
		this.#touch('features.sprints');
		this.notifier.notify('info', `Sprint "${s.name || 'Untitled sprint'}" is back on the board.`);
	};

	removeSprint = (sprintId: string) => {
		const s = this.draft.sprints?.find((s) => s.id === sprintId);
		if (!s) return;
		this.draft.sprints = (this.draft.sprints ?? []).filter((s) => s.id !== sprintId);
		// Detach any work items that lived in the removed sprint.
		let detached = 0;
		for (const a of this.draft.assignments ?? []) {
			if (a.sprintId === sprintId) {
				a.sprintId = null;
				detached += 1;
			}
		}
		this.#touch('features.sprints');
		const name = s.name || 'Untitled sprint';
		this.notifier.notify(
			'info',
			detached === 0
				? `Sprint "${name}" removed.`
				: `Sprint "${name}" removed; its ${detached} task${detached === 1 ? ' stays' : 's stay'} in the queue without a sprint.`
		);
	};

	/** Drop every assignment targeting a set of features (or their actions). */
	#dropAssignmentsForFeatures = (featureIds: Set<string>) => {
		if (!this.draft.assignments) return;
		this.draft.assignments = this.draft.assignments.filter(
			(a) => !(a.featureId && featureIds.has(a.featureId))
		);
	};

	/** Toggle a dependency on another leaf. Ignores self-references. */
	toggleDependency = (featureId: string, dependsOnId: string) => {
		if (featureId === dependsOnId) return;
		const current = this.getLeafMeta(featureId).dependsOn ?? [];
		const next = current.includes(dependsOnId)
			? current.filter((id) => id !== dependsOnId)
			: [...current, dependsOnId];
		this.updateLeafMeta(featureId, { dependsOn: next });
	};

	/** Attach or detach a stable reference from the Documents & Sources register. */
	toggleSource = (featureId: string, sourceId: string) => {
		const current = this.getLeafMeta(featureId).sourceIds ?? [];
		const next = current.includes(sourceId)
			? current.filter((id) => id !== sourceId)
			: [...current, sourceId];
		this.updateLeafMeta(featureId, { sourceIds: next });
	};

	moveFeature = (featureId: string, newCoreId: string, newParentFamilyId: string | null) => {
		const f = this.draft.features.find((f) => f.id === featureId);
		if (!f) return;
		if (f.coreId === newCoreId && f.parentFamilyId === newParentFamilyId) return; // no-op
		f.coreId = newCoreId;
		f.parentFamilyId = newParentFamilyId;
		this.#touch('features.features');
		const core = this.draft.cores.find((c) => c.id === newCoreId)?.name || 'Untitled core';
		const family = newParentFamilyId
			? this.draft.families.find((fam) => fam.id === newParentFamilyId)?.name || 'Untitled family'
			: null;
		this.notifier.notify(
			'info',
			`"${f.name || 'Untitled feature'}" moved to ${core}${family ? ` › ${family}` : ''}.`
		);
	};

	/**
	 * Drag-and-drop reorder: move `featureId` so it sits immediately before
	 * `targetFeatureId` in the underlying list (sibling order = array order),
	 * adopting the target's core + family so a cross-group drop both relocates
	 * and positions the feature in one gesture. No-op when dropped on itself.
	 */
	reorderFeatureBefore = (featureId: string, targetFeatureId: string) => {
		if (featureId === targetFeatureId) return;
		const feats = this.draft.features;
		const from = feats.findIndex((f) => f.id === featureId);
		const target = feats.find((f) => f.id === targetFeatureId);
		if (from < 0 || !target) return;
		const [moved] = feats.splice(from, 1);
		moved.coreId = target.coreId; // adopt the drop target's group
		moved.parentFamilyId = target.parentFamilyId;
		const to = feats.findIndex((f) => f.id === targetFeatureId);
		feats.splice(to, 0, moved);
		this.#touch('features.reorder');
	};

	selectFeature = (featureId: string | null) => {
		this.selectedFeatureId = featureId;
	};

	/* ────────────────────────── MVP TIERS ──────────────────────────────── */
	setMvpTier = (featureId: string, tier: MvpTier) => {
		const existing = this.draft.mvpAssignments.find((m) => m.featureId === featureId);
		if (existing) existing.tier = tier;
		else this.draft.mvpAssignments.push({ featureId, tier });
		this.#touch('features.mvpAssignments');
	};

	clearMvpTier = (featureId: string) => {
		this.draft.mvpAssignments = this.draft.mvpAssignments.filter(
			(m) => m.featureId !== featureId
		);
		this.#touch('features.mvpAssignments');
	};

	getMvpTier = (featureId: string): MvpTier | null =>
		this.draft.mvpAssignments.find((m) => m.featureId === featureId)?.tier ?? null;

	autoAssignMvpTiers = () => {
		// v0 heuristic: anything still uncategorized → 'should'. Production would
		// consult Step 02 SLAs + Step 03 system-capability coverage + family depth.
		const tiered = new Set(this.draft.mvpAssignments.map((m) => m.featureId));
		let assigned = 0;
		for (const leaf of leafFeatures(this.draft)) {
			if (!tiered.has(leaf.id)) {
				this.draft.mvpAssignments.push({ featureId: leaf.id, tier: 'should' });
				assigned += 1;
			}
		}
		this.#touch('features.mvpAssignments');
		this.notifier.notify(
			'info',
			assigned === 0
				? 'Every feature already has an MVP tier.'
				: `${assigned} feature${assigned === 1 ? '' : 's'} without a tier set to Should.`
		);
	};

	/* ────────────────────────── ROADMAP ────────────────────────────────── */
	addRelease = (overrides: Partial<Release> = {}): string => {
		const nextOrder = (this.draft.releases.at(-1)?.order ?? -1) + 1;
		const r = createRelease({
			order: nextOrder,
			version: nextReleaseVersion(this.draft),
			...overrides
		});
		this.draft.releases.push(r);
		this.#touch('features.releases');
		this.notifier.notify('info', `Release ${releaseLabel(r)} added.`);
		return r.id;
	};

	updateRelease = <K extends keyof Release>(releaseId: string, field: K, value: Release[K]) => {
		const r = this.draft.releases.find((r) => r.id === releaseId);
		if (!r) return;
		(r as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('features.releases');
	};

	/** Pin a release as shipped: stamp `archivedAt` so it stays in the shipped
	 *  timeline even if a feature is later reopened. Done-ness stays derived. */
	archiveRelease = (releaseId: string) => {
		const r = this.draft.releases.find((r) => r.id === releaseId);
		if (!r || r.archivedAt) return;
		r.archivedAt = new Date().toISOString();
		this.#touch('features.releases');
		this.notifier.notify('info', `Release ${releaseLabel(r)} marked as shipped.`);
	};

	/** Bring an archived release back onto the board (clears the stamp). */
	unarchiveRelease = (releaseId: string) => {
		const r = this.draft.releases.find((r) => r.id === releaseId);
		if (!r || !r.archivedAt) return;
		delete r.archivedAt;
		this.#touch('features.releases');
		this.notifier.notify('info', `Release ${releaseLabel(r)} is back on the board.`);
	};

	removeRelease = (releaseId: string) => {
		const r = this.draft.releases.find((r) => r.id === releaseId);
		if (!r) return;
		const unscheduled = this.draft.roadmapAssignments.filter((a) => a.releaseId === releaseId).length;
		this.draft.releases = this.draft.releases.filter((r) => r.id !== releaseId);
		this.draft.roadmapAssignments = this.draft.roadmapAssignments.filter(
			(r) => r.releaseId !== releaseId
		);
		// Per-action overrides pointing at the removed release go with it (same
		// cascade as the roadmap API's remove_release, so no dangling rows).
		for (const key of Object.keys(this.draft.actionRelease ?? {})) {
			if (this.draft.actionRelease![key] === releaseId) delete this.draft.actionRelease![key];
		}
		this.#touch('features.releases');
		this.notifier.notify(
			'info',
			unscheduled === 0
				? `Release ${releaseLabel(r)} removed.`
				: `Release ${releaseLabel(r)} removed; ${unscheduled} feature${unscheduled === 1 ? '' : 's'} back in the backlog.`
		);
	};

	assignFeatureToRelease = (featureId: string, releaseId: string) => {
		const existing = this.draft.roadmapAssignments.find((r) => r.featureId === featureId);
		if (existing) existing.releaseId = releaseId;
		else this.draft.roadmapAssignments.push({ featureId, releaseId });
		this.#touch('features.roadmapAssignments');
	};

	/** Unschedule a feature (remove its roadmap assignment). */
	unassignFeatureFromRelease = (featureId: string) => {
		this.draft.roadmapAssignments = this.draft.roadmapAssignments.filter(
			(r) => r.featureId !== featureId
		);
		this.#touch('features.roadmapAssignments');
	};

	getReleaseAssignment = (featureId: string): string | null =>
		this.draft.roadmapAssignments.find((r) => r.featureId === featureId)?.releaseId ?? null;

	addBacklogToRelease = (releaseId: string) => {
		const r = this.draft.releases.find((r) => r.id === releaseId);
		if (!r) return;
		const assigned = new Set(this.draft.roadmapAssignments.map((r) => r.featureId));
		let scheduled = 0;
		for (const leaf of leafFeatures(this.draft)) {
			if (!assigned.has(leaf.id)) {
				this.draft.roadmapAssignments.push({ featureId: leaf.id, releaseId });
				scheduled += 1;
			}
		}
		this.#touch('features.roadmapAssignments');
		this.notifier.notify(
			'info',
			scheduled === 0
				? 'The backlog is empty; nothing to schedule.'
				: `${scheduled} backlog feature${scheduled === 1 ? '' : 's'} scheduled in ${releaseLabel(r)}.`
		);
	};

	/* ─────────────────────────── RESET ─────────────────────────────────── */
	reset = () => {
		const id = this.draft.projectId;
		this.draft.cores = [];
		this.draft.families = [];
		this.draft.features = [];
		this.draft.mvpAssignments = [];
		this.draft.releases = [];
		this.draft.roadmapAssignments = [];
		this.draft.sprints = [];
		this.draft.assignments = [];
		this.selectedFeatureId = null;
		this.draft.projectId = id;
		this.#touch('features.reset');
	};
}
