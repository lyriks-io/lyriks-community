import type { DraftWarning } from '$domain/shared';
import { detectDuplicateFeatureIds } from './dedup';
import type { Family, ProjectFeaturesDraft } from './draft';

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
	draft: Pick<ProjectFeaturesDraft, 'cores' | 'families'>
): { ok: true } | { ok: false; reason: string } {
	const { coreId, parentFamilyId } = membership;
	if (coreId !== '' && !draft.cores.some((c) => c.id === coreId)) {
		return { ok: false, reason: `Core "${coreId}" does not exist.` };
	}
	if (parentFamilyId === null) return { ok: true }; // directly under the Core — valid
	const family = draft.families.find((f: Family) => f.id === parentFamilyId);
	if (!family) return { ok: false, reason: `Family "${parentFamilyId}" does not exist.` };
	if (coreId !== '' && family.coreId !== coreId) {
		return { ok: false, reason: `Family "${parentFamilyId}" belongs to a different Core.` };
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
export function collectFeaturesWarnings(draft: ProjectFeaturesDraft): DraftWarning[] {
	const warnings: DraftWarning[] = [];
	const coreIds = new Set(draft.cores.map((c) => c.id));
	const familyIds = new Set(draft.families.map((f) => f.id));
	const featureIds = new Set(draft.features.map((f) => f.id));
	const releaseIds = new Set(draft.releases.map((r) => r.id));

	const label = (name: string, id: string) => (name.trim().length > 0 ? `"${name}"` : `#${id}`);

	// Dangling tree links. Empty coreId / null parentFamilyId mean "unassigned"
	// (a legitimate in-progress state), so only a *non-empty* id that fails to
	// resolve is a dangling reference.
	for (const node of [...draft.families, ...draft.features]) {
		if (node.coreId !== '' && !coreIds.has(node.coreId)) {
			warnings.push({
				code: 'dangling-core-ref',
				ref: node.id,
				message: `${label(node.name, node.id)} references Core "${node.coreId}", which no longer exists.`
			});
		}
		if (node.parentFamilyId !== null && !familyIds.has(node.parentFamilyId)) {
			warnings.push({
				code: 'dangling-family-ref',
				ref: node.id,
				message: `${label(node.name, node.id)} references parent Family "${node.parentFamilyId}", which no longer exists.`
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
					message: `${label(node.name, node.id)} is under Family "${family.name || node.parentFamilyId}", which belongs to a different Core.`
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
				message: `MVP assignment targets Feature "${m.featureId}", which no longer exists.`
			});
		}
	}
	for (const r of draft.roadmapAssignments) {
		if (!featureIds.has(r.featureId)) {
			warnings.push({
				code: 'orphaned-roadmap-assignment',
				ref: r.featureId,
				message: `Roadmap assignment targets Feature "${r.featureId}", which no longer exists.`
			});
		} else if (!releaseIds.has(r.releaseId)) {
			warnings.push({
				code: 'orphaned-roadmap-assignment',
				ref: r.releaseId,
				message: `Roadmap assignment places a Feature in Release "${r.releaseId}", which no longer exists.`
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
			message: `Feature id "${id}" is used by more than one feature; ids must be globally unique.`
		});
	}

	return warnings;
}
