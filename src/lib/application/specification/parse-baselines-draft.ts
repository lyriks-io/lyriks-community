import { createEmptyBaselinesDraft, type Baseline, type ProjectBaselinesDraft } from '$domain/baselines';
import { parseStableRecords } from './parse-stable-records';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Anti-corruption parse for the baselines: each keeps its id, its name and its
 * moment. What an older list still carries (a note, scores, a feature count,
 * a frozen requirements document) is dropped as it is read (criterion c7254cb1).
 */
export function parseBaselinesDraft(input: unknown, projectId: string): ProjectBaselinesDraft {
	const base = createEmptyBaselinesDraft(projectId);
	if (!input || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;
	const baselines = parseStableRecords(src.baselines, 'baseline', (r, id): Baseline => ({ id, name: str(r.name), createdAt: str(r.createdAt) }));
	return { ...base, baselines };
}
