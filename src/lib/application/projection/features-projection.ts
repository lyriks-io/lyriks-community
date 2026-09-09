import {
	createEmptyFeaturesDraft,
	familyPathOf,
	isMvpTier,
	leafFeatures,
	TAG_TYPES,
	type Core,
	type Family,
	type Feature,
	type LeafMeta,
	type MvpAssignment,
	type ProjectFeaturesDraft,
	type Release,
	type RoadmapAssignment,
	type Sprint,
	type WorkAssignment
} from '$domain/features';
import type { BehaviorOp } from '$application/ports';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot, UnspaTag } from '$lib/unspa-schema';

/**
 * The Lyriks-owned decoration for the Features section — the organizational
 * scaffolding unspa cannot model. The kernel owns the leaf SET and each leaf's
 * core/family/mvp/phase MEMBERSHIP (as tags); this owns the core/family/release
 * OBJECTS (ids, tone, descriptions, week ranges, order). Stored in
 * the residue repo under section "features".
 */
export interface FeaturesResidue {
	cores: Core[];
	families: Family[];
	releases: Release[];
	/** Per-leaf authoring/status decoration, keyed by feature id. Lyriks-owned —
	 * serialized verbatim into the residue blob, invisible to the kernel. Optional
	 * so residue written before this field existed still typechecks/parses. */
	leafMeta?: Record<string, LeafMeta>;
	/** Per-action ownership (`featureId::actionId` → collaborator id). The actions
	 * are the kernel's; only who owns them is Lyriks-owned. Optional for the same
	 * reason as `leafMeta`. */
	actionAssignments?: Record<string, string>;
	/** Per-action manual TRL (`featureId::actionId` → 1-9). Lyriks-owned; actions
	 * carry no engine score. Optional for back-compat. */
	actionTrl?: Record<string, number>;
	/** Per-action release (`featureId::actionId` → release id). Lyriks-owned.
	 * Optional for back-compat. */
	actionRelease?: Record<string, string>;
	/** Per-feature RBAC scope (feature id → role ids). Lyriks-owned. Optional. */
	featureRoles?: Record<string, string[]>;
	/** Per-action RBAC scope (`featureId::actionId` → role ids). Lyriks-owned. Optional. */
	actionRoles?: Record<string, string[]>;
	/** Work-queue sprints — first-class Lyriks objects (like releases), invisible to
	 * the kernel. Optional so residue written before this field parses unchanged. */
	sprints?: Sprint[];
	/** Work assignments (who owns which core/feature/action, in which sprint/order).
	 * Lyriks-owned decoration; produces no BehaviorOps. Optional for back-compat. */
	assignments?: WorkAssignment[];
	/** UI/meta: last autosave instant. Kept in the residue since it is not behavior. */
	lastSavedAt: string | null;
}

