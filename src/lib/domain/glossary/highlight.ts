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

/** What may separate the words of a term in running text: spaces, a line break, a non-breaking space, a hyphen. */
const WORD_GAP = '(?:[\\s\\u00A0]+|[\\s\\u00A0]*-[\\s\\u00A0]*)';
/** A plural or a third person (English -s/-es, French -s/-x), on a word long enough to take one. */
const INFLECTION = '(?:es|s|x)?';

/**
 * The pattern a term's value is read with (ac-glos-match-forms): its words in
 * order, whatever separates them, each in its plain form or, when `inflect`,
 * with a plural or third-person ending. No capturing group, so callers can
 * wrap it in their own.
 */
function phrasePattern(value: string, inflect: boolean): string {
	return value
		.trim()
		.split(/[\s -]+/)
		.filter(Boolean)
		.map((word) => escapeRe(word) + (inflect && word.length >= 3 ? INFLECTION : ''))
		.join(WORD_GAP);
}

/**
 * Whole-word, case-insensitive: a letter, a digit or an underscore on either
 * side means the match sits inside a longer word or an identifier
 * (DEFAULT_DOMAIN_ALIASES), never a glossary word; `\b` where the engine lacks
 * Unicode classes.
 */
function wholeWords(body: string): RegExp {
	try {
		return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`, 'giu');
	} catch {
		return new RegExp(`\\b(?:${body})\\b`, 'gi');
	}
}

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

	// One group per variant, longest first, so the group that matched names its mark.
	const re = wholeWords(variants.map((v) => `(${phrasePattern(v.value, true)})`).join('|'));

	const out: Segment[] = [];
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		if (m.index > last) out.push({ text: text.slice(last, m.index) });
		const group = m.findIndex((g, i) => i > 0 && g !== undefined);
		const mark = group > 0 ? variants[group - 1].mark : undefined;
		out.push(mark ? { text: m[0], mark } : { text: m[0] });
		last = m.index + m[0].length;
		if (m.index === re.lastIndex) re.lastIndex++;
	}
	if (last < text.length) out.push({ text: text.slice(last) });
	return out;
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
	// The words the mark covered, whatever separates them where they recur.
	const re = wholeWords(phrasePattern(value, false));
	// A function replacement treats `$&`, `$1`, `$\`` and `$'` in a user-authored
	// canonical term as literal text instead of String.replace expansion tokens.
	return text.replace(re, () => canonical);
}
