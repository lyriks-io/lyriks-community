/**
 * Citing an element of the product in a text of the Functional spec
 * (ac-evo-func-mention). The text stays prose; a citation is a token,
 * `@[name](kind:id)`, the name as the person reads it and the node id of the
 * knowledge graph (a glossary term is `term:<id>`). The page and an AI client
 * write the same token, so neither needs the other to cite.
 */

/** What may be cited: a feature, a screen, a rule, a glossary term. */
export const MENTION_KINDS = ['feature', 'screen', 'rule', 'term'] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];
export const isMentionKind = (v: unknown): v is MentionKind => typeof v === 'string' && (MENTION_KINDS as readonly string[]).includes(v);

/** One piece of a text: prose, or a citation. */
export type TextPiece =
	| { readonly kind: 'text'; readonly text: string }
	| { readonly kind: 'mention'; readonly name: string; readonly ref: string };

const TOKEN = /@\[([^\]\n]+)\]\(([a-zA-Z]+:[^)\s]+)\)/g;

/** The token that cites `ref` under `name`; brackets in the name would break it, so they go. */
export function mentionToken(name: string, ref: string): string {
	return `@[${name.replace(/[[\]]/g, '').trim()}](${ref})`;
}

/** A text cut into its prose and its citations, in order. */
export function textPieces(text: string): TextPiece[] {
	const out: TextPiece[] = [];
	let last = 0;
	for (const match of text.matchAll(TOKEN)) {
		const at = match.index ?? 0;
		if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
		out.push({ kind: 'mention', name: match[1].trim(), ref: match[2] });
		last = at + match[0].length;
	}
	if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
	return out;
}

/** The elements a text cites, each once, in the order they first appear. */
export function mentionedRefs(text: string): string[] {
	return [...new Set(textPieces(text).flatMap((p) => (p.kind === 'mention' ? [p.ref] : [])))];
}

/** The text as a person reads it aloud: each citation reduced to its name. */
export function plainText(text: string): string {
	return textPieces(text)
		.map((p) => (p.kind === 'text' ? p.text : p.name))
		.join('');
}

/**
 * The word being typed after an `@` that opens a citation, read up to the
 * caret: null when the caret is not in one. An `@` inside a word (an e-mail
 * address) opens nothing.
 */
export function openMention(text: string, caret: number): { readonly start: number; readonly query: string } | null {
	const before = text.slice(0, caret);
	const at = before.lastIndexOf('@');
	if (at < 0) return null;
	if (at > 0 && /\S/.test(before[at - 1])) return null;
	const query = before.slice(at + 1);
	if (/[\n[\]()]/.test(query) || query.length > 40) return null;
	return { start: at, query };
}

/** Replace the citation being typed (from `start` to the caret) by the token of the picked element. */
export function insertMention(text: string, start: number, caret: number, name: string, ref: string): { readonly text: string; readonly caret: number } {
	const token = `${mentionToken(name, ref)}${/^\s/.test(text.slice(caret)) ? '' : ' '}`;
	return { text: `${text.slice(0, start)}${token}${text.slice(caret)}`, caret: start + token.length };
}

/** An element a text may cite, as the picker offers it and a chip opens it. */
export interface MentionCandidate {
	readonly ref: string;
	readonly kind: MentionKind;
	readonly name: string;
	readonly href: string | null;
}

const KIND_ORDER: Record<MentionKind, number> = { feature: 0, screen: 1, term: 2, rule: 3 };

/**
 * What the picker offers for what is typed after the `@`: names holding it,
 * the ones that start with it first, then by kind (features, screens, terms,
 * rules). With `refs`, the cited elements that still exist, so a citation whose
 * element is gone reads as its plain name.
 */
export function pickMentions(
	all: readonly MentionCandidate[],
	ask: { readonly q?: string; readonly refs?: readonly string[]; readonly limit?: number }
): MentionCandidate[] {
	if (ask.refs) {
		const wanted = new Set(ask.refs);
		return all.filter((c) => wanted.has(c.ref));
	}
	const q = (ask.q ?? '').trim().toLowerCase();
	return all
		.filter((c) => c.name.toLowerCase().includes(q))
		.sort(
			(a, b) =>
				Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) ||
				KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
				a.name.localeCompare(b.name)
		)
		.slice(0, ask.limit ?? 8);
}
