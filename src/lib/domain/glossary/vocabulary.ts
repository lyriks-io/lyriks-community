import type { GlossarySuggestion, GlossaryTerm } from './draft';

/**
 * Pure vocabulary analysis for the Glossary capability: how often a governed
 * term is used across the project corpus, the rolled-up glossary health, and
 * candidate terms mined from the brief. Framework-free — the corpus text is
 * assembled at the edge (page loader) and passed in.
 */

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build a whole-word, case-insensitive matcher for a set of words. */
function wordMatcher(words: string[]): RegExp | null {
	const cleaned = words.map((w) => w.trim()).filter(Boolean);
	if (cleaned.length === 0) return null;
	const body = cleaned.map(escapeRe).join('|');
	try {
		return new RegExp(`(?<![\\p{L}])(${body})(?![\\p{L}])`, 'giu');
	} catch {
		return new RegExp(`\\b(${body})\\b`, 'gi');
	}
}

/** How many times a term (or one of its allowed synonyms) appears in the corpus. */
export function countTermUsages(term: GlossaryTerm, corpus: string): number {
	if (!corpus) return 0;
	const re = wordMatcher([term.term, ...term.synonymsAllowed]);
	if (!re) return 0;
	return (corpus.match(re) ?? []).length;
}

export interface GlossaryHealth {
	total: number;
	defined: number;
	definedPct: number;
	used: number;
	usedPct: number;
	approved: number;
	approvedPct: number;
	bannedInUse: number;
	score: number;
}

/**
 * Glossary health: how much of the vocabulary is defined, actually used in the
 * specs, approved, and clean of banned words leaking into the corpus. The score
 * weights coverage (defined 50%, used 30%) and cleanliness (20%).
 */
export function computeGlossaryHealth(terms: GlossaryTerm[], corpus: string): GlossaryHealth {
	const named = terms.filter((t) => t.term.trim());
	const total = named.length;
	const pct = (a: number): number => (total ? Math.round((a / total) * 100) : 0);

	const defined = named.filter((t) => t.definition.trim()).length;
	const approved = named.filter((t) => t.status === 'approved').length;
	const used = named.filter((t) => countTermUsages(t, corpus) > 0).length;

	const banned = new Set<string>();
	for (const t of named) {
		for (const b of t.synonymsAvoid) {
			const re = wordMatcher([b]);
			if (re && re.test(corpus)) banned.add(b.toLowerCase());
		}
	}
	const bannedInUse = banned.size;
	const cleanliness = bannedInUse === 0 ? 100 : Math.max(0, 100 - bannedInUse * 25);
	const score =
		total === 0 ? 0 : Math.round(pct(defined) * 0.5 + pct(used) * 0.3 + cleanliness * 0.2);

	return {
		total,
		defined,
		definedPct: pct(defined),
		used,
		usedPct: pct(used),
		approved,
		approvedPct: pct(approved),
		bannedInUse,
		score
	};
}

// EN + FR glue words and generic product nouns that must not become terms.
const STOPWORDS = new Set(
	'the a an and or but for with without to of in on at by from as is are was were be been being this that these those it its they them their you your we our not no can will would should could may might must do does did has have had one more most some any all each than then out per via etc using used only also into over your when what which who how why there here such just like many much very even still back once while where about above below after before between during through across around against among les des une est sont dans pour avec sans sur par que qui ce cette ces ils elles vous nous mais plus aux comme donc tout tous leur leurs entre chaque selon vers afin etre fait font peut doit lors deja encore sous'.split(
		/\s+/
	)
);
const GENERIC = new Set(
	'tool tools system platform app application product feature features user users data management process page screen team work flow type kind thing things solution service services'.split(
		/\s+/
	)
);

/**
 * Propose candidate terms from the brief: recurring lowercase domain words and
 * distinctive proper nouns (camelCase brands, acronyms) that are not governed
 * yet. Returns the top eight by frequency-weighted score.
 */
export function suggestGlossaryTerms(
	corpus: string,
	terms: GlossaryTerm[]
): GlossarySuggestion[] {
	const known = new Set<string>();
	for (const t of terms) {
		if (t.term) known.add(t.term.toLowerCase());
		for (const s of t.synonymsAllowed) known.add(s.toLowerCase());
		for (const s of t.synonymsAvoid) known.add(s.toLowerCase());
	}
	const ok = (w: string): boolean =>
		w.length >= 4 && !STOPWORDS.has(w) && !GENERIC.has(w) && !known.has(w) && !/^\d+$/.test(w);

	const score: Record<string, number> = {};
	const display: Record<string, string> = {};

	for (const raw of corpus.toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ'-]{2,}/g) ?? []) {
		const w = raw.replace(/^['-]+|['-]+$/g, '');
		if (!ok(w)) continue;
		score[w] = (score[w] ?? 0) + 1;
		if (!display[w]) display[w] = w.charAt(0).toUpperCase() + w.slice(1);
	}
	for (const raw of corpus.match(/\b[A-Z][A-Za-z][A-Za-z0-9]{2,}\b/g) ?? []) {
		const w = raw.toLowerCase();
		if (!ok(w)) continue;
		const brandish = /[a-z][A-Z]/.test(raw) || /^[A-Z0-9]{3,}$/.test(raw);
		if (!brandish) continue;
		score[w] = (score[w] ?? 0) + 2;
		display[w] = raw;
	}

	return Object.keys(score)
		.filter((w) => score[w] >= 2)
		.sort((a, b) => score[b] - score[a])
		.slice(0, 8)
		.map((w) => ({ term: display[w], weight: score[w] }));
}
