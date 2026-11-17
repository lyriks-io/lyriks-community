import { lastPublishedRun, sameCode, type CodeChange, type DriftDecision, type RetrospecDocument } from '$domain/retrospec';

/**
 * The decision a code change reads with on the page: the one the document as
 * the page shows it holds on this very code (a keep or a send back clicked a
 * moment ago reads at once), the same rule the server applies when it lists
 * the changes. Pure.
 */
export function driftDecisionOf(doc: RetrospecDocument, change: Pick<CodeChange, 'key' | 'code'>): DriftDecision | null {
	const decision = lastPublishedRun(doc)?.drift?.[change.key];
	return decision && sameCode(decision.code, change.code) ? decision : null;
}
