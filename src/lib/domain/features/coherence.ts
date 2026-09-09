import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import { leafFeatures } from './tree';
import type { ProjectFeaturesDraft } from './draft';

/**
 * Local-coherence for Step 04. Three concerns:
 *   1. Tree shape — at least one Core, at least one leaf Feature.
 *   2. MVP cut — fraction of leaves with an assigned tier.
 *   3. Roadmap coverage — fraction of "Must" leaves placed in a release.
 *
 * Score clamped to [0, 100], same convention as Steps 01-03.
 */

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeFeaturesCoherence(draft: ProjectFeaturesDraft): CoherenceResult {
	const issues: CoherenceIssue[] = [];
	let score = 0;

	// 1. Tree exists — 30 pts.
	if (draft.cores.length === 0) {
		issues.push({ code: 'no-core', message: 'No Core authored yet.' });
	} else {
		score += 15;
	}
	const leaves = leafFeatures(draft);
	if (leaves.length === 0) {
		issues.push({ code: 'no-feature', message: 'No leaf Feature authored yet.' });
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
				message: `${leaves.length - named} Feature(s) without a name.`
			});
		}
	}

	// 3. MVP coverage — 30 pts.
	if (leaves.length > 0) {
		const tieredIds = new Set(draft.mvpAssignments.map((m) => m.featureId));
		const tieredLeaves = leaves.filter((f) => tieredIds.has(f.id)).length;
		score += Math.round(30 * (tieredLeaves / leaves.length));
		if (tieredLeaves < leaves.length) {
			issues.push({
				code: 'untiered-features',
				message: `${leaves.length - tieredLeaves} Feature(s) without an MVP tier.`
			});
		}
	}

	// 4. Roadmap coverage of MUST tier — 20 pts.
	const mustIds = new Set(
		draft.mvpAssignments.filter((m) => m.tier === 'must').map((m) => m.featureId)
	);
	if (mustIds.size > 0) {
		const placed = new Set(
			draft.roadmapAssignments.filter((r) => mustIds.has(r.featureId)).map((r) => r.featureId)
		);
		score += Math.round(20 * (placed.size / mustIds.size));
		if (placed.size < mustIds.size) {
			issues.push({
				code: 'must-without-release',
				message: `${mustIds.size - placed.size} Must-tier Feature(s) not placed in a release.`
			});
		}
	} else if (leaves.length > 0) {
		// No Musts to anchor the roadmap; gentle nudge, no penalty.
		issues.push({
			code: 'no-must',
			message: 'No Feature is tagged Must, so Experience will lack an MVP cut.'
		});
		score += 5;
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