export function emptyFeaturesResidue(): FeaturesResidue {
	return {
		cores: [],
		families: [],
		releases: [],
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

interface KernelView {
	project: UnspaProjectSnapshot | null;
	features: UnspaFeatureSnapshot[];
}

/**
 * Build the Features wizard draft by JOINING the behavior kernel with the Lyriks
 * residue. Leaves + their membership come from the kernel (feature snapshots +
 * tags); cores/families/releases come from the residue. Pure and framework-free —
 * unit-testable, no IO. The inverse (draft → BehaviorOps + residue) lives with the
 * Phase-1 save use-case.
 */
export function buildFeaturesProjection(
	projectId: string,
	kernel: KernelView,
	residue: FeaturesResidue | null
): ProjectFeaturesDraft {
	const deco = residue ?? emptyFeaturesResidue();
	const draft = createEmptyFeaturesDraft(projectId);
	draft.cores = deco.cores;
	draft.families = deco.families;
	draft.releases = deco.releases;
	// Verbatim passthrough; `?? {}` tolerates residue written before leafMeta existed.
	draft.leafMeta = deco.leafMeta ?? {};
	draft.actionAssignments = deco.actionAssignments ?? {};
	draft.actionTrl = deco.actionTrl ?? {};
	draft.actionRelease = deco.actionRelease ?? {};
	draft.featureRoles = deco.featureRoles ?? {};
	draft.actionRoles = deco.actionRoles ?? {};
	draft.sprints = deco.sprints ?? [];
	draft.assignments = deco.assignments ?? [];
	draft.lastSavedAt = deco.lastSavedAt;

	// The binding runs both ways: a `core:`/`family:` tag naming something the
	// residue has no object for was authored in the behavior model (or by hand in
	// unspa), so materialise it here. Without this the leaf keeps its tag but
	// resolves to no Core and disappears from the tree — an edit made in unspa
	// would look like data loss in the wizard.
	const materialised = materialiseMembership(kernel.features, deco);
	draft.cores = [...deco.cores, ...materialised.cores];
	draft.families = [...deco.families, ...materialised.families];

	const familyPathById = buildFamilyPaths(draft.families);
	// Membership tags are matched case-insensitively: the kernel normalises tag
	// values to lowercase on write, so an exact match against the proper-case
	// residue name/path would silently drop the feature from its core/family.
	// (data-projection already matches entity names this way.)
	const coreIdByName = new Map(draft.cores.map((c) => [normTag(c.name), c.id]));
	const familyIdByPath = new Map([...familyPathById].map(([id, path]) => [normTag(path), id]));
	const releaseIdByLabel = buildReleaseLookup(deco.releases);

	// Kernel is the source of the leaf set + order.
	const order = kernel.project?.project.featureIds ?? kernel.features.map((f) => featureId(f));
	const byId = new Map(kernel.features.map((f) => [featureId(f), f]));

	const features: Feature[] = [];
	const mvpAssignments: MvpAssignment[] = [];
	const roadmapAssignments: RoadmapAssignment[] = [];

	for (const id of order) {
		const snap = byId.get(id);
		if (!snap) continue;
		const f = snap.feature as { id: string; name?: string; description?: string; tags?: UnspaTag[] };
		const tags = f.tags ?? [];

		const coreName = tagValue(tags, TAG_TYPES.core);
		const familyPath = tagValue(tags, TAG_TYPES.family);
		features.push({
			id,
			name: f.name ?? '',
			description: f.description ?? '',
			coreId: (coreName && coreIdByName.get(normTag(coreName))) || '',
			parentFamilyId: (familyPath && familyIdByPath.get(normTag(familyPath))) || null,
			unspaghettitFeatureId: id
		});

		const tier = tagValue(tags, TAG_TYPES.mvp);
		if (tier && isMvpTier(tier)) mvpAssignments.push({ featureId: id, tier });

		const phase = tagValue(tags, TAG_TYPES.phase);
		const releaseId = phase ? releaseIdByLabel.get(normTag(phase)) : undefined;
		if (releaseId) roadmapAssignments.push({ featureId: id, releaseId });
	}

	draft.features = features;
	draft.mvpAssignments = mvpAssignments;
	draft.roadmapAssignments = roadmapAssignments;
	return draft;
}

function featureId(snap: UnspaFeatureSnapshot): string {
	return (snap.feature as { id: string }).id;
}

function tagValue(tags: UnspaTag[], type: string): string | undefined {
	return tags.find((t) => t.type === type)?.value;
}

/** Normalise a membership tag value / name for case-insensitive matching. */
function normTag(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * Cores and Families the kernel's membership tags name but the residue has no
 * object for — i.e. authored on the unspa side. Ids are derived from the name so
 * a reload (or two authors) converge on the same object instead of minting a
 * duplicate each time; the first save writes them into the residue, after which
 * they are ordinary Lyriks objects the author can rename, re-tone and describe.
 */
function materialiseMembership(
	features: UnspaFeatureSnapshot[],
	deco: FeaturesResidue
): { cores: Core[]; families: Family[] } {
	const knownCores = new Set(deco.cores.map((c) => normTag(c.name)));
	const knownPaths = new Set([...buildFamilyPaths(deco.families).values()].map(normTag));
	const coreIdByName = new Map(deco.cores.map((c) => [normTag(c.name), c.id]));
	const familyIdByPath = new Map(
		[...buildFamilyPaths(deco.families)].map(([id, path]) => [normTag(path), id])
	);
	const cores: Core[] = [];
	const families: Family[] = [];

	for (const snap of features) {
		const tags = (snap.feature as { tags?: UnspaTag[] }).tags ?? [];
		const coreName = tagValue(tags, TAG_TYPES.core);
		if (!coreName) continue; // a family always hangs under a core
		const coreKey = normTag(coreName);
		if (!knownCores.has(coreKey)) {
			knownCores.add(coreKey);
			const core: Core = {
				id: derivedId('core', coreKey),
				name: titleCase(coreName),
				description: '',
				tone: 'custom'
			};
			coreIdByName.set(coreKey, core.id);
			cores.push(core);
		}
		const coreId = coreIdByName.get(coreKey) as string;

		// A family tag is a slash path; every missing segment along it is minted.
		const familyPath = tagValue(tags, TAG_TYPES.family);
		if (!familyPath) continue;
		let parentFamilyId: string | null = null;
		const segments: string[] = [];
		for (const segment of familyPath.split('/')) {
			const name = segment.trim();
			if (!name) continue;
			segments.push(name);
			const pathKey = normTag(segments.join('/'));
			if (!knownPaths.has(pathKey)) {
				knownPaths.add(pathKey);
				const family: Family = {
					id: derivedId('family', pathKey),
					name: titleCase(name),
					coreId,
					parentFamilyId,
					description: ''
				};
				familyIdByPath.set(pathKey, family.id);
				families.push(family);
			}
			parentFamilyId = familyIdByPath.get(pathKey) as string;
		}
	}
	return { cores, families };
}

/** Stable id from a normalised membership name — same name, same object, every load. */
function derivedId(prefix: string, key: string): string {
	const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	return `${prefix}-${slug || 'unnamed'}`;
}

/** The kernel lowercases tag values, so restore a presentable name for the wizard. */
function titleCase(value: string): string {
	return value
		.trim()
		.split(/\s+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** Slash-joined path per family, mirroring how the wizard writes `family:<path>` tags. */
function buildFamilyPaths(families: Family[]): Map<string, string> {
	const byId = new Map(families.map((f) => [f.id, f]));
	const paths = new Map<string, string>();
	for (const fam of families) {
		const segments: string[] = [];
		let current: Family | undefined = fam;
		const guard = new Set<string>();
		while (current && !guard.has(current.id)) {
			guard.add(current.id);
			segments.unshift(current.name || '<unnamed>');
			current = current.parentFamilyId ? byId.get(current.parentFamilyId) : undefined;
		}
		paths.set(fam.id, segments.join('/'));
	}
	return paths;
}

/** A release is tagged by version, else name, else id — resolve any of them back. */
function buildReleaseLookup(releases: Release[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const r of releases) {
		for (const label of [r.version, r.name, r.id]) {
			if (label && !map.has(normTag(label))) map.set(normTag(label), r.id);
		}
	}
	return map;
}

// ── Inverse: draft → kernel ops + residue (the write side of the projection) ──

/** Split the Lyriks-owned decoration (residue) out of the wizard draft. */
export function featuresResidueFromDraft(draft: ProjectFeaturesDraft): FeaturesResidue {
	return {
		cores: draft.cores,
		families: draft.families,
		releases: draft.releases,
		leafMeta: draft.leafMeta ?? {},
		actionAssignments: draft.actionAssignments ?? {},
		actionTrl: draft.actionTrl ?? {},
		actionRelease: draft.actionRelease ?? {},
		featureRoles: draft.featureRoles ?? {},
		actionRoles: draft.actionRoles ?? {},
		sprints: draft.sprints ?? [],
		assignments: draft.assignments ?? [],
		lastSavedAt: draft.lastSavedAt
	};
}

export interface FeaturesOpsContext {
	/** Non-leaf features (Data Model, Experience, …) already in the kernel project — preserved. */
	auxFeatureIds: string[];
	/** Current project-level tags to merge into (parity with the old sync). */
	currentProjectTags: UnspaTag[];
}

/**
 * Turn a Features draft into the kernel write ops: one shell per leaf carrying its
 * membership tags, the project's leaf-id list (leaves + preserved aux), and the
 * merged project tags. The behavioral half of the flip — the decoration goes to the
 * residue via `featuresResidueFromDraft`.
 */
export function featuresDraftToBehaviorOps(
	draft: ProjectFeaturesDraft,
	ctx: FeaturesOpsContext
): BehaviorOp[] {
	const leaves = leafFeatures(draft);
	const ops: BehaviorOp[] = leaves.map((leaf) => ({
		kind: 'upsertFeatureShell',
		featureId: leaf.id,
		name: leaf.name || '<unnamed feature>',
		description: leaf.description || `Lyriks Feature ${leaf.id}`,
		tags: leafTags(draft, leaf.id)
	}));
	ops.push({ kind: 'setProjectFeatureIds', featureIds: [...leaves.map((l) => l.id), ...ctx.auxFeatureIds] });
	ops.push({ kind: 'setProjectTags', tags: mergeTags(ctx.currentProjectTags, projectLevelTags(draft)) });
	return ops;
}

/** Merge incoming tags with existing, deduping by `type:value`. */
function mergeTags(existing: UnspaTag[], incoming: UnspaTag[]): UnspaTag[] {
	const seen = new Set(existing.map((t) => `${t.type}:${t.value}`));
	const out: UnspaTag[] = [...existing];
	for (const t of incoming) {
		const key = `${t.type}:${t.value}`;
		if (!seen.has(key)) {
			seen.add(key);
			out.push(t);
		}
	}
	return out;
}

/** Membership tags for a leaf — core, family path, optional mvp tier and release version. */
function leafTags(draft: ProjectFeaturesDraft, leafId: string): UnspaTag[] {
	const leaf = draft.features.find((f) => f.id === leafId);
	if (!leaf) return [];
	const tags: UnspaTag[] = [];
	const core = draft.cores.find((c) => c.id === leaf.coreId);
	if (core) tags.push({ type: TAG_TYPES.core, value: core.name || core.id });
	const path = familyPathOf(draft, leaf);
	if (path) tags.push({ type: TAG_TYPES.family, value: path });
	const mvp = draft.mvpAssignments.find((m) => m.featureId === leafId);
	if (mvp) tags.push({ type: TAG_TYPES.mvp, value: mvp.tier });
	const ra = draft.roadmapAssignments.find((r) => r.featureId === leafId);
	if (ra) {
		const rel = draft.releases.find((r) => r.id === ra.releaseId);
		if (rel) tags.push({ type: TAG_TYPES.phase, value: rel.version || rel.name || rel.id });
	}
	return tags;
}

/** Project-level tags — every distinct core name, so the dashboard can filter by domain. */
function projectLevelTags(draft: ProjectFeaturesDraft): UnspaTag[] {
	const out: UnspaTag[] = [];
	for (const c of draft.cores) {
		if (c.name.trim()) out.push({ type: TAG_TYPES.core, value: c.name.trim() });
	}
	return out;
}
