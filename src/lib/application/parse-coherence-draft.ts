import {
	createEmptyCoherenceDraft,
	ARTIFACT_KINDS,
	DEFAULT_THRESHOLD,
	type GeneratedArtifact,
	type PreparedDecision,
	type ProjectCoherenceDraft
} from '$domain/coherence';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Step 09 payloads. Only the authored state
 * is accepted (threshold, generated artifacts); the live analysis is never
 * trusted from the client, it is recomputed server-side.
 *
 * Decisions and acknowledgements are not read from the payload AT ALL, on
 * purpose. Both take findings out of every score, and both used to arrive here
 * as plain data: a caller could settle any non-blocking finding, pick its own
 * `authorKind`, and sign it as a person. The decisions endpoint is the only way
 * in, because it is the only one that knows who is asking. The save use case
 * carries the stored trace over, so leaving them out here never erases them.
 */
export function parseCoherenceDraft(input: unknown, projectId: string): ProjectCoherenceDraft {
	const base = createEmptyCoherenceDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const threshold =
		typeof src.threshold === 'number' && src.threshold >= 0 && src.threshold <= 100
			? Math.round(src.threshold)
			: DEFAULT_THRESHOLD;

	return {
		...base,
		projectId,
		threshold,
		// Left empty by design: SaveCoherenceDraftUseCase.execute puts the stored
		// trace back. See the note above.
		acknowledgedGapIds: [],
		decisions: [],
		// A PREPARED decision, on the other hand, is ordinary authored content:
		// it settles nothing and moves no score, so anything that may write this
		// section may leave one. Its author is not read from here either; the
		// save stamps it from the request, and drops any preparation whose gap
		// is no longer open or has turned blocking.
		prepared: parseStableRecords(src.prepared, 'prepared', (record, id): PreparedDecision | null => {
			if (typeof record.gapId !== 'string' || record.gapId.length === 0) return null;
			const status = record.status;
			if (status !== 'accepted_risk' && status !== 'by_design' && status !== 'wont_fix') return null;
			const reason = typeof record.reason === 'string' ? record.reason : '';
			if (reason.trim() === '') return null;
			return {
				id,
				gapId: record.gapId,
				gapTitle: typeof record.gapTitle === 'string' ? record.gapTitle : record.gapId,
				status,
				reason,
				preparedById: '',
				preparedByKind: 'ai_client',
				preparedAt: ''
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
