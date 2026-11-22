import type { DraftWarning } from '$domain/shared';
import { detectDuplicateFeatureIds } from './dedup';
import type { ProjectFeaturesDraft } from './draft';
import { quoteName, type SpecLanguage } from '$domain/language';

/** The warnings in the spec's language; codes never change, names and ids are quoted as they are. */
const TEXTS = {
	en: {
		q: (name: string) => `"${name}"`,
		danglingCore: (node: string, core: string) => `${node} references Core "${core}", which no longer exists.`,
		danglingFamily: (node: string, family: string) =>
			`${node} references parent Family "${family}", which no longer exists.`,
		familyMismatch: (node: string, family: string) =>
			`${node} is under Family "${family}", which belongs to a different Core.`,
		duplicateId: (id: string) => `Feature id "${id}" is used by more than one feature; ids must be globally unique.`
	},
	fr: {
		q: (name: string) => quoteName('fr', name),
		danglingCore: (node: string, core: string) =>
			`${node} fait référence au domaine ${quoteName('fr', core)}, qui n'existe plus.`,
		danglingFamily: (node: string, family: string) =>
			`${node} fait référence à la famille parente ${quoteName('fr', family)}, qui n'existe plus.`,
		familyMismatch: (node: string, family: string) =>
			`${node} est rangé sous la famille ${quoteName('fr', family)}, qui appartient à un autre domaine.`,
		duplicateId: (id: string) =>
			`L'id de fonctionnalité ${quoteName('fr', id)} est utilisé par plusieurs fonctionnalités${'\u00a0'}; un id doit être unique dans tout le projet.`
	}
} as const;

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
 * and a feature id several features share.
 */
export function collectFeaturesWarnings(draft: ProjectFeaturesDraft, lang: SpecLanguage = 'en'): DraftWarning[] {
	const t = TEXTS[lang];
	const warnings: DraftWarning[] = [];
	const coreIds = new Set(draft.cores.map((c) => c.id));
	const familyIds = new Set(draft.families.map((f) => f.id));

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
