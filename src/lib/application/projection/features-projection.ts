import {
	createEmptyFeaturesDraft,
	type ActionJourneys,
	familyPathOf,
	leafFeatures,
	TAG_TYPES,
	type Core,
	type Family,
	type Feature,
	type LeafMeta,
	type ProjectFeaturesDraft
} from '$domain/features';
import type { BehaviorOp } from '$application/ports';
import type { SpecLanguage } from '$domain/language';
import { ACCEPTANCE_LEAF_PREFIX } from './ownership';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot, UnspaTag } from '$lib/unspa-schema';

/**
 * The Lyriks-owned decoration for the Features section — the organizational
 * scaffolding unspa cannot model. The kernel owns the leaf SET and each leaf's
 * core/family MEMBERSHIP (as tags); this owns the core/family OBJECTS (ids,
 * tone, descriptions). Stored in the residue repo under section "features".
 *
 * Residue written while the product had a roadmap may still hold its releases,
 * sprints, work assignments, action owners, contributors and per-leaf statuses,
 * and kernel shells may still carry `mvp:` and `phase:` tags: none of it is read,
 * and the next save of the section writes the residue and the tags without it.
 */
export interface FeaturesResidue {
	cores: Core[];
	families: Family[];
	/** Per-leaf authoring/status decoration, keyed by feature id. Lyriks-owned —
	 * serialized verbatim into the residue blob, invisible to the kernel. Optional
	 * so residue written before this field existed still typechecks/parses. */
	leafMeta?: Record<string, LeafMeta>;
	/** When each core feature and feature first entered the spec (criterion 2a6bff42). Optional for back-compat. */
	firstSeenAt?: Record<string, string>;
	/** The journeys each feature's actions are arranged in, keyed by feature id. Optional for back-compat. */
	actionJourneys?: ActionJourneys;
	/** UI/meta: last autosave instant. Kept in the residue since it is not behavior. */
	lastSavedAt: string | null;
}

export function emptyFeaturesResidue(): FeaturesResidue {
	return {
		cores: [],
		families: [],
		leafMeta: {},
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
 * tags); cores/families come from the residue. Pure and framework-free:
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
	// Verbatim passthrough, but for the status a leaf once carried by hand: whether a
	// feature is built is read from the code, so a stored one is dropped here and
	// the next save writes the residue without it. `?? {}` tolerates residue
	// written before leafMeta existed.
	draft.leafMeta = withoutStoredStatus(deco.leafMeta ?? {});
	draft.firstSeenAt = deco.firstSeenAt ?? {};
	draft.actionJourneys = deco.actionJourneys ?? {};
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

	// Kernel is the source of the leaf set + order.
	const order = kernel.project?.project.featureIds ?? kernel.features.map((f) => featureId(f));
	const byId = new Map(kernel.features.map((f) => [featureId(f), f]));

	const features: Feature[] = [];

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
	}

	draft.features = features;
	return draft;
}

