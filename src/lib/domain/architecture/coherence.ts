import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import { ARCH_LAYERS } from './enums';
import { layersWithTech, type ProjectArchitectureDraft } from './draft';

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

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeArchitectureCoherence(draft: ProjectArchitectureDraft): CoherenceResult {
	const issues: CoherenceIssue[] = [];
	let score = 0;

	const tech = draft.techChoices;

	// 1. At least one tech — 15 pts.
	if (tech.length === 0) {
		issues.push({ code: 'no-tech', message: 'No tech choice yet.' });
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
				message: `${ARCH_LAYERS.length - covered} layer(s) have no tech yet.`
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
				message: `${tech.length - referenced} tech choice(s) without an official reference doc.`
			});
		}
	}

	// 4. At least one cited source — 15 pts. Evidence lives in the project
	// Documents & Sources register; this section only cites it.
	if (draft.sourceIds.length > 0) {
		score += 15;
	} else if (tech.length > 0) {
		issues.push({ code: 'no-doc', message: 'No source cited for the stack.' });
	}

	// 5. At least one non-negotiable constraint — 15 pts.
	if (draft.constraints.length > 0) {
		score += 15;
	} else {
		issues.push({ code: 'no-constraint', message: 'No non-negotiable constraint declared.' });
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
