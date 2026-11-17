import {
	applyDiscussionAct,
	parseDiscussions,
	type DiscussionAct,
	type DiscussionAuthor,
	type DiscussionThread,
	type DiscussionsDocument
} from '$domain/discussions';
import type { ClockPort } from '../ports/clock';
import type { SectionDocumentStorePort } from '../ports/section-documents';

export type ActOnDiscussionResult =
	| {
			readonly ok: true;
			readonly document: DiscussionsDocument;
			readonly revision: number;
			readonly thread: DiscussionThread;
	  }
	| { readonly ok: false; readonly refusal: string; readonly conflict: boolean };

/** How many times a write is replayed on a newer document before giving up. */
const ATTEMPTS = 4;

/**
 * One person's act in a discussion (open, reply, resolve, reopen), written
 * with the store's optimistic revision. The act, not a whole document, travels
 * from the page: when someone else wrote in between, the act is replayed on
 * the newer document instead of overwriting it, so two people posting at the
 * same moment both land. The save publishes the section change, which is what
 * refreshes the other open tabs.
 */
export class ActOnDiscussionUseCase {
	constructor(
		private readonly store: SectionDocumentStorePort,
		private readonly section: string,
		private readonly clock: ClockPort,
		private readonly newId: () => string
	) {}

	async execute(
		projectId: string,
		act: DiscussionAct,
		author: DiscussionAuthor,
		origin: string | null
	): Promise<ActOnDiscussionResult> {
		// The ids are drawn once, so a replay after a conflict writes the same thread and message.
		const ids = { threadId: this.newId(), messageId: this.newId() };
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			const revision = await this.store.currentRevision(projectId, this.section);
			const current = parseDiscussions(await this.store.load(projectId, this.section));
			const outcome = applyDiscussionAct(current, act, { author, at: this.clock.nowIso(), ...ids });
			if (!outcome.ok) return { ok: false, refusal: outcome.refusal, conflict: false };
			const saved = await this.store.save(projectId, this.section, outcome.document, revision, origin);
			if (saved !== null) return { ok: true, document: outcome.document, revision: saved, thread: outcome.thread };
		}
		return { ok: false, refusal: 'Others are writing here right now. Try again.', conflict: true };
	}
}
