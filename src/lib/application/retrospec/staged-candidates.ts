import type { AdoptionResult, CandidateSpanInput } from '../ports';

/** One candidate the engine staged, as the answer names it (criterion 65c8df6d of feat-mcp-authoring). */
export interface StagedCandidateRow {
	readonly candidateId: string;
	readonly kind: string | null;
	readonly summary: string | null;
	readonly startOffset: number | null;
	readonly endOffset: number | null;
	readonly sourceId: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Put the ids of the candidates a `stage_candidates` call staged at the top of
 * its answer, as `created`, each beside what was sent for it.
 *
 * The engine answers one `results` row per item, in the order sent, and only a
 * staged row carries its `candidateId`; a caller had to line the rows up with
 * its own list to know which id is which, and in practice read them back
 * through the provenance instead. `created` does that pairing once: one row per
 * candidate staged, refused ones left to `results` with their reason. When the
 * engine's rows do not line up with what was sent, a row keeps only what the
 * engine said, rather than pairing an id with the wrong summary. Pure.
 */
export function withStagedCandidates(
	result: AdoptionResult | null,
	sent: readonly CandidateSpanInput[],
	defaultSourceId?: string
): AdoptionResult | null {
	if (!result?.ok || !Array.isArray(result.value.results)) return result;
	const rows = result.value.results;
	const paired = rows.length === sent.length;
	const created: StagedCandidateRow[] = [];
	rows.forEach((row, index) => {
		if (!isRecord(row) || row.ok !== true || typeof row.candidateId !== 'string') return;
		const input = paired ? sent[index] : undefined;
		created.push({
			candidateId: row.candidateId,
			kind: typeof row.proposedKind === 'string' ? row.proposedKind : (input?.kind ?? null),
			summary: input?.summary ?? null,
			startOffset: input?.startOffset ?? null,
			endOffset: input?.endOffset ?? null,
			sourceId: input ? (input.sourceId ?? defaultSourceId ?? null) : null
		});
	});
	return { ok: true, value: { created, ...result.value } };
}
