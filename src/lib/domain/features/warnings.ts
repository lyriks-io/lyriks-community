import type { DraftWarning } from '$domain/shared';
import { detectDuplicateFeatureIds } from './dedup';
import type { Family, ProjectFeaturesDraft } from './draft';
import { quoteName, type SpecLanguage } from '$domain/language';

/** The warnings in the spec's language; codes never change, names and ids are quoted as they are. */
const TEXTS = {
	en: {
		q: (name: string) => `"${name}"`,
		coreMissing: (core: string) => `Core "${core}" does not exist.`,
		familyMissing: (family: string) => `Family "${family}" does not exist.`,
		familyOtherCore: (family: string) => `Family "${family}" belongs to a different Core.`,
		danglingCore: (node: string, core: string) => `${node} references Core "${core}", which no longer exists.`,
		danglingFamily: (node: string, family: string) =>
			`${node} references parent Family "${family}", which no longer exists.`,
		familyMismatch: (node: string, family: string) =>
			`${node} is under Family "${family}", which belongs to a different Core.`,
		orphanedMvp: (feature: string) => `MVP assignment targets Feature "${feature}", which no longer exists.`,
		orphanedRoadmap: (feature: string) => `Roadmap assignment targets Feature "${feature}", which no longer exists.`,
		orphanedRelease: (release: string) =>
			`Roadmap assignment places a Feature in Release "${release}", which no longer exists.`,
		duplicateId: (id: string) => `Feature id "${id}" is used by more than one feature; ids must be globally unique.`
	},
	fr: {
		q: (name: string) => quoteName('fr', name),
		coreMissing: (core: string) => `Le domaine ${quoteName('fr', core)} n'existe pas.`,
		familyMissing: (family: string) => `La famille ${quoteName('fr', family)} n'existe pas.`,
		familyOtherCore: (family: string) => `La famille ${quoteName('fr', family)} appartient à un autre domaine.`,
		danglingCore: (node: string, core: string) =>
			`${node} fait référence au domaine ${quoteName('fr', core)}, qui n'existe plus.`,
		danglingFamily: (node: string, family: string) =>
			`${node} fait référence à la famille parente ${quoteName('fr', family)}, qui n'existe plus.`,
		familyMismatch: (node: string, family: string) =>
			`${node} est rangé sous la famille ${quoteName('fr', family)}, qui appartient à un autre domaine.`,
		orphanedMvp: (feature: string) =>
			`Une affectation au MVP vise la fonctionnalité ${quoteName('fr', feature)}, qui n'existe plus.`,
		orphanedRoadmap: (feature: string) =>
			`Une affectation à la feuille de route vise la fonctionnalité ${quoteName('fr', feature)}, qui n'existe plus.`,
		orphanedRelease: (release: string) =>
			`Une affectation à la feuille de route place une fonctionnalité dans la version ${quoteName('fr', release)}, qui n'existe plus.`,
		duplicateId: (id: string) =>
			`L'id de fonctionnalité ${quoteName('fr', id)} est utilisé par plusieurs fonctionnalités${'\u00a0'}; un id doit être unique dans tout le projet.`
	}
} as const;

/**
 * Pure membership rule for one node (Feature or Family) — the anti-corruption
 * check at the authoring edge, before a coreId/parentFamilyId is written.
 *
 * Rules (see MR 6): `coreId` must reference an existing Core; `parentFamilyId`
 * `null` is VALID and means "directly under the Core"; a non-null family must
 * exist AND belong to the same Core as the node. An empty `coreId` is treated as
 * an in-progress "unassigned" state, not an error (matches the warnings above).
 */
export function validateMembership(
	membership: { coreId: string; parentFamilyId: string | null },
	draft: Pick<ProjectFeaturesDraft, 'cores' | 'families'>,
	lang: SpecLanguage = 'en'
): { ok: true } | { ok: false; reason: string } {
	const t = TEXTS[lang];
	const { coreId, parentFamilyId } = membership;
	if (coreId !== '' && !draft.cores.some((c) => c.id === coreId)) {
		return { ok: false, reason: t.coreMissing(coreId) };
	}
	if (parentFamilyId === null) return { ok: true }; // directly under the Core — valid
	const family = draft.families.find((f: Family) => f.id === parentFamilyId);
	if (!family) return { ok: false, reason: t.familyMissing(parentFamilyId) };
	if (coreId !== '' && family.coreId !== coreId) {
		return { ok: false, reason: t.familyOtherCore(parentFamilyId) };
	}
	return { ok: true };
}

