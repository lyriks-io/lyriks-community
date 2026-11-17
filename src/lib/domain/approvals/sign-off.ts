import type { ApprovalDecider, ApprovalItem } from './draft';
import { SETTLED_APPROVAL_STATUSES } from './enums';

/**
 * Who signed off what, and when (criteria of Track sign-offs and accepted
 * risks): the stamp of a status change comes from the server, never from what
 * the page or a program sends, and a sign-off is a person's.
 */

/** The refusal an AI client reads when it tries to settle an approval itself. */
export const AI_SIGN_OFF_REFUSAL = 'Only a person signs off an approval: file it In review and ask a person to approve it.';

/**
 * The approvals a write would move to Approved or Accepted risk, or add with
 * one of them: what only a person may do. An approval already settled and sent
 * back unchanged is not among them.
 */
export function settledByWrite(stored: readonly ApprovalItem[], incoming: readonly ApprovalItem[]): ApprovalItem[] {
	const before = new Map(stored.map((item) => [item.id, item.status]));
	return incoming.filter((item) => SETTLED_APPROVAL_STATUSES.includes(item.status) && before.get(item.id) !== item.status);
}

/**
 * The worklist as it is saved: an approval whose status moved (or a new one
 * filed past Draft) is stamped with the person and the time of this write;
 * any other keeps the stamp stored with it, whatever the caller sent.
 */
export function stampDecisions(stored: readonly ApprovalItem[], incoming: readonly ApprovalItem[], decider: ApprovalDecider, now: string): ApprovalItem[] {
	const before = new Map(stored.map((item) => [item.id, item]));
	return incoming.map((item) => {
		const previous = before.get(item.id);
		const moved = previous ? previous.status !== item.status : item.status !== 'draft';
		if (moved) return { ...item, decidedBy: { id: decider.id, name: decider.name }, decidedAt: now };
		return { ...item, decidedBy: previous?.decidedBy ?? null, decidedAt: previous?.decidedAt ?? null };
	});
}
