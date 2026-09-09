import { classifyBusinessAltitude } from '$domain/foundation';
import { classifyGlossaryTerm } from '$domain/glossary';
import type { SectionValidationIssue } from './section-authoring-schema';

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
		label: 'Foundation › Requirements › Business › Business objectives'
	},
	{
		path: 'definition.business.contractualConstraints',
		label: 'Foundation › Requirements › Business › Contractual constraints'
	},
	{
		path: 'definition.business.risks',
		label: 'Foundation › Requirements › Business › Key risks & assumptions'
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

const quote = (text: string): string => `"${text.length > 80 ? `${text.slice(0, 77)}…` : text}"`;

function foundationIssues(input: unknown): SectionValidationIssue[] {
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
				message: `reads as a feature rule, not a business signal — ${verdict.reason}: ${quote(text.trim())}. ${label} stays high-level; author it in ${verdict.belongsTo}`
			});
		});
	}
	return issues;
}

function glossaryIssues(input: unknown): SectionValidationIssue[] {
	const source = input as Record<string, unknown>;
	if (!Array.isArray(source.terms)) return [];
	const issues: SectionValidationIssue[] = [];
	source.terms.forEach((entry, index) => {
		if (!entry || typeof entry !== 'object') return;
		const term = (entry as Record<string, unknown>).term;
		if (typeof term !== 'string') return;
		const verdict = classifyGlossaryTerm(term);
		if (!verdict) return;
		issues.push({
			path: `terms[${index}].term`,
			message: `${quote(term.trim())} ${verdict.reason}. The Glossary governs the words the product and its users SAY — ${verdict.instead}`
		});
	});
	return issues;
}

/** Reject content authored onto a page that does not hold that kind of thing. */
export function validateSectionContent(section: string, input: unknown): SectionValidationIssue[] {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
	if (section === 'foundation') return foundationIssues(input);
	if (section === 'glossary') return glossaryIssues(input);
	return [];
}
