import { applyDiscussionAct, type ActContext, type DiscussionAct, type DiscussionsDocument } from '$domain/discussions';

/**
 * The discussions as the page shows them: the saved document, then each act
 * still on its way applied by the domain's own rules. A thread opened here
 * reads under a local id until saved; an act on it names it by the id the
 * server gave it once there is one (`ids`). An act the rules refuse on the
 * document as it now reads is left out. Pure.
 */
export interface PendingDiscussionAct {
	readonly act: DiscussionAct;
	readonly ctx: ActContext;
}

export function resolvedAct(act: DiscussionAct, ids: Readonly<Record<string, string>>): DiscussionAct {
	return act.kind === 'open' ? act : { ...act, threadId: ids[act.threadId] ?? act.threadId };
}

export function shownDiscussions(saved: DiscussionsDocument, pending: readonly PendingDiscussionAct[], ids: Readonly<Record<string, string>>): DiscussionsDocument {
	let doc = saved;
	for (const p of pending) {
		const outcome = applyDiscussionAct(doc, resolvedAct(p.act, ids), p.ctx);
		if (outcome.ok) doc = outcome.document;
	}
	return doc;
}