/**
 * Structural-integrity check for a Step 04 draft — the visibility half of the
 * save contract that `computeFeaturesCoherence` (scoring) deliberately skips.
 *
 * The anti-corruption parse layer coerces shapes but cannot invent the target
 * of a broken reference, so these dangling links survive a "clean" save and
 * would otherwise only show up as a node missing from the board. Each is
 * reported as a non-blocking {@link DraftWarning}; the draft still persists.
 *
 * Covers: a `coreId`/`parentFamilyId` pointing at a node that doesn't exist,
 * and an MVP/roadmap assignment pointing at a feature (or release) that doesn't.
 */
export function collectFeaturesWarnings(draft: ProjectFeaturesDraft, lang: SpecLanguage = 'en'): DraftWarning[] {
	const t = TEXTS[lang];
	const warnings: DraftWarning[] = [];
	const coreIds = new Set(draft.cores.map((c) => c.id));
	const familyIds = new Set(draft.families.map((f) => f.id));
	const featureIds = new Set(draft.features.map((f) => f.id));
	const releaseIds = new Set(draft.releases.map((r) => r.id));

	const label = (name: string, id: string) => (name.trim().length > 0 ? t.q(name) : `#${id}`);

	// Dangling tree links. Empty coreId / null parentFamilyId mean "unassigned"
	// (a legitimate in-progress state), so only a *non-empty* id that fails to
	// resolve is a dangling reference.
	for (const node of [...draft.families, ...draft.features]) {
		if (node.coreId !== '' && !coreIds.has(node.coreId)) {
			warnings.push({
				code: 'dangling-core-ref',
				ref: node.id,
				message: t.danglingCore(label(node.name, node.id), node.coreId)
			});
		}
		if (node.parentFamilyId !== null && !familyIds.has(node.parentFamilyId)) {
			warnings.push({
				code: 'dangling-family-ref',
				ref: node.id,
				message: t.danglingFamily(label(node.name, node.id), node.parentFamilyId)
			});
		} else if (node.parentFamilyId !== null && node.coreId !== '') {
			// The family exists — but does it belong to the same Core? A feature/family
			// nested under a family from another Core is an inconsistent membership that
			// derives the wrong kernel tags (see MR 6).
			const family = draft.families.find((f) => f.id === node.parentFamilyId);
			if (family && family.coreId !== '' && family.coreId !== node.coreId) {
				warnings.push({
					code: 'family-core-mismatch',
					ref: node.id,
					message: t.familyMismatch(label(node.name, node.id), family.name || node.parentFamilyId)
				});
			}
		}
	}

	// Orphaned assignments — a tier/release pinned to a feature that's gone.
	for (const m of draft.mvpAssignments) {
		if (!featureIds.has(m.featureId)) {
			warnings.push({
				code: 'orphaned-mvp-assignment',
				ref: m.featureId,
				message: t.orphanedMvp(m.featureId)
			});
		}
	}
	for (const r of draft.roadmapAssignments) {
		if (!featureIds.has(r.featureId)) {
			warnings.push({
				code: 'orphaned-roadmap-assignment',
				ref: r.featureId,
				message: t.orphanedRoadmap(r.featureId)
			});
		} else if (!releaseIds.has(r.releaseId)) {
			warnings.push({
				code: 'orphaned-roadmap-assignment',
				ref: r.releaseId,
				message: t.orphanedRelease(r.releaseId)
			});
		}
	}

	// Global uniqueness: a feature id is the on-disk kernel folder key, so a
	// duplicate silently merges two different features. Surface it (the import
	// preflight in `dedup.ts` is what actually rewrites them).
	for (const id of detectDuplicateFeatureIds(draft)) {
		warnings.push({
			code: 'duplicate-feature-id',
			ref: id,
			message: t.duplicateId(id)
		});
	}

	return warnings;
}
