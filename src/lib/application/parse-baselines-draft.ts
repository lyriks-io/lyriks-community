import {
	createEmptyBaselinesDraft,
	type Baseline,
	type ProjectBaselinesDraft
} from '$domain/baselines';
import { parseStableRecords } from './parse-stable-records';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Anti-corruption parse for the Baselines draft (residue-backed, immutable snapshots). */
export function parseBaselinesDraft(input: unknown, projectId: string): ProjectBaselinesDraft {
	const base = createEmptyBaselinesDraft(projectId);
	if (!input || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;
	const baselines = parseStableRecords(src.baselines, 'baseline', (r, id): Baseline => ({
		id,
		name: str(r.name),
		note: str(r.note),
		createdAt: str(r.createdAt),
		readiness: num(r.readiness),
		coherence: num(r.coherence),
		featureCount: num(r.featureCount),
		content: str(r.content)
	})
	);
	return { ...base, projectId, baselines };
}
