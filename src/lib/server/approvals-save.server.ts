import { error } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import type { SectionDraftSaveOptions } from '$application/ports';
import { AI_SIGN_OFF_REFUSAL, settledByWrite, stampDecisions, type ApprovalDecider, type ProjectApprovalsDraft } from '$domain/approvals';
import type { CallerKind } from './caller.server';

/** Who writes the worklist: what the request says about its caller, read by the route. */
export interface ApprovalsWriter {
	readonly kind: CallerKind;
	readonly decider: () => Promise<ApprovalDecider>;
}

/**
 * The approvals worklist as one write saves it. An AI client never settles an
 * approval itself (its guide says so; this door holds it): a write moving one
 * to Approved or Accepted risk is refused whole. Every status change is stamped
 * with the person and the time of the write, read here; the stamps a caller
 * sends are ignored. The answer carries the stamps so the page shows them.
 */
export async function saveApprovals(
	services: AppServices,
	projectId: string,
	draft: ProjectApprovalsDraft,
	save: SectionDraftSaveOptions,
	writer: ApprovalsWriter
) {
	const stored = await services.loadApprovalsDraft.execute(projectId);
	if (writer.kind === 'ai_client' && settledByWrite(stored.items, draft.items).length > 0) error(403, AI_SIGN_OFF_REFUSAL);
	const items = stampDecisions(stored.items, draft.items, await writer.decider(), new Date().toISOString());
	const result = await services.saveApprovalsDraft.execute({ ...draft, items }, save);
	if (result === null) return null;
	const decisions = Object.fromEntries(items.map((item) => [item.id, { decidedBy: item.decidedBy, decidedAt: item.decidedAt }]));
	return { ...result, decisions };
}
