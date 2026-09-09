import type { GlossaryTerm } from './draft';

/**
 * Pure text segmentation for the in-context Term Highlighting layer (mirror of
 * the "Term Highlighting" surface on feature `297051ca`). Given a display
 * string and the governed vocabulary, it splits the string into plain and
 * marked runs so any renderer can decorate the governed words with a hover
 * definition — framework-free, no DOM.
 */

/** How a matched word relates to the glossary. */
export type MarkKind = 'canonical' | 'allowed' | 'banned';

/** The resolved glossary entry behind a marked run. */
export interface Mark {
	termId: string;
	/** The canonical word to prefer for this concept. */
	canonical: string;
	definition: string;
	kind: MarkKind;
}

/** One run of the segmented text: plain when `mark` is absent. */
export interface Segment {
	text: string;
	mark?: Mark;
}

interface Variant {
	value: string;
	mark: Mark;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Flatten the vocabulary into matchable variants: the canonical term, each
 * allowed synonym and each banned synonym. Longer values win over shorter ones
 * and, on a tie, canonical beats banned beats allowed, so "Cart page" is marked
 * before "Cart" and a canonical term is preferred over a synonym.
 */
export function buildVariants(terms: GlossaryTerm[]): Variant[] {
	const rank: Record<MarkKind, number> = { canonical: 0, banned: 1, allowed: 2 };
	const variants: Variant[] = [];
	for (const t of terms) {
		const canonical = t.term.trim();
		if (!canonical) continue;
		const mark = (kind: MarkKind): Mark => ({
			termId: t.id,
			canonical,
			definition: t.definition,
			kind
		});
		variants.push({ value: canonical, mark: mark('canonical') });
		for (const s of t.synonymsAllowed) {
			const v = s.trim();
			if (v) variants.push({ value: v, mark: mark('allowed') });
		}
		for (const s of t.synonymsAvoid) {
			const v = s.trim();
			if (v) variants.push({ value: v, mark: mark('banned') });
		}
	}
	const seen = new Set<string>();
	return variants
		.sort((a, b) => rank[a.mark.kind] - rank[b.mark.kind] || b.value.length - a.value.length)
		.filter((v) => {
			const k = v.value.toLowerCase();
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		})
		.sort((a, b) => b.value.length - a.value.length);
}

/**
 * Split `text` into plain and marked segments. Matching is whole-word and
 * case-insensitive; the marked run keeps the text's original casing. Returns a
 * single plain segment when nothing matches, so callers can render uniformly.
 */
export function segmentText(text: string, terms: GlossaryTerm[]): Segment[] {
	if (!text) return [];
	const variants = buildVariants(terms);
	if (variants.length === 0) return [{ text }];

	const byValue = new Map<string, Mark>();
	for (const v of variants) byValue.set(v.value.toLowerCase(), v.mark);

	const body = variants.map((v) => escapeRe(v.value)).join('|');
	let re: RegExp;
	try {
		re = new RegExp(`(?<![\\p{L}])(${body})(?![\\p{L}])`, 'giu');
	} catch {
		re = new RegExp(`\\b(${body})\\b`, 'gi');
	}

	const out: Segment[] = [];
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		if (m.index > last) out.push({ text: text.slice(last, m.index) });
		const mark = byValue.get(m[0].toLowerCase());
		out.push(mark ? { text: m[0], mark } : { text: m[0] });
		last = m.index + m[0].length;
		if (m.index === re.lastIndex) re.lastIndex++;
	}
	if (last < text.length) out.push({ text: text.slice(last) });
	return out;
}

/** True when any governed word appears in the text (cheap pre-check for callers). */
export function hasGovernedWord(text: string, terms: GlossaryTerm[]): boolean {
	return segmentText(text, terms).some((s) => s.mark);
}

/**
 * Replace every whole-word, case-insensitive occurrence of `original` with
 * `canonical` — the write-back behind the glossary tooltip's "use the canonical
 * term" action. Whole-word matching mirrors `segmentText`, so fixing a banned
 * synonym never rewrites a larger word that merely contains it.
 */
export function replaceOccurrence(text: string, original: string, canonical: string): string {
	const value = original.trim();
	if (!value) return text;
	const body = escapeRe(value);
	let re: RegExp;
	try {
		re = new RegExp(`(?<![\\p{L}])(${body})(?![\\p{L}])`, 'giu');
	} catch {
		re = new RegExp(`\\b(${body})\\b`, 'gi');
	}
	// A function replacement treats `$&`, `$1`, `$\`` and `$'` in a user-authored
	// canonical term as literal text instead of String.replace expansion tokens.
	return text.replace(re, () => canonical);
}