function withoutStoredStatus(meta: Record<string, LeafMeta>): Record<string, LeafMeta> {
	return Object.fromEntries(
		Object.entries(meta).map(([id, entry]) => {
			const { status: _retired, ...kept } = entry as LeafMeta & { status?: unknown };
			return [id, kept];
		})
	);
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

// ── Inverse: draft → kernel ops + residue (the write side of the projection) ──

/** Split the Lyriks-owned decoration (residue) out of the wizard draft. */
export function featuresResidueFromDraft(draft: ProjectFeaturesDraft): FeaturesResidue {
	return {
		cores: draft.cores,
		families: draft.families,
		leafMeta: draft.leafMeta ?? {},
		firstSeenAt: draft.firstSeenAt ?? {},
		actionJourneys: draft.actionJourneys ?? {},
		lastSavedAt: draft.lastSavedAt
	};
}

export interface FeaturesOpsContext {
	/** Non-leaf features (Data Model, Experience, …) already in the kernel project — preserved. */
	auxFeatureIds: string[];
	/** Current project-level tags to merge into (parity with the old sync). */
	currentProjectTags: UnspaTag[];
	/** The spec's language: the fallback description of a leaf follows it (English when absent). */
	lang?: SpecLanguage;
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
	const fallbackDescription = (id: string) =>
		ctx.lang === 'fr' ? `Fonctionnalité Lyriks ${id}` : `Lyriks Feature ${id}`;
	const leaves = leafFeatures(draft);
	const ops: BehaviorOp[] = leaves.map((leaf) => ({
		kind: 'upsertFeatureShell',
		featureId: leaf.id,
		name: leaf.name || '<unnamed feature>',
		description: leaf.description || fallbackDescription(leaf.id),
		tags: leafTags(draft, leaf.id)
	}));
	// The leaf's own criteria join the model's single list, under a reserved prefix,
	// right after the shell above has guaranteed the feature exists. Always emitted,
	// even empty, so deleting the last criterion clears the projected rows.
	for (const leaf of leaves) {
		ops.push({
			kind: 'mirrorFeatureAcceptance',
			featureId: leaf.id,
			acceptanceCriteria: leafAcceptanceCriteria(draft, leaf.id) as unknown as Record<
				string,
				unknown
			>[],
			ownedPrefix: ACCEPTANCE_LEAF_PREFIX
		});
	}
	ops.push({ kind: 'setProjectFeatureIds', featureIds: [...leaves.map((l) => l.id), ...ctx.auxFeatureIds] });
	ops.push({ kind: 'setProjectTags', tags: mergeTags(ctx.currentProjectTags, projectLevelTags(draft)) });
	ops.push({ kind: 'setProjectCores', cores: projectCores(draft) });
	return ops;
}

/**
 * The cores of the tree as the engine's registry of core features, named the
 * way the leaves' `core:` tags name them (the core's name, else its id).
 */
function projectCores(draft: ProjectFeaturesDraft): { value: string; description: string }[] {
	const seen = new Set<string>();
	const out: { value: string; description: string }[] = [];
	for (const c of draft.cores) {
		const value = (c.name || c.id).trim();
		if (!value || seen.has(value.toLowerCase())) continue;
		seen.add(value.toLowerCase());
		out.push({ value, description: c.description?.trim() || value });
	}
	return out;
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

/**
 * How long a projected criterion's title may be before the prose moves to its
 * description. A wizard criterion is one free-text field; the model's is a titled
 * record, so a short line becomes the title alone and a long one is titled by its
 * opening words with the whole text kept in `description`. Nothing is dropped.
 */
const CRITERION_TITLE_MAX = 120;

/** Cut at the last word boundary at or before `max`, so a title never splits a word. */
function cutAtWord(text: string, max: number): string {
	if (text.length <= max) return text;
	const head = text.slice(0, max);
	const lastSpace = head.lastIndexOf(' ');
	return (lastSpace > max / 2 ? head.slice(0, lastSpace) : head).trimEnd();
}

/**
 * The leaf's authored criteria, in the model's own shape. Blank rows are skipped:
 * the panel mints an empty one the moment someone clicks "Add criterion", and an
 * empty criterion is not a criterion.
 */
function leafAcceptanceCriteria(
	draft: ProjectFeaturesDraft,
	leafId: string
): { id: string; title: string; description?: string }[] {
	const meta: LeafMeta | undefined = draft.leafMeta?.[leafId];
	const out: { id: string; title: string; description?: string }[] = [];
	for (const criterion of meta?.acceptanceCriteria ?? []) {
		const text = criterion.text.trim();
		if (!text) continue;
		const title = cutAtWord(text.split('\n')[0].trim(), CRITERION_TITLE_MAX);
		out.push({
			id: `${ACCEPTANCE_LEAF_PREFIX}${criterion.id}`,
			title,
			...(title === text ? {} : { description: text })
		});
	}
	return out;
}

/** Membership tags for a leaf: its core and its family path. */
function leafTags(draft: ProjectFeaturesDraft, leafId: string): UnspaTag[] {
	const leaf = draft.features.find((f) => f.id === leafId);
	if (!leaf) return [];
	const tags: UnspaTag[] = [];
	const core = draft.cores.find((c) => c.id === leaf.coreId);
	if (core) tags.push({ type: TAG_TYPES.core, value: core.name || core.id });
	const path = familyPathOf(draft, leaf);
	if (path) tags.push({ type: TAG_TYPES.family, value: path });
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
