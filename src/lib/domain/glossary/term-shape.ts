/**
 * The Glossary governs the words a product and its users SAY — one agreed word
 * per concept, so every downstream artefact uses the same one. A code identifier
 * is therefore never a term: it is how the concept is spelled in the schema,
 * which the Data model already records.
 *
 * Programmatic authors reach for the identifier by reflex (`invoiceStatus`,
 * `USER_ROLE`, `getInvoice()`), which turns the vocabulary page into a second
 * copy of the data model. Only narrow, unambiguous shapes are rejected — an
 * English or French term never looks like one of these.
 */

export interface GlossaryTermVerdict {
	/** Why the value is not a governed word. */
	readonly reason: string;
	/** What to do with it instead. */
	readonly instead: string;
}

const SPELL_IT_OUT =
	'spell the concept out ("Invoice status"), keep the identifier in the Data model, and list it under synonymsAvoid[] if the team keeps saying it';

const SHAPES: readonly { readonly test: RegExp; readonly reason: string }[] = [
	{ test: /\(\s*\)/, reason: 'is a function call, not a word' },
	{ test: /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/, reason: 'is a camelCase code identifier' },
	{ test: /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/, reason: 'is a snake_case code identifier' },
	{ test: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/, reason: 'is a SCREAMING_SNAKE_CASE constant' }
];

/** Classify one authored term. `null` means it reads as a governed word. */
export function classifyGlossaryTerm(term: string): GlossaryTermVerdict | null {
	const value = term.trim();
	if (value.length === 0) return null;
	const shape = SHAPES.find((candidate) => candidate.test.test(value));
	return shape ? { reason: shape.reason, instead: SPELL_IT_OUT } : null;
}
