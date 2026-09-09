import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import type { ProjectSupervisionDraft } from './draft';

/**
 * Local-coherence for the Supervision capability. Draft-only so the client can
 * recompute it live:
 *   1. The board was started (≥1 assignment) .................... 15 pts
 *   2. Every scope has an owner (proportional) ................. 25 pts
 *   3. Work is progressing (done proportion) .................. 20 pts
 *   4. AI policy is clean (compliant proportion) .............. 25 pts
 *   5. At least one decision logged for traceability ......... 15 pts
 *
 * Score clamped to [0, 100], same convention as the sibling capabilities.
 */

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeSupervisionCoherence(draft: ProjectSupervisionDraft): CoherenceResult {
	const issues: CoherenceIssue[] = [];
	const { assignments, policyRules, decisions } = draft;
	let score = 0;

	// 1. Board started — 15 pts.
	if (assignments.length === 0) {
		issues.push({ code: 'no-assignments', message: 'No scopes assigned yet. Start the board.' });
		const { tone, label } = toneFor(0);
		return { score: 0, tone, label, issues };
	}
	score += 15;

	// 2. Ownership — 25 pts (proportional).
	const owned = assignments.filter((a) => a.assignee.trim()).length;
	score += Math.round(25 * (owned / assignments.length));
	if (owned < assignments.length) {
		issues.push({
			code: 'unassigned-scopes',
			message: `${assignments.length - owned} scope(s) without an owner.`
		});
	}

	// 3. Progress — 20 pts (done proportion).
	const done = assignments.filter((a) => a.status === 'done').length;
	score += Math.round(20 * (done / assignments.length));

	// 4. AI policy cleanliness — 25 pts (compliant proportion; full credit if no rules yet).
	if (policyRules.length > 0) {
		const compliant = policyRules.filter((r) => r.status === 'ok').length;
		score += Math.round(25 * (compliant / policyRules.length));
		const violations = policyRules.filter((r) => r.status === 'violation').length;
		if (violations > 0) {
			issues.push({
				code: 'policy-violations',
				message: `${violations} AI policy violation(s) unresolved.`
			});
		}
	} else {
		score += 25;
	}

	// 5. Traceability — 15 pts.
	if (decisions.length > 0) {
		score += 15;
	} else {
		issues.push({ code: 'no-decisions', message: 'No decisions logged for traceability.' });
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
