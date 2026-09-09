import type { CandidateIssue } from '$domain/rules';
import type { BehaviorAdvisory } from './ports';
import type { IssueSeverity } from '$domain/rules';

/** Gap severity → issue severity: engine hard failures block, gaps are major. */
const SEVERITY: Record<string, IssueSeverity> = {
	high: 'critical',
	medium: 'major',
	low: 'minor'
};

/** Don't let one thin feature flood the board — the engine repeats gap kinds. */
const MAX_GAPS_PER_FEATURE = 3;

const ENGINE_TAG = 'Flagged by the behavior engine.';

/**
 * Fold the behavior engine's advisories (unspa verify: invariant violations,
 * failing scenarios, critical spec gaps) into Issues-board candidates, so the
 * automatic scan feeds ONE triage inbox instead of a second, disagreeing conflict
 * surface. A verify failure means the declared behavior contradicts its own
 * invariants/scenarios (→ contradiction). Spec gaps become one issue PER GAP,
 * titled with the engine's actual reason — a card reading "Behavior gaps —
 * <feature>" tells the team nothing to decide, so it never ships. The `capped`
 * coverage notice is advisory noise here.
 */
export function advisoriesToCandidateIssues(advisories: BehaviorAdvisory[]): CandidateIssue[] {
	const out: CandidateIssue[] = [];
	for (const a of advisories) {
		if (a.code === 'verify') {
			out.push({
				key: `engine:verify:${a.featureId ?? a.title}`,
				kind: 'contradiction',
				title: a.title,
				detail: `${a.detail} · ${ENGINE_TAG}`,
				severity: SEVERITY[a.severity] ?? 'minor',
				relatedRuleIds: []
			});
			continue;
		}
		if (a.code !== 'specgap') continue;
		const name = a.featureName ?? a.featureId ?? 'behavior';
		const gaps = (a.gaps ?? []).slice(0, MAX_GAPS_PER_FEATURE);
		for (const [i, g] of gaps.entries()) {
			const where = g.entityName && g.entityName !== name ? ` (${g.entityName})` : '';
			out.push({
				key: `engine:specgap:${a.featureId ?? name}:${i}`,
				kind: 'missing_rule',
				title: `${name}: ${g.reason}${where}`,
				detail: [g.suggestedFix, ENGINE_TAG].filter(Boolean).join(' · '),
				severity: SEVERITY[a.severity] ?? 'minor',
				relatedRuleIds: []
			});
		}
		if ((a.gaps?.length ?? 0) > gaps.length) {
			out.push({
				key: `engine:specgap:${a.featureId ?? name}:more`,
				kind: 'missing_rule',
				title: `${name}: ${a.gaps!.length - gaps.length} more critical spec gap(s)`,
				detail: `Resolve the listed gaps first; the next scan surfaces the rest. · ${ENGINE_TAG}`,
				severity: SEVERITY[a.severity] ?? 'minor',
				relatedRuleIds: []
			});
		}
	}
	return out;
}
