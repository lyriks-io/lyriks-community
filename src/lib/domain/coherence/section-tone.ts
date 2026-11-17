import type { CoherenceTone } from '$domain/shared';
import type { SpecLanguage } from '$domain/language';

/**
 * The tone of a section's local-coherence score and its label, in the spec's
 * language. Every section scores on the same bands (below 34 critical, below
 * 67 at risk, strong above), so they share this one reading.
 */
const LABELS: Readonly<Record<SpecLanguage, Readonly<Record<CoherenceTone, string>>>> = {
	en: { critical: 'Critical', 'at-risk': 'At risk', strong: 'Strong' },
	fr: { critical: 'Critique', 'at-risk': 'À risque', strong: 'Solide' }
};

export function sectionTone(
	score: number,
	lang: SpecLanguage = 'en'
): { tone: CoherenceTone; label: string } {
	const tone: CoherenceTone = score < 34 ? 'critical' : score < 67 ? 'at-risk' : 'strong';
	return { tone, label: LABELS[lang][tone] };
}

/** "3 roles" / "3 rôles": the count a sentence says, singular up to one in French, only at one in English. */
export function countOf(lang: SpecLanguage, n: number, singular: string, plural: string): string {
	const one = lang === 'fr' ? n <= 1 : n === 1;
	return `${n} ${one ? singular : plural}`;
}
