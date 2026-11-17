/**
 * The one language a project's spec is written in. It is DECLARED, never
 * guessed: the primary locale of the product (Foundation › Operations › i18n).
 * A project that declares none is written in English. Every piece of prose in
 * the model follows it, whoever writes it; the names the code will also carry
 * (state paths, events, actions, fields, enum values) stay in English.
 *
 * The texts Lyriks generates (requirement sentences, Given/When/Then, the
 * solver's findings, what a change does to the proofs) exist in the languages
 * below; a project declaring another one gets them in English, and is told so.
 */
export type SpecLanguage = 'en' | 'fr';

export const GENERATED_LANGUAGES: readonly SpecLanguage[] = ['en', 'fr'];

export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
	en: 'English',
	fr: 'French',
	de: 'German',
	es: 'Spanish',
	it: 'Italian',
	pt: 'Portuguese',
	nl: 'Dutch'
};

/** The primary subtag of a locale (`fr-CA` is `fr`), lower case; empty when none. */
export const languageTag = (locale: string | null | undefined): string =>
	(locale ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';

export interface SpecLanguageReading {
	/** The language the prose of the spec is written in. */
	readonly language: string;
	/** Whether the project declared it; false means English by default. */
	readonly declared: boolean;
	/** The language Lyriks generates its texts in: the declared one when it has a template, else English. */
	readonly generated: SpecLanguage;
	/** Set when something about the language needs saying, in English (UI chrome and AI clients). */
	readonly notice: string | null;
}

/**
 * How a project's language reads, from its declared primary locale and, when
 * it declares none, from what its prose looks like (only to warn, never to
 * choose).
 */
export function specLanguage(
	primaryLocale: string | null | undefined,
	proseLooksLike: string | null = null
): SpecLanguageReading {
	const tag = languageTag(primaryLocale);
	if (!tag) {
		const looks = proseLooksLike && proseLooksLike !== 'en' ? proseLooksLike : null;
		return {
			language: 'en',
			declared: false,
			generated: 'en',
			notice: looks
				? `No language is declared, so the spec is written in English, while its prose reads as ${LANGUAGE_NAMES[looks] ?? looks}. Declare the primary language (Foundation, Operations, i18n) so every text, generated ones included, is written in it.`
				: null
		};
	}
	const generated = (GENERATED_LANGUAGES as readonly string[]).includes(tag) ? (tag as SpecLanguage) : 'en';
	const declared = LANGUAGE_NAMES[tag] ?? tag;
	// Prose that reads clearly in another language than the declared one is
	// told so: the declaration still decides, nothing switches.
	const reads = proseLooksLike && proseLooksLike !== tag ? (LANGUAGE_NAMES[proseLooksLike] ?? proseLooksLike) : null;
	return {
		language: tag,
		declared: true,
		generated,
		notice: reads
			? `The spec is declared in ${declared}, while its prose reads as ${reads}. Write the prose in ${declared}, or declare ${reads} as the primary language (Foundation, Operations, i18n).`
			: generated === tag
				? null
				: `The spec is written in ${declared}; the texts Lyriks generates are not available in it yet and read in English.`
	};
}

/** Short words that only one language uses often: enough to tell French prose from English. */
const MARKERS: Readonly<Record<'en' | 'fr', readonly string[]>> = {
	en: ['the', 'and', 'is', 'are', 'of', 'to', 'with', 'when', 'which', 'that', 'it', 'for', 'be', 'not', 'can'],
	fr: ['le', 'la', 'les', 'des', 'du', 'et', 'est', 'une', 'un', 'pour', 'dans', 'avec', 'qui', 'que', 'pas', 'sont', 'au', 'aux', 'ne']
};

/**
 * The language most of `texts` is written in, among English and French, or
 * null when there is too little prose to say. Used to warn only.
 */
export function proseLanguage(texts: Iterable<string>): 'en' | 'fr' | null {
	const count = { en: 0, fr: 0 };
	const sets = { en: new Set(MARKERS.en), fr: new Set(MARKERS.fr) };
	for (const text of texts) {
		for (const word of text.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ']+/g) ?? []) {
			const bare = word.replace(/^[a-z]'/, '');
			if (sets.en.has(bare)) count.en += 1;
			if (sets.fr.has(bare)) count.fr += 1;
		}
	}
	const total = count.en + count.fr;
	if (total < 8) return null;
	if (count.fr / total >= 0.6) return 'fr';
	if (count.en / total >= 0.6) return 'en';
	return null;
}

/** The space French typography keeps inside « » and before : ; ! ?, which never breaks a line. */
export const NBSP = ' ';

/**
 * A name from the model as a sentence quotes it: "name" in English, « name »
 * in French. Names are never translated nor re-cased; an empty one reads as
 * an empty text.
 */
export function quoteName(lang: SpecLanguage, name: string): string {
	if (lang === 'fr') return name === '' ? 'un texte vide' : `«${NBSP}${name}${NBSP}»`;
	return `"${name}"`;
}

/** A number as the language writes it: 3.5 in English, 3,5 in French. */
export function numberText(lang: SpecLanguage, value: number): string {
	const text = String(value);
	return lang === 'fr' ? text.replace('.', ',') : text;
}

/** A truth value as a sentence says it. */
export function truthText(lang: SpecLanguage, value: boolean): string {
	if (lang === 'fr') return value ? 'vrai' : 'faux';
	return value ? 'true' : 'false';
}
