import type { CoherenceIssue, CoherenceResult } from '$domain/shared';
import { NBSP, type SpecLanguage } from '$domain/language';
import { sectionTone } from '$domain/coherence/section-tone';
import { leafFeatures } from './tree';
import type { ProjectFeaturesDraft } from './draft';

/**
 * Local-coherence for Step 04. Three concerns:
 *   1. Tree shape — at least one Core, at least one leaf Feature.
 *   2. MVP cut — fraction of leaves with an assigned tier.
 *   3. Roadmap coverage — fraction of "Must" leaves placed in a release.
 *
 * A leaf already delivered (`leafMeta.status` done, as a retrospecification of
 * an existing product writes every feature it reads) needs neither a priority
 * nor a release: both plan what is still to build, so it counts as covered.
 *
 * Score clamped to [0, 100], same convention as Steps 01-03.
 */

export function computeFeaturesCoherence(
	draft: ProjectFeaturesDraft,
	lang: SpecLanguage = 'en'
): CoherenceResult {
	const fr = lang === 'fr';
	const issues: CoherenceIssue[] = [];
	let score = 0;

	// 1. Tree exists — 30 pts.
	if (draft.cores.length === 0) {
		issues.push({ code: 'no-core', message: fr ? "Aucun domaine (Core) n'est encore rédigé." : 'No Core authored yet.' });
	} else {
		score += 15;
	}
	const leaves = leafFeatures(draft);
	const delivered = new Set(leaves.filter((f) => draft.leafMeta?.[f.id]?.status === 'done').map((f) => f.id));
	if (leaves.length === 0) {
		issues.push({ code: 'no-feature', message: fr ? "Aucune fonctionnalité feuille n'est encore rédigée." : 'No leaf Feature authored yet.' });
	} else {
		score += 15;
	}

	// 2. Named leaves — 20 pts (proportional).
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

	// 3. MVP coverage — 30 pts.
	if (leaves.length > 0) {
		const tieredIds = new Set(draft.mvpAssignments.map((m) => m.featureId));
		const tieredLeaves = leaves.filter((f) => tieredIds.has(f.id) || delivered.has(f.id)).length;
		score += Math.round(30 * (tieredLeaves / leaves.length));
		if (tieredLeaves < leaves.length) {
			issues.push({
				code: 'untiered-features',
				message: fr
					? `${leaves.length - tieredLeaves} fonctionnalité(s) sans priorité.`
					: `${leaves.length - tieredLeaves} Feature(s) without a priority.`
			});
		}
	}

	// 4. Roadmap coverage of MUST tier — 20 pts.
	const mustIds = new Set(
		draft.mvpAssignments.filter((m) => m.tier === 'must' && !delivered.has(m.featureId)).map((m) => m.featureId)
	);
	if (leaves.length > 0 && delivered.size === leaves.length) {
		// Everything is already built: no MVP cut and no release are left to plan.
		score += 20;
	} else if (mustIds.size > 0) {
		const placed = new Set(
			draft.roadmapAssignments.filter((r) => mustIds.has(r.featureId)).map((r) => r.featureId)
		);
		score += Math.round(20 * (placed.size / mustIds.size));
		if (placed.size < mustIds.size) {
			issues.push({
				code: 'must-without-release',
				message: fr
					? `${mustIds.size - placed.size} fonctionnalité(s) du palier Must placée(s) dans aucune version.`
					: `${mustIds.size - placed.size} Must-tier Feature(s) not placed in a release.`
			});
		}
	} else if (leaves.length > 0) {
		// No Musts to anchor the roadmap; gentle nudge, no penalty.
		issues.push({
			code: 'no-must',
			message: fr
				? `Aucune fonctionnalité n'est au palier Must${NBSP}: l'Expérience n'aura pas de périmètre MVP.`
				: 'No Feature is tagged Must, so Experience will lack an MVP cut.'
		});
		score += 5;
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = sectionTone(clamped, lang);
	return { score: clamped, tone, label, issues };
}
