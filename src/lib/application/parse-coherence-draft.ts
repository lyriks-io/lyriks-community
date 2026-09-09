import {
	createEmptyCoherenceDraft,
	ARTIFACT_KINDS,
	DEFAULT_THRESHOLD,
	type GapDecision,
	type GeneratedArtifact,
	type ProjectCoherenceDraft
} from '$domain/coherence';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Step 09 payloads. Only the authored
 * state is accepted (threshold, acknowledgements, generated artifacts); the
 * live analysis is never trusted from the client — it's recomputed server-side.
 */
export function parseCoherenceDraft(input: unknown, projectId: string): ProjectCoherenceDraft {
	const base = createEmptyCoherenceDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const arr = <T>(k: string): T[] => (Array.isArray(src[k]) ? (src[k] as T[]) : []);
	const threshold =
		typeof src.threshold === 'number' && src.threshold >= 0 && src.threshold <= 100
			? Math.round(src.threshold)
			: DEFAULT_THRESHOLD;

	return {
		...base,
		projectId,
		threshold,
		acknowledgedGapIds: [
			...new Set(arr<string>('acknowledgedGapIds').filter((x) => typeof x === 'string' && x.length > 0))
		],
		decisions: parseStableRecords(src.decisions, 'decision', (record, id): GapDecision | null => {
			if (typeof record.gapId !== 'string' || record.gapId.length === 0) return null;
			const status = record.status;
			if (status !== 'accepted_risk' && status !== 'wont_fix' && status !== 'reopened') return null;
			return {
				id,
				gapId: record.gapId,
				status,
				reason: typeof record.reason === 'string' ? record.reason : '',
				authorId: typeof record.authorId === 'string' && record.authorId ? record.authorId : 'unknown',
				authorKind: record.authorKind === 'ai_client' ? 'ai_client' : 'person',
				decidedAt: typeof record.decidedAt === 'string' ? record.decidedAt : '',
				gapTitle: typeof record.gapTitle === 'string' ? record.gapTitle : record.gapId,
				supersededById: typeof record.supersededById === 'string' ? record.supersededById : null
			};
		}),
		artifacts: parseStableRecords(src.artifacts, 'artifact', (record, id): GeneratedArtifact => ({
			id,
			kind: ARTIFACT_KINDS.some((kind) => kind.code === record.kind)
				? (record.kind as GeneratedArtifact['kind'])
				: 'functional_doc',
			title: typeof record.title === 'string' ? record.title : '',
			content: typeof record.content === 'string' ? record.content : '',
			generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : ''
		})),
		specsGenerated: src.specsGenerated === true,
		generatedAt: typeof src.generatedAt === 'string' ? src.generatedAt : null
	};
}
