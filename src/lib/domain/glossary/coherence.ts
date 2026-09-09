import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import type { ProjectGlossaryDraft } from './draft';

/**
 * Local-coherence for the Glossary capability. Four concerns, draft-only so the
 * client can recompute it live without the upstream corpus:
 *   1. The vocabulary was actually started (≥1 term) .............. 10 pts
 *   2. Terms carry a definition (proportional) ................... 40 pts
 *   3. Terms are approved, locking the language (proportional) ... 30 pts
 *   4. Terms show an example sentence (proportional) ............. 20 pts
 *
 * Score clamped to [0, 100], same convention as the sibling capabilities.
 */

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeGlossaryCoherence(draft: ProjectGlossaryDraft): CoherenceResult {
	const issues: CoherenceIssue[] = [];
	const terms = draft.terms.filter((t) => t.term.trim());
	let score = 0;

	// 1. Vocabulary started — 10 pts.
	if (terms.length === 0) {
		issues.push({ code: 'empty-glossary', message: 'No terms governed yet. Add the first term.' });
		const { tone, label } = toneFor(0);
		return { score: 0, tone, label, issues };
	}
	score += 10;

	// 2. Definitions — 40 pts (proportional).
	const defined = terms.filter((t) => t.definition.trim()).length;
	score += Math.round(40 * (defined / terms.length));
	if (defined < terms.length) {
		issues.push({
			code: 'undefined-terms',
			message: `${terms.length - defined} term(s) without a definition.`
		});
	}

	// 3. Approval — 30 pts (proportional).
	const approved = terms.filter((t) => t.status === 'approved').length;
	score += Math.round(30 * (approved / terms.length));
	if (approved < terms.length) {
		issues.push({
			code: 'unapproved-terms',
			message: `${terms.length - approved} term(s) still in draft.`
		});
	}

	// 4. Examples — 20 pts (proportional).
	const exampled = terms.filter((t) => t.example.trim()).length;
	score += Math.round(20 * (exampled / terms.length));

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
