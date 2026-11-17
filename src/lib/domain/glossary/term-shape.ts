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

import { quoteName, type SpecLanguage } from '$domain/language';

export interface GlossaryTermVerdict {
	/** Why the value is not a governed word. */
	readonly reason: string;
	/** What to do with it instead. */
	readonly instead: string;
}

const SPELL_IT_OUT =
	'spell the concept out ("Invoice status"), keep the identifier in the Data model, and list it under synonymsAvoid[] if the team keeps saying it';

const FRENCH_SPELL_IT_OUT = `écrivez le concept en toutes lettres (${quoteName('fr', 'Statut de facture')}), gardez l'identifiant dans le modèle de données et listez-le dans synonymsAvoid[] si l'équipe continue de l'employer`;

const SHAPES: readonly { readonly test: RegExp; readonly reason: string; readonly frenchReason: string }[] = [
	{ test: /\(\s*\)/, reason: 'is a function call, not a word', frenchReason: "est un appel de fonction, pas un mot" },
	{ test: /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/, reason: 'is a camelCase code identifier', frenchReason: 'est un identifiant de code en camelCase' },
	{ test: /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/, reason: 'is a snake_case code identifier', frenchReason: 'est un identifiant de code en snake_case' },
	{ test: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/, reason: 'is a SCREAMING_SNAKE_CASE constant', frenchReason: 'est une constante en SCREAMING_SNAKE_CASE' }
];

/** Classify one authored term, its verdict written in the spec's language. `null` means it reads as a governed word. */
export function classifyGlossaryTerm(term: string, lang: SpecLanguage = 'en'): GlossaryTermVerdict | null {
	const value = term.trim();
	if (value.length === 0) return null;
	const shape = SHAPES.find((candidate) => candidate.test.test(value));
	if (!shape) return null;
	return lang === 'fr'
		? { reason: shape.frenchReason, instead: FRENCH_SPELL_IT_OUT }
		: { reason: shape.reason, instead: SPELL_IT_OUT };
}
