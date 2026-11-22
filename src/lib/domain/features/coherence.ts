import type { CoherenceIssue, CoherenceResult } from '$domain/shared';
import type { SpecLanguage } from '$domain/language';
import { sectionTone } from '$domain/coherence/section-tone';
import { leafFeatures } from './tree';
import type { ProjectFeaturesDraft } from './draft';

/**
 * Local-coherence for Step 04: the shape of the tree. At least one Core
 * (15 points), at least one leaf Feature (15 points), every leaf named (20
 * points, proportional). The checks weigh 50 points; the score is that share
 * of 100, clamped to [0, 100], same convention as Steps 01-03. The MVP cut and
 * the roadmap coverage it once scored left the product.
 */
const MAX_POINTS = 50;

export function computeFeaturesCoherence(
	draft: ProjectFeaturesDraft,
	lang: SpecLanguage = 'en'
): CoherenceResult {
	const fr = lang === 'fr';
	const issues: CoherenceIssue[] = [];
	let score = 0;

	// 1. Tree exists: 30 points.
	if (draft.cores.length === 0) {
		issues.push({ code: 'no-core', message: fr ? "Aucun domaine (Core) n'est encore rédigé." : 'No Core authored yet.' });
	} else {
		score += 15;
	}
	const leaves = leafFeatures(draft);
	if (leaves.length === 0) {
		issues.push({ code: 'no-feature', message: fr ? "Aucune fonctionnalité feuille n'est encore rédigée." : 'No leaf Feature authored yet.' });
	} else {
		score += 15;
	}

	// 2. Named leaves: 20 points (proportional).
	if (leaves.length > 0) {
		const named = leaves.filter((f) => f.name.trim().length > 0).length;
		score += Math.round(20 * (named / leaves.length));
		if (named < leaves.length) {
			issues.push({
				code: 'unnamed-feature',
				message: fr
					? `${leaves.length - named} fonctionnalité(s) sans nom.`
					: `${leaves.length - named} Feature(s) without a name.`
			});
		}
	}

	const clamped = Math.max(0, Math.min(100, Math.round((score * 100) / MAX_POINTS)));
	const { tone, label } = sectionTone(clamped, lang);
	return { score: clamped, tone, label, issues };
}
