import type { DocumentSource } from './draft';

/**
 * Citations — the one way any spec object points at evidence.
 *
 * Documents & Sources is the project's single register of evidence; every other
 * context (features, foundation, users, rules, glossary, architecture) cites it by
 * stable id instead of keeping its own private list of links. That is what makes
 * "where did this requirement come from?" answerable in one place, and what lets
 * Traceability score coverage across the whole spec.
 *
 * Pure helpers only — no IO, no framework.
 */

/** Toggle one source id in a citation list. Order-stable, never duplicates. */
export function toggleCitation(ids: readonly string[] | undefined, sourceId: string): string[] {
	const current = ids ?? [];
	return current.includes(sourceId)
		? current.filter((id) => id !== sourceId)
		: [...current, sourceId];
}

/** The cited sources that still exist in the register, in register order. */
export function citedSources(
	ids: readonly string[] | undefined,
	sources: readonly DocumentSource[]
): DocumentSource[] {
	const cited = new Set(ids ?? []);
	return sources.filter((source) => cited.has(source.id));
}

/**
 * Cited ids with no row left in the register — the source was deleted after it
 * was cited. Surfaced rather than silently dropped: a requirement whose evidence
 * vanished is exactly what an audit needs to see.
 */
export function brokenCitations(
	ids: readonly string[] | undefined,
	sources: readonly DocumentSource[]
): string[] {
	const known = new Set(sources.map((source) => source.id));
	return (ids ?? []).filter((id) => !known.has(id));
}

/** How many live citations an object carries — the count every picker badges. */
export function citationCount(
	ids: readonly string[] | undefined,
	sources: readonly DocumentSource[]
): number {
	return citedSources(ids, sources).length;
}
