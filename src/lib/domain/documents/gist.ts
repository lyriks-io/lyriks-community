import type { DocumentSource } from './draft';

/** Past this, a "first sentence" is a paragraph and stops being glanceable. */
const GIST_MAX = 220;

/**
 * The first sentence of a text: up to the first `.`, `!` or `?` that ends the
 * text or is followed by a space and a capital, so "v2.1" or "Art. 17" do not
 * cut it short.
 * Clipped with an ellipsis when that sentence runs on.
 */
export function firstSentence(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (!flat) return '';
	const end = flat.search(/[.!?](?=$|\s+[\p{Lu}"'«(])/u);
	const sentence = end === -1 ? flat : flat.slice(0, end + 1);
	return sentence.length <= GIST_MAX ? sentence : `${sentence.slice(0, GIST_MAX - 1).trimEnd()}…`;
}

/**
 * What a citation says at a glance: the first sentence of the source's own
 * words, or its address when it carries none. An inline file's data URL is
 * never an address worth reading, so it yields nothing.
 */
export function sourceGist(source: Pick<DocumentSource, 'note' | 'url'>): string {
	const said = firstSentence(source.note);
	if (said) return said;
	const url = source.url.trim();
	return url.startsWith('data:') ? '' : url;
}
