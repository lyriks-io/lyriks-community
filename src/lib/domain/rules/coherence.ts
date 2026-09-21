import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import { SETTLED_STATUSES } from './enums';
import { openCriticalContradictions } from './can-advance';
import type { ProjectRulesDraft } from './draft';

/**
 * Local-coherence for Step 06. Four concerns:
 *   1. There is something to be coherent about ....................... 10 pts
 *   2. No open critical contradiction ............................... 30 pts
 *   3. Issues triaged to a settled status (proportional) ............ 30 pts
 *   4. Gaps covered by an edge-case scenario (proportional) ......... 30 pts
 *
 * Concerns 2-4 are credit for reviewed rules, so they are only awarded once the
 * section holds something: an empty section scores 0, never the "nothing is
 * broken yet" credit an untouched draft would otherwise collect (that read as a
 * half-finished project the moment it was created).
 *
 * "Something" is the consolidated inventory OR what the author wrote here. The
 * inventory is a READ-ONLY mirror, recomputed on every load from the Foundation
 * commitments, the Users grants and the Experience journeys: an author cannot
 * fill it, so its emptiness must not be what zeroes a section they did author.
 * It is still reported, since an empty mirror says something true about the
 * sections upstream.
 *
 * Score clamped to [0, 100], same convention as Steps 01-05.
 */

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

/** Issue kinds that a Given/When/Then scenario is expected to cover. */
const GAP_KINDS = ['missing_rule', 'unhandled_edge'] as const;

export function computeRulesCoherence(draft: ProjectRulesDraft): CoherenceResult {
	const issues: CoherenceIssue[] = [];
	let score = 0;

	// 1. Something to be coherent about. Nothing at all (no mirrored rule, no
	// authored issue, no edge case) means the section scores 0 outright.
	const authoredHere = draft.issues.length > 0 || draft.scenarios.length > 0;
	if (draft.inventory.length === 0) {
		issues.push({
			code: 'empty-inventory',
			// No instruction to act on this section: the mirror fills itself when
			// rules are declared upstream, which is where this sends the reader.
			message:
				'No rule reaches this inventory. It mirrors what Foundation declares (SLAs, authentication, retention), the grants in Users & Permissions and the Experience journeys, and it is recomputed on every load: declare them there. Contradictions and edge cases are authored here.'
		});
		if (!authoredHere) {
			const { tone, label } = toneFor(0);
			return { score: 0, tone, label, issues };
		}
	}
	score += 10;

	// 2. No open critical contradiction — 30 pts.
	const openCritical = openCriticalContradictions(draft);
	if (openCritical.length > 0) {
		issues.push({
			code: 'open-critical-contradiction',
			message: `${openCritical.length} critical contradiction(s) still open.`
		});
	} else {
		score += 30;
	}

	// 3. Issue triage — 30 pts (proportional). No issues ⇒ half credit (lightly reviewed).
	if (draft.issues.length > 0) {
		const settled = draft.issues.filter((i) => SETTLED_STATUSES.includes(i.status)).length;
		score += Math.round(30 * (settled / draft.issues.length));
		if (settled < draft.issues.length) {
			issues.push({
				code: 'open-issues',
				message: `${draft.issues.length - settled} issue(s) still open.`
			});
		}
	} else {
		score += 15;
	}

	// 4. Edge-case coverage of gaps — 30 pts (proportional).
	const gaps = draft.issues.filter(
		(i) => GAP_KINDS.includes(i.kind as (typeof GAP_KINDS)[number]) && !SETTLED_STATUSES.includes(i.status)
	);
	if (gaps.length > 0) {
		const coveredIssueIds = new Set(draft.scenarios.map((s) => s.relatedIssueId).filter(Boolean));
		const covered = gaps.filter((g) => coveredIssueIds.has(g.id)).length;
		score += Math.round(30 * (covered / gaps.length));
		if (covered < gaps.length) {
			issues.push({
				code: 'uncovered-gaps',
				message: `${gaps.length - covered} gap(s) without an edge-case scenario.`
			});
		}
	} else {
		score += draft.scenarios.length > 0 ? 30 : 15;
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
