/**
 * The keywords of the EARS notation, so a requirement sentence can show them
 * apart from the rest of its words (5b984e4a): While, When, Where, If, then
 * and shall in English; Tant que, Lorsque, Si, alors and doit in French,
 * elided or not, the words the engine's French template writes. Pure: it only
 * cuts a string into runs, the UI decides how a keyword looks.
 */
export interface EarsRun {
	readonly text: string;
	readonly keyword: boolean;
}

/** Where a keyword stands in a text: from its first character up to, not including, `to`. */
export type EarsSpan = readonly [from: number, to: number];

/**
 * Whole words only, any case: "shallow", "whenever" or "sinon" never match.
 * An elided French keyword ends on its apostrophe: Lorsqu'un, Tant qu'il, s'il.
 */
const KEYWORD =
	/(?<![\p{L}\p{N}_'’])(?:(?:while|when|where|if|then|shall|tant\s+que|lorsque|si|alors|doit)(?![\p{L}\p{N}_])|(?:tant\s+qu|lorsqu)['’](?=\p{L})|s['’](?=ils?(?![\p{L}\p{N}_])))/giu;

/** What a sentence quotes (a state, a value, a message), whose words are never keywords. */
const QUOTED = /«[^»]*»|“[^”]*”|"[^"]*"/g;

/** Where the EARS keywords of `text` stand, outside what it quotes. */
export function earsKeywordSpans(text: string): EarsSpan[] {
	if (!text) return [];
	const quoted = [...text.matchAll(QUOTED)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
	const inQuote = (at: number) => quoted.some(([from, to]) => at > from && at < to);
	return [...text.matchAll(KEYWORD)].filter((m) => !inQuote(m.index ?? 0)).map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
}

/**
 * The runs of `part`, a piece of a longer text that starts at `offset` in it,
 * cut by the keyword spans read on the whole text: a quotation that a glossary
 * word splits across pieces still keeps its words plain.
 */
export function earsRunsWithin(part: string, offset: number, spans: readonly EarsSpan[]): EarsRun[] {
	const runs: EarsRun[] = [];
	let last = 0;
	for (const [from, to] of spans) {
		const start = Math.max(from - offset, 0);
		const end = Math.min(to - offset, part.length);
		if (end <= start || start < last) continue;
		if (start > last) runs.push({ text: part.slice(last, start), keyword: false });
		runs.push({ text: part.slice(start, end), keyword: true });
		last = end;
	}
	if (last < part.length) runs.push({ text: part.slice(last), keyword: false });
	return runs;
}

/** Cuts `text` into keyword and non-keyword runs; joined back, they give `text`. */
export function splitEarsKeywords(text: string): EarsRun[] {
	return text ? earsRunsWithin(text, 0, earsKeywordSpans(text)) : [];
}

/**
 * Whether a display string is an EARS requirement sentence: it opens on an
 * EARS trigger (or "The system", "Le système") and states what the system
 * shall do ("doit"). Lets a view that shows mixed texts set apart only the
 * requirement sentences.
 */
const EARS_SENTENCE = /^(the system|while|when|where|if)\b[\s\S]*\bshall\b/i;
const FRENCH_EARS_SENTENCE = /^(?:le système|tant\s+qu|lorsqu|si\s|s['’]ils?\s)[\s\S]*(?<![\p{L}])doit(?![\p{L}])/iu;
export function readsAsEars(text: string | null | undefined): boolean {
	if (!text) return false;
	const trimmed = text.trim();
	return EARS_SENTENCE.test(trimmed) || FRENCH_EARS_SENTENCE.test(trimmed);
}
