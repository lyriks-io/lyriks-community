import { invalidate } from '$app/navigation';
import { pushToast } from '$ui/design-system';
import { clientId } from '$ui/shell/live-sync.client';
import { SaveQueue, refusalOf } from '$ui/shell/save-queue';
import { RETROSPEC_SECTION } from '$domain/retrospec';
import { sectionSyncKey } from '$lib/shared/section-sync';
import type { DriftChangeView, DriftDecisionView } from '$lib/shared/code-drift-page';

/**
 * The decisions of the Code drift page (criteria 53e7e3da, 537e1684): accept a
 * change as it is (a version records it, the spec's words unchanged), reject it and ask for the code to be restored, or take
 * the decision back. Each click reads at once and is saved behind, in the
 * order it was made, through the validation of the Specification 360° (only
 * the change's key travels: the server reads the code and captures the
 * version itself); a refusal takes it back and says why.
 */

export type DriftAct = 'keep_drift' | 'send_back_drift' | 'undo_drift';
type Act = DriftAct;

const WHAT: Readonly<Record<Act, string>> = {
	keep_drift: 'Accepting this change',
	send_back_drift: 'Rejecting this change',
	undo_drift: 'Undoing this decision'
};
const WHAT_MANY: Readonly<Record<Act, string>> = {
	keep_drift: 'Accepting these changes',
	send_back_drift: 'Marking these changes as a mistake',
	undo_drift: 'Undoing this decision'
};

export interface DriftReviewSource {
	readonly projectId: string;
	readonly canWrite: boolean;
	readonly me: string;
	readonly changes: readonly DriftChangeView[];
}

export class DriftReview {
	readonly #source: () => DriftReviewSource;
	readonly #queue = new SaveQueue();
	/** The decisions on their way, by change key (`shown` null: one taken back); the latest click on a change wins. */
	#pending = $state<Record<string, { readonly id: number; readonly shown: DriftDecisionView | null }>>({});
	#sequence = 0;

	constructor(source: () => DriftReviewSource) {
		this.#source = source;
	}

	get canWrite(): boolean {
		return this.#source().canWrite;
	}

	/** The decision a change reads with: the one on its way, else the saved one. */
	decisionOf(change: DriftChangeView): DriftDecisionView | null {
		const pending = this.#pending[change.key];
		return pending ? pending.shown : change.decision;
	}

	/** Every change with the decision it reads with. */
	readonly counts = $derived.by(() => {
		const out = { total: 0, accepted: 0, rejected: 0, pending: 0 };
		for (const c of this.#source().changes) {
			const d = this.decisionOf(c);
			out.total++;
			if (!d) out.pending++;
			else if (d.decision === 'kept') out.accepted++;
			else out.rejected++;
		}
		return out;
	});

	accept(change: DriftChangeView): Promise<boolean> {
		return this.#decide(change, 'keep_drift', { decision: 'kept', by: this.#source().me, at: new Date().toISOString(), version: null });
	}

	reject(change: DriftChangeView): Promise<boolean> {
		return this.#decide(change, 'send_back_drift', { decision: 'sent_back', by: this.#source().me, at: new Date().toISOString(), version: null });
	}

	undo(change: DriftChangeView): Promise<boolean> {
		return this.#decide(change, 'undo_drift', null);
	}

	async #decide(change: DriftChangeView, op: Act, shown: DriftDecisionView | null): Promise<boolean> {
		const { projectId, canWrite } = this.#source();
		if (!canWrite) {
			pushToast({ level: 'info', message: 'You can read the code drift, not decide on it: ask a project editor.' });
			return false;
		}
		const id = ++this.#sequence;
		this.#pending = { ...this.#pending, [change.key]: { id, shown } };
		try {
			return await this.#queue.run(() => postDriftActs(projectId, op, [change.key]));
		} finally {
			// Read back by now (or refused): the saved decision speaks again, unless a later click on the change is still on its way.
			if (this.#pending[change.key]?.id === id) this.#pending = Object.fromEntries(Object.entries(this.#pending).filter(([key]) => key !== change.key));
		}
	}
}

/**
 * Send one decision on one or several changes in one request, so the changes
 * kept together capture one version (criterion d18e3e74); true once saved and
 * read back. Shared by the Code drift page and Home.
 */
export async function postDriftActs(projectId: string, op: DriftAct, keys: readonly string[]): Promise<boolean> {
	const what = keys.length > 1 ? WHAT_MANY[op] : WHAT[op];
	let res: Response;
	try {
		res = await fetch(`/projects/${encodeURIComponent(projectId)}/spec/validation`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
			body: JSON.stringify({ acts: keys.map((key) => ({ op, key })) })
		});
	} catch {
		pushToast({ level: 'error', message: `${what} was not saved. Check your connection.` });
		return false;
	}
	if (!res.ok) {
		pushToast({ level: 'error', message: `${what} was not saved. ${await refusalOf(res, 'The decision failed')}` });
		return false;
	}
	// Our own write never echoes back on the live stream: read it ourselves (the review and the version it captured).
	await Promise.all([invalidate(sectionSyncKey(projectId, RETROSPEC_SECTION)), invalidate(sectionSyncKey(projectId, 'baselines'))]);
	return true;
}
