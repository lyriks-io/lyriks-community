import type { CoherenceIssue, CoherenceResult } from '$domain/shared';
import type { SpecLanguage } from '$domain/language';
import { sectionTone } from '$domain/coherence/section-tone';
import { ARCH_LAYERS } from './enums';
import { architectureStage, layersWithTech, type ProjectArchitectureDraft } from './draft';

/**
 * Local-coherence for Step 08. Five concerns — the "every tech decision is
 * attached to an official reference" promise, made measurable:
 *   1. At least one tech choice ................................... 15 pts
 *   2. Layer coverage (how many of the 5 layers have a tech) ...... 20 pts
 *   3. Every tech attached to a reference doc (proportional) ...... 35 pts
 *   4. At least one reference doc ................................. 15 pts
 *   5. At least one non-negotiable constraint .................... 15 pts
 *
 * Score clamped to [0, 100], same convention as Steps 01-07.
 */

export function computeArchitectureCoherence(
	draft: ProjectArchitectureDraft,
	lang: SpecLanguage = 'en'
): CoherenceResult {
	if (architectureStage(draft) === 'logical') return logicalCoherence(draft, lang);
	const fr = lang === 'fr';
	const issues: CoherenceIssue[] = [];
	let score = 0;

	const tech = draft.techChoices;

	// 1. At least one tech — 15 pts.
	if (tech.length === 0) {
		issues.push({ code: 'no-tech', message: fr ? 'Aucun choix technique pour le moment.' : 'No tech choice yet.' });
	} else {
		score += 15;
	}

	// 2. Layer coverage — 20 pts (proportional over the 5 layers).
	if (tech.length > 0) {
		const covered = layersWithTech(draft).size;
		score += Math.round(20 * (covered / ARCH_LAYERS.length));
		if (covered < ARCH_LAYERS.length) {
			issues.push({
				code: 'thin-layers',
				message: fr
					? `${ARCH_LAYERS.length - covered} couche(s) sans technologie pour le moment.`
					: `${ARCH_LAYERS.length - covered} layer(s) have no tech yet.`
			});
		}
	}

	// 3. Every tech attached to a reference doc — 35 pts (proportional). THE promise.
	if (tech.length > 0) {
		const referenced = tech.filter((t) => t.referenceDocId).length;
		score += Math.round(35 * (referenced / tech.length));
		if (referenced < tech.length) {
			issues.push({
				code: 'unreferenced-tech',
				message: fr
					? `${tech.length - referenced} choix technique(s) sans document de référence officiel.`
					: `${tech.length - referenced} tech choice(s) without an official reference doc.`
			});
		}
	}

	// 4. At least one cited source — 15 pts. Evidence lives in the project
	// Documents & Sources register; this section only cites it.
	if (draft.sourceIds.length > 0) {
		score += 15;
	} else if (tech.length > 0) {
		issues.push({ code: 'no-doc', message: fr ? "Aucune source n'est citée pour la pile technique." : 'No source cited for the stack.' });
	}

	// 5. At least one non-negotiable constraint — 15 pts.
	if (draft.constraints.length > 0) {
		score += 15;
	} else {
		issues.push({
			code: 'no-constraint',
			message: fr ? "Aucune contrainte non négociable n'est déclarée." : 'No non-negotiable constraint declared.'
		});
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = sectionTone(clamped, lang);
	return { score: clamped, tone, label, issues };
}

/** Logical design is not penalized for undecided technologies or unused layers. */
function logicalCoherence(draft: ProjectArchitectureDraft, lang: SpecLanguage): CoherenceResult {
	const fr = lang === 'fr';
	const issues: CoherenceIssue[] = [];
	const checks = [
		{ ok: draft.techChoices.length > 0, points: 25, code: 'no-component',
			message: fr ? 'Aucun composant logique pour le moment.' : 'No logical component yet.' },
		{ ok: draft.techChoices.length > 0 && draft.techChoices.every((c) => c.name.trim() && c.role.trim()),
			points: 40, code: 'missing-responsibility',
			message: fr ? 'Donnez à chaque composant un nom et une responsabilité.' : 'Give every component a name and a responsibility.' },
		{ ok: draft.sourceIds.length > 0, points: 15, code: 'no-doc',
			message: fr ? 'Citez les exigences qui fondent cette conception.' : 'Cite the requirements behind this design.' },
		{ ok: draft.constraints.length > 0, points: 20, code: 'no-constraint',
			message: fr ? 'Consignez les contraintes qui fondent cette conception.' : 'Record the constraints behind this design.' }
	];
	let score = 0;
	for (const check of checks) {
		if (check.ok) score += check.points;
		else issues.push({ code: check.code, message: check.message });
	}
	return { score, ...sectionTone(score, lang), issues };
}
