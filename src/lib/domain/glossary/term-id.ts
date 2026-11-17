/**
 * The id a term written without one is kept under (criterion c7afe419 of
 * feat-fb747-glossary). It is made from the word itself, so the same word gets
 * the same id on every save that sends it bare: "Invoice status" is
 * `term-invoice-status`, "Réservation" is `term-reservation`, a word in a script
 * without accents keeps its letters. A word with no letter or digit at all has
 * nothing to make an id from, and the save refuses it instead of guessing. Pure.
 */

const PREFIX = 'term-';

/** Longest slug kept from the word, so an id stays readable when a definition is pasted into the term field. */
const SLUG_MAX = 60;

/** The id a bare term is given before collisions are settled, or null when its word holds no letter or digit. */
export function termIdBase(word: string): string | null {
	const slug = word
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, SLUG_MAX)
		.replace(/-+$/, '');
	return slug ? PREFIX + slug : null;
}

/** `base`, or `base-2`, `base-3`... the first one no other term of the same save already holds. */
export function uniqueTermId(base: string, taken: ReadonlySet<string>): string {
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n += 1;
	return `${base}-${n}`;
}
