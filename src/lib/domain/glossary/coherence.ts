import type { CoherenceIssue, CoherenceResult } from '$domain/shared';
import type { SpecLanguage } from '$domain/language';
import { sectionTone } from '$domain/coherence/section-tone';
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

export function computeGlossaryCoherence(draft: ProjectGlossaryDraft, lang: SpecLanguage = 'en'): CoherenceResult {
	const fr = lang === 'fr';
	const issues: CoherenceIssue[] = [];
	const terms = draft.terms.filter((t) => t.term.trim());
	let score = 0;

	// 1. Vocabulary started — 10 pts.
	if (terms.length === 0) {
		issues.push({
			code: 'empty-glossary',
			message: fr
				? "Aucun terme n'est encore gouverné. Ajoutez le premier terme."
				: 'No terms governed yet. Add the first term.'
		});
		const { tone, label } = sectionTone(0, lang);
		return { score: 0, tone, label, issues };
	}
	score += 10;

	// 2. Definitions — 40 pts (proportional).
	const defined = terms.filter((t) => t.definition.trim()).length;
	score += Math.round(40 * (defined / terms.length));
	if (defined < terms.length) {
		issues.push({
			code: 'undefined-terms',
			message: fr
				? `${terms.length - defined} terme(s) sans définition.`
				: `${terms.length - defined} term(s) without a definition.`
		});
	}

	// 3. Approval — 30 pts (proportional).
	const approved = terms.filter((t) => t.status === 'approved').length;
	score += Math.round(30 * (approved / terms.length));
	if (approved < terms.length) {
		issues.push({
			code: 'unapproved-terms',
			message: fr
				? `${terms.length - approved} terme(s) encore en brouillon.`
				: `${terms.length - approved} term(s) still in draft.`
		});
	}

	// 4. Examples — 20 pts (proportional).
	const exampled = terms.filter((t) => t.example.trim()).length;
	score += Math.round(20 * (exampled / terms.length));

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = sectionTone(clamped, lang);
	return { score: clamped, tone, label, issues };
}
