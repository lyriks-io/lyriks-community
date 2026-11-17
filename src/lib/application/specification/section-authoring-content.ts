import { ALTITUDE_TARGETS, classifyBusinessAltitude } from '$domain/foundation';
import { classifyGlossaryTerm, termIdBase } from '$domain/glossary';
import type { SectionValidationIssue } from './section-authoring-schema';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/**
 * Is the authored CONTENT the kind of thing this page holds?
 *
 * Shape validation answers "does the payload parse", referential integrity
 * answers "do the ids resolve"; this answers the question that actually shows on
 * screen — a Given/When/Then in the Foundation business objective, a code
 * identifier as a governed term. Both are failures a programmatic author makes
 * far more often than a human, and both are invisible until a customer reads the
 * page.
 *
 * Every rule delegates to its own bounded context: this module only knows WHERE
 * in a payload each policy applies.
 */

/**
 * The Foundation lists that must stay at business altitude, paired with the
 * label the author actually reads on the page — an error naming
 * "definition.business.risks" alone leaves a human hunting for the field.
 */
const FOUNDATION_HIGH_LEVEL_LISTS: readonly { readonly path: string; readonly label: string }[] = [
	{
		path: 'definition.businessObjective.successCriteria',
		label: "Foundation › Business objective › We've won when"
	},
	{
		path: 'definition.businessObjective.failureCriteria',
		label: 'Foundation › Business objective › We should kill it when'
	},
	{
		path: 'definition.business.objectives',
		label: 'Foundation › Business objectives (stored, not shown)'
	},
	{
		path: 'definition.constraints.items',
		label: 'Foundation › Constraints'
	},
	{
		path: 'definition.business.risks',
		label: 'Foundation › Key risks & assumptions (stored, not shown)'
	}
];

function at(source: unknown, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>(
			(node, key) =>
				node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
			source
		);
}

/**
 * The same loose reading the section parsers apply: an author may write a list
 * entry as a bare string or wrapped in an object, so the guard must see the text
 * either way rather than waving a wrapped feature rule through.
 */
function textOf(value: unknown): string | null {
	if (typeof value === 'string') return value;
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	for (const key of ['name', 'label', 'value', 'title', 'text', 'description']) {
		const candidate = record[key];
		if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
	}
	return null;
}

const clip = (text: string): string => (text.length > 80 ? `${text.slice(0, 77)}…` : text);
const quote = (text: string, lang: SpecLanguage = 'en'): string =>
	lang === 'fr' ? quoteName('fr', clip(text)) : `"${clip(text)}"`;

/**
 * The altitude verdicts in French, keyed by the English text the Foundation
 * context writes; a verdict with no French text reads as it is.
 */
const FRENCH_ALTITUDE: Readonly<Record<string, string>> = {
	'it is phrased as a Given/When/Then scenario': 'elle est formulée comme un scénario Given/When/Then',
	'it is written as a user story': 'elle est écrite comme une user story',
	'it states a capability a role gets; that is a feature, not a business signal':
		"elle énonce une capacité donnée à un rôle, c'est-à-dire une fonctionnalité",
	'it states what the system must do: a functional requirement, not a business outcome':
		"elle énonce ce que le système doit faire, une exigence fonctionnelle plutôt qu'un résultat métier",
	'it describes screen mechanics': "elle décrit la mécanique d'un écran",
	'it describes field validation or an API contract': "elle décrit la validation d'un champ ou un contrat d'API",
	[ALTITUDE_TARGETS.rules]: 'la section `rules` (Features › Rules)',
	[ALTITUDE_TARGETS.features]: 'la section `features` (Features › Tree)',
	[ALTITUDE_TARGETS.experience]: 'la section `experience` (parcours et écrans)'
};
const french = (text: string): string => FRENCH_ALTITUDE[text] ?? text;

function foundationIssues(input: unknown, lang: SpecLanguage = 'en'): SectionValidationIssue[] {
	const issues: SectionValidationIssue[] = [];
	for (const { path, label } of FOUNDATION_HIGH_LEVEL_LISTS) {
		const entries = at(input, path);
		if (!Array.isArray(entries)) continue;
		entries.forEach((entry, index) => {
			const text = textOf(entry);
			if (text === null) return;
			const verdict = classifyBusinessAltitude(text);
			if (!verdict) return;
			issues.push({
				path: `${path}[${index}]`,
				message:
					lang === 'fr'
						? `se lit comme une règle fonctionnelle, pas comme un signal métier (${french(verdict.reason)})${NBSP}: ${quote(text.trim(), lang)}. La liste ${quoteName('fr', label)} reste de haut niveau${NBSP}; écrivez cette entrée dans ${french(verdict.belongsTo)}`
						: `reads as a feature rule, not a business signal — ${verdict.reason}: ${quote(text.trim())}. ${label} stays high-level; author it in ${verdict.belongsTo}`
			});
		});
	}
	return issues;
}

function glossaryIssues(input: unknown, lang: SpecLanguage = 'en'): SectionValidationIssue[] {
	const source = input as Record<string, unknown>;
	if (!Array.isArray(source.terms)) return [];
	const issues: SectionValidationIssue[] = [];
	source.terms.forEach((entry, index) => {
		if (!entry || typeof entry !== 'object') return;
		const { id, term } = entry as Record<string, unknown>;
		// A bare term is given an id made from its word; one with no word to make it
		// from is named here rather than dropped (criterion c7afe419 of feat-fb747-glossary).
		if ((typeof id !== 'string' || id.length === 0) && termIdBase(typeof term === 'string' ? term : '') === null) {
			issues.push({
				path: `terms[${index}]`,
				message:
					lang === 'fr'
						? `n'a ni id ni lettre ou chiffre dans son mot pour en fabriquer un${NBSP}: donnez-lui un id, ou un mot`
						: 'has no id and no letter or digit in its word to make one from: give it an id, or a word'
			});
			return;
		}
		if (typeof term !== 'string') return;
		const verdict = classifyGlossaryTerm(term, lang);
		if (!verdict) return;
		issues.push({
			path: `terms[${index}].term`,
			message:
				lang === 'fr'
					? `${quote(term.trim(), lang)} ${verdict.reason}. Le glossaire régit les mots que le produit et ses utilisateurs DISENT${NBSP}: ${verdict.instead}`
					: `${quote(term.trim())} ${verdict.reason}. The Glossary governs the words the product and its users SAY — ${verdict.instead}`
		});
	});
	return issues;
}

/** Reject content authored onto a page that does not hold that kind of thing. */
export function validateSectionContent(
	section: string,
	input: unknown,
	lang: SpecLanguage = 'en'
): SectionValidationIssue[] {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
	if (section === 'foundation') return foundationIssues(input, lang);
	if (section === 'glossary') return glossaryIssues(input, lang);
	return [];
}
