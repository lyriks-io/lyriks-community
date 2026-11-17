/**
 * In a product read from something that exists, every element extracted says
 * where it comes from (ac-src-extracted, criterion 7a8be13f): a feature, a rule,
 * an edge case, a glossary term, a role or a table of the data model cites the
 * rows of the register it rests on, what it was read from first (the code, the
 * page, the prototype) and every ticket, page or document that speaks of it. The
 * behaviour elements are traced to their code span by the engine's analysis,
 * which this does not read.
 *
 * Pure: the elements arrive as plain rows, whatever section holds them.
 */

export type ExtractedKind = 'feature' | 'rule' | 'edge_case' | 'term' | 'role' | 'table';

/** What a project was read from: its code, its documentation or its design (a Figma file, a clickable prototype). */
export type ExtractedFrom = 'code' | 'documents' | 'design';

/**
 * What a project was read from, off the source mode its identity records; null
 * for a project started from scratch, which extracted nothing.
 */
export function extractedFromSourceMode(sourceMode: string | null | undefined): ExtractedFrom | null {
	if (sourceMode === 'code_to_spec') return 'code';
	if (sourceMode === 'from_document') return 'documents';
	if (sourceMode === 'from_figma') return 'design';
	return null;
}

export interface ExtractedElement {
	readonly kind: ExtractedKind;
	readonly name: string;
	readonly sourceIds?: readonly string[];
}

/** The elements a project read from something that exists holds, and what it was read from. */
export interface ExtractedReading {
	readonly from: ExtractedFrom;
	readonly elements: readonly ExtractedElement[];
}

export interface UncitedElement {
	readonly kind: ExtractedKind;
	readonly name: string;
}

/** The elements that cite nothing the register holds: a citation of a removed row cites nothing. */
export function uncitedElements(elements: readonly ExtractedElement[], registerIds: readonly string[]): UncitedElement[] {
	const register = new Set(registerIds);
	return elements
		.filter((element) => !(element.sourceIds ?? []).some((id) => register.has(id)))
		.map(({ kind, name }) => ({ kind, name }));
}
