import { getContext, setContext } from 'svelte';
import { invalidateAll } from '$app/navigation';
import { pushToast } from '$ui/design-system';
import { BUILD_FIELD, closeField, fieldKey, NO_SESSION_SENTENCE, TICKET_FIELD, ticketPostPrompt, type AiClickKind, type CloseStep, type StepPrefillSection } from '$domain/evolution';
import type { DossierSummary } from '$lib/server/evolution-view.server';
import { LIVE_SESSION_EVENT, type LiveSessionSignal } from '$lib/shared/live-session';
import { applyEvolution, failureMessage } from './reading-api';
import { copyPrompt } from './copy-prompt';
import { OptimisticActs } from './optimistic-acts.svelte';
import { sessionPrompt } from './session-prompt';

/**
 * The reader's live session with their own AI, as one request page shows it
 * (feat-evo-live-session): what the request holds (the session, the clicks)
 * merged with what the live-sync stream says the AI does right now.
 *
 * Every click reads at once (ac-evo-form-edit-optimistic): a click sent waits
 * for the AI on the page before the server has written it, one withdrawn or
 * cancelled goes, a session ended reads ended, a step prefill runs; a save that
 * fails puts it back as it stood, an error toast saying why.
 */

type Live = DossierSummary['live'];
export type LiveClick = Live['clicks'][number];
/** The reader's latest prefill of a whole step, and the section it is on (ac-evo-live-prefill-step). */
export type LiveStepPrefill = NonNullable<Live['stepPrefill']>;

/** What the header says (ac-evo-live-state); `open` is a session with nothing heard of it yet on this page. */
export type LiveStatus = 'none' | 'open' | 'listening' | 'thinking' | 'writing' | 'cancelled' | 'gone' | 'ended';

export interface ClickTarget {
	readonly fieldPath: string;
	readonly leafId: string | null;
	readonly step?: string;
	/** Every question of the section a prefill covers (ac-evo-live-prefill). */
	readonly section?: readonly string[];
}

/** A click sent from this page that the server has not written yet: its id is the page's own until it is read back. */
export const isUnsentClick = (click: LiveClick): boolean => click.id.startsWith(UNSENT);
const UNSENT = 'unsent:';

/** What a thread needs to reach the reader's AI: why it cannot now, the click a message asked, and the ask itself. */
export interface ThreadAsk {
	readonly refusal: string | null;
	readonly clickOf: (messageId: string) => LiveClick | null;
	readonly run: (body: string, replyTo: string | null) => Promise<boolean>;
}

export class LiveSession {
	presence = $state<LiveSessionSignal | null>(null);
	/** Clicks sent and not read back yet, keyed `unsent:<n>`; clicks withdrawn (`withdrawn:<id>`) or cancelled (`cancelled:<id>`). */
	readonly #clicks = new OptimisticActs<LiveClick | 'withdrawn' | 'cancelled'>();
	/** The session ended from this page, and the step prefill started or stopped, not read back yet. */
	readonly #session = new OptimisticActs<'ended'>();
	readonly #prefill = new OptimisticActs<LiveStepPrefill>();
	#sent = 0;

	constructor(
		private readonly projectId: string,
		private readonly requestId: () => string,
		private readonly title: () => string,
		private readonly saved: () => Live,
		/** Whether the reader may edit the request: Prefill and Draw are theirs only. */
		readonly canEdit: () => boolean
	) {}

	/** The session and its clicks as the request holds them, with what this page sent and has not read back yet. */
	private live(): Live {
		const live = this.saved();
		const acts = this.#clicks.all;
		const sent = Object.values(acts).filter((a): a is LiveClick => typeof a === 'object');
		const ended = this.#session.of('end');
		const prefill = this.#prefill.of('step');
		if (sent.length === 0 && Object.keys(acts).length === 0 && !ended && !prefill) return live;
		const clicks = live.clicks
			.filter((c) => acts[`withdrawn:${c.id}`] !== 'withdrawn')
			.map((c) => (acts[`cancelled:${c.id}`] === 'cancelled' ? { ...c, state: 'cancelled' as const } : c));
		return {
			...live,
			session: ended && live.session ? { ...live.session, open: false, endedAt: new Date().toISOString(), endReason: 'ended_by_person' } : live.session,
			clicks: [...clicks, ...sent],
			stepPrefill: prefill ?? live.stepPrefill
		};
	}

	/** Sends operations on the request, the click's outcome read at once through `act` on `key`; true once saved. */
	#write<T>(acts: OptimisticActs<T>, key: string, act: T, before: (() => Promise<boolean>) | null, operations: Record<string, unknown>[], what: string): Promise<boolean> {
		return acts.run(key, act, async () => (before ? await before() : true) && applyEvolution(this.projectId, operations, { what }), this.saved);
	}

	get session() {
		return this.live().session;
	}

	/** The signal of the session the request holds; one of an earlier session says nothing now. */
	private get now(): LiveSessionSignal | null {
		const s = this.session;
		return s && this.presence?.sessionId === s.id ? this.presence : null;
	}

	get status(): LiveStatus {
		const s = this.session;
		if (!s) return 'none';
		const now = this.now;
		if (now && (now.status === 'gone' || now.status === 'ended')) return now.status;
		if (!s.open) return s.endReason === 'gone' ? 'gone' : 'ended';
		return now?.status ?? 'open';
	}

	get isOpen(): boolean {
		const status = this.status;
		return status !== 'none' && status !== 'gone' && status !== 'ended';
	}

	get thinkingAbout(): string | null {
		return this.now?.thinkingAbout ?? null;
	}

	get saying(): string | null {
		return this.isOpen ? (this.now?.saying ?? null) : null;
	}

	/** The number of the step the AI last announced on the click it is on (ac-evo-live-state). */
	get step(): number | null {
		return this.isOpen ? (this.now?.step ?? null) : null;
	}

	/** Whether the person may cancel what their AI is doing: it is on a click (ac-evo-live-cancel). */
	get canCancel(): boolean {
		return this.status === 'thinking' || this.status === 'writing';
	}

	get endReason() {
		return this.now?.endReason ?? this.session?.endReason ?? null;
	}

	get prompt(): string {
		return sessionPrompt(this.projectId, this.requestId(), this.title());
	}

	/** The latest click sent on a field, waiting, taken or answered in this session (ac-evo-live-click-state). */
	clickOn(target: ClickTarget, kind?: AiClickKind): LiveClick | null {
		const key = fieldKey(target.fieldPath, target.leafId);
		const mine = this.live().clicks.filter((c) => c.fieldKey === key && (!kind || c.kind === kind));
		return mine.length > 0 ? mine[mine.length - 1] : null;
	}

	/**
	 * What the AI does on a click, said where that click was made
	 * (ac-evo-live-click-state): thinking or writing, and its latest step. Null
	 * unless the click is the one in hand and the page has heard of it.
	 */
	progressOf(click: LiveClick | null): { readonly writing: boolean; readonly step: number | null; readonly saying: string | null } | null {
		if (click?.state !== 'taken' || !this.canCancel) return null;
		return { writing: this.status === 'writing', step: this.step, saying: this.saying };
	}

	get stepPrefill(): LiveStepPrefill | null {
		return this.live().stepPrefill;
	}

	/**
	 * Prefill a whole step with the reader's AI (ac-evo-live-prefill-step): the
	 * first section's click waits for the AI, the next ones follow as each one
	 * is settled. Without a session it copies the prompt, like every AI button.
	 */
	async startStepPrefill(step: string, label: string, sections: readonly StepPrefillSection[]): Promise<boolean> {
		if (this.blocked('prefill')) return false;
		const running: LiveStepPrefill = { id: `${UNSENT}step`, step, state: 'running', section: 1, of: sections.length, sectionId: sections[0]?.id ?? '', clickId: '' };
		const sent = await this.#write(this.#prefill, 'step', running, null, [{ op: 'start_step_prefill', requestId: this.requestId(), step, sections }], `the prefill of the ${label}`);
		if (sent && !this.isOpen) await this.copyPrompt(`prefill of the ${label}`);
		else if (sent) pushToast({ level: 'success', message: `Your AI prefills the ${label}, section by section` });
		return sent;
	}

	/** Stop the running step prefill: its waiting click is withdrawn, one in the AI's hands finishes. */
	async stopStepPrefill(): Promise<boolean> {
		const run = this.stepPrefill;
		if (!run) return true;
		return this.#write(this.#prefill, 'step', { ...run, state: 'stopped' }, null, [{ op: 'stop_step_prefill', requestId: this.requestId() }], 'stopping the prefill');
	}

	/** The ask a message of a thread carries, if it was asked of the AI. */
	askOf(messageId: string): LiveClick | null {
		return this.live().clicks.find((c) => c.kind === 'ask' && c.messageId === messageId) ?? null;
	}

	/**
	 * 'Ask your AI' for a thread (ac-evo-live-one-box): asked on the field the
	 * message bears on, it copies the prompt that opens a session when the
	 * reader has none of their own. Read inside a derivation, so the refusal follows the session.
	 */
	asker(targetOf: (replyTo: string | null) => ClickTarget): ThreadAsk {
		return {
			refusal: this.refusal('ask'),
			clickOf: (messageId) => this.askOf(messageId),
			run: (body, replyTo) => this.send('ask', targetOf(replyTo), { body, replyTo })
		};
	}

	/** Why a click cannot be sent now, in the sentence the spec wrote; null when it can. */
	refusal(kind: AiClickKind): string | null {
		if (!this.isOpen) return NO_SESSION_SENTENCE;
		if (kind !== 'ask' && !this.canEdit()) return 'Only who may edit the request prefills or draws; you may still ask in the thread.';
		return null;
	}

	/**
	 * Without a session, an AI button copies the prompt that opens one and says,
	 * first, to paste it in a new conversation (ac-evo-live-no-session);
	 * `waiting` names the click that waits for that session.
	 */
	async copyPrompt(waiting: string | null = null): Promise<void> {
		await copyPrompt(
			sessionPrompt(this.projectId, this.requestId(), this.title(), waiting),
			waiting
				? `Prompt copied: paste it in a new conversation with your AI agent. It opens the session and starts with your ${waiting}.`
				: 'Prompt copied: paste it in a new conversation with your AI agent. It opens the session on this request.'
		);
	}

	/** Says why a click cannot go; false when it can, session or not (ac-evo-live-no-session). */
	private blocked(kind: AiClickKind): boolean {
		if (kind === 'ask' || this.canEdit()) return false;
		pushToast({ level: 'info', message: 'Only who may edit the request prefills or draws; you may still ask in the thread.' });
		return true;
	}

	/** A click as the page reads it while the server writes it: waiting for the AI. */
	#unsent(kind: AiClickKind, target: ClickTarget): { key: string; click: LiveClick } {
		const key = `${UNSENT}${++this.#sent}`;
		return {
			key,
			click: { id: key, kind, fieldKey: fieldKey(target.fieldPath, target.leafId), step: (target.step ?? null) as LiveClick['step'], messageId: null, state: 'waiting', answeredNothing: false, at: new Date().toISOString() }
		};
	}

	/**
	 * Sends a click: it waits for the AI on the page at once. `before` runs
	 * first (the section's editor saved, so the AI reads what was typed); the
	 * click goes only once it did.
	 */
	async send(kind: AiClickKind, target: ClickTarget, ask?: { body: string; replyTo: string | null }, before?: (() => Promise<boolean>) | null): Promise<boolean> {
		if (this.blocked(kind)) return false;
		const { key, click } = this.#unsent(kind, target);
		const sent = await this.#write(
			this.#clicks,
			key,
			click,
			before ?? null,
			[
				{
					op: 'send_click',
					requestId: this.requestId(),
					clickKind: kind,
					fieldPath: target.fieldPath,
					...(target.leafId ? { leafId: target.leafId } : {}),
					...(target.step ? { step: target.step } : {}),
					...(target.section?.length ? { section: target.section } : {}),
					...(ask ? { body: ask.body, ...(ask.replyTo ? { replyTo: ask.replyTo } : {}) } : {})
				}
			],
			kind === 'ask' ? 'your question to your AI' : `your ${WAITING[kind]} click`
		);
		// Without a session, what was clicked waits for the one the copied prompt opens (ac-evo-live-no-session).
		if (sent && !this.isOpen) await this.copyPrompt(kind === 'ask' && ask?.replyTo ? 'reply' : WAITING[kind]);
		else if (sent) pushToast({ level: 'success', message: this.status === 'thinking' ? 'Sent: your AI takes it once it is done with the one in hand' : 'Sent to your AI' });
		return sent;
	}

	/**
	 * Answer the question of a suggestion: kept on it and sent to the AI with its
	 * section, so the AI rewrites it in place and fills the rest (ac-evo-live-card-ask).
	 */
	async answerSuggestion(proposalId: string, body: string, target: ClickTarget, section: readonly string[] = []): Promise<boolean> {
		if (this.blocked('prefill')) return false;
		// The answer goes to the AI as a prefill of the suggestion's answer: it reads waiting for the AI at once.
		const { key, click } = this.#unsent('prefill', target);
		const sent = await this.#write(
			this.#clicks,
			key,
			click,
			null,
			[{ op: 'answer_suggestion', requestId: this.requestId(), proposalId, body, ...(section.length ? { section } : {}) }],
			'your answer to your AI'
		);
		if (sent && !this.isOpen) {
			await this.copyPrompt('answer to its question');
			return sent;
		}
		if (sent) pushToast({ level: 'success', message: this.status === 'thinking' ? 'Sent: your AI takes it once it is done with the one in hand' : 'Sent to your AI: it rewrites the suggestion' });
		return sent;
	}

	/**
	 * Hand the closing message to the reader's AI, to post on the ticket and move
	 * it to done through the tracker connector the person gave it: the platform
	 * calls no tracker. In a session it is a click the AI answers; without one, a
	 * prompt carrying the same instruction is copied, and the AI reports what it
	 * did the same way. `mayEdit` is the reader's role: a closed request still
	 * tells its ticket.
	 */
	async sendTicket(ticketKey: string, message: string, mayEdit: boolean): Promise<boolean> {
		if (!mayEdit) {
			pushToast({ level: 'info', message: 'Only who may edit the request has the ticket told.' });
			return false;
		}
		if (!this.isOpen) {
			await copyPrompt(
				ticketPostPrompt({ projectId: this.projectId, requestId: this.requestId(), ticketKey, message }),
				`Prompt copied: paste it in a conversation with your AI agent. It posts the message on ${ticketKey} and tells Lyriks.`
			);
			return true;
		}
		const { key, click } = this.#unsent('ticket', { fieldPath: TICKET_FIELD, leafId: null });
		const sent = await this.#write(
			this.#clicks,
			key,
			click,
			null,
			[{ op: 'send_click', requestId: this.requestId(), clickKind: 'ticket', fieldPath: TICKET_FIELD, ticketKey, message }],
			'the message for the ticket'
		);
		if (sent) pushToast({ level: 'success', message: `Sent to your AI: it posts the message on ${ticketKey}` });
		return sent;
	}

	/**
	 * Hand the build of the frozen version to the reader's AI at Build: in a
	 * session the brief goes with the click and the AI starts at once; without
	 * one, the brief is copied to paste, as before. False when nothing went.
	 */
	async sendBuild(brief: string): Promise<boolean> {
		if (!this.canEdit()) {
			pushToast({ level: 'info', message: 'Only who may edit the request hands the build to their AI.' });
			return false;
		}
		if (!this.isOpen) {
			await copyPrompt(brief, 'Brief copied: paste it into your LLM');
			return true;
		}
		const { key, click } = this.#unsent('build', { fieldPath: BUILD_FIELD, leafId: null });
		const sent = await this.#write(this.#clicks, key, click, null, [{ op: 'send_click', requestId: this.requestId(), clickKind: 'build', fieldPath: BUILD_FIELD, brief }], 'the build for your AI');
		if (sent) pushToast({ level: 'success', message: this.status === 'thinking' ? 'Sent: your AI takes the build once it is done with the one in hand' : 'Sent to your AI: it builds and proves the version' });
		return sent;
	}

	/**
	 * Hand a step of the close to the reader's AI (ac-evo-verd-steps-to-ai): the
	 * merge and its report, syncing the index again, deleting the merged branch.
	 * In a session the brief goes with the click and the page follows what the
	 * AI reports; without one, the brief is copied to paste. `mayEdit` is the
	 * reader's role: a live request is closed, and still has its branch to
	 * delete and its index to sync. False when nothing went.
	 */
	async sendClose(step: CloseStep, brief: string, mayEdit: boolean): Promise<boolean> {
		if (!mayEdit) {
			pushToast({ level: 'info', message: 'Only who may edit the request hands the close to their AI.' });
			return false;
		}
		if (!this.isOpen) {
			await copyPrompt(brief, 'Brief copied: paste it into your LLM');
			return true;
		}
		const { key, click } = this.#unsent('close', { fieldPath: closeField(step), leafId: null });
		const sent = await this.#write(this.#clicks, key, click, null, [{ op: 'send_click', requestId: this.requestId(), clickKind: 'close', step, brief }], 'the step for your AI');
		if (sent) pushToast({ level: 'success', message: this.status === 'thinking' ? 'Sent: your AI takes it once it is done with the one in hand' : 'Sent to your AI: it carries out the step, the page follows' });
		return sent;
	}

	/** The latest close click of the reader for one step; null when none was sent. */
	closeClick(step: CloseStep): LiveClick | null {
		const key = fieldKey(closeField(step), null);
		return (
			this.live()
				.clicks.filter((c) => c.kind === 'close' && c.fieldKey === key)
				.sort((a, b) => a.at.localeCompare(b.at))
				.at(-1) ?? null
		);
	}

	/** The build clicks of the reader, oldest first, as the page reads them. */
	get buildClicks(): LiveClick[] {
		return this.live().clicks.filter((c) => c.kind === 'build').sort((a, b) => a.at.localeCompare(b.at));
	}

	/** The latest build click of the reader; null when none was sent. */
	get buildClick(): LiveClick | null {
		return this.buildClicks.at(-1) ?? null;
	}

	/** A waiting click withdrawn: it goes from the page at once. */
	async withdraw(clickId: string): Promise<boolean> {
		return this.#write(this.#clicks, `withdrawn:${clickId}`, 'withdrawn', null, [{ op: 'withdraw_click', requestId: this.requestId(), clickId }], 'the withdrawal of your click');
	}

	/** A live act (cancel, end) posted to the live route; true once done and the request read again. */
	async #live(act: 'cancel' | 'end', what: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; summary: string | null }> {
		const res = await fetch('/api/evolution/live', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: this.projectId, requestId: this.requestId(), act, ...extra })
		}).catch(() => null);
		const body = (await res?.json().catch(() => null)) as { summary?: string; results?: { summary?: string; detail?: string }[] } | null;
		if (!res?.ok) {
			const refused = body?.results?.[0];
			pushToast({ level: 'error', message: failureMessage(what, refused?.summary ? `${refused.summary}${refused.detail ? ` ${refused.detail}` : ''}` : `It failed (${res?.status ?? 'network'}).`) });
			return { ok: false, summary: null };
		}
		await invalidateAll();
		return { ok: true, summary: body?.summary ?? null };
	}

	/** Cancel the request the AI is on: what it wrote for it goes back (ac-evo-live-cancel); it reads cancelled at once. */
	async cancel(clickId: string | null = null): Promise<void> {
		let summary: string | null = null;
		const save = async () => {
			const done = await this.#live('cancel', 'the cancellation of what your AI is doing');
			summary = done.summary;
			return done.ok;
		};
		const ok = clickId ? await this.#clicks.run(`cancelled:${clickId}`, 'cancelled', save, this.saved) : await save();
		if (ok) pushToast({ level: 'success', message: summary ?? 'Cancelled: what Lyriks wrote for it is undone' });
	}

	/** Make an exchange with the AI a comment everyone who reads the thread sees (ac-evo-live-ask). */
	async publish(messageId: string): Promise<boolean> {
		return applyEvolution(this.projectId, [{ op: 'publish_exchange', requestId: this.requestId(), messageId }], { what: 'making it a comment' });
	}

	/** End the session: it reads ended at once, your AI stopping once the server has it. */
	async end(): Promise<void> {
		const sessionId = this.session?.id;
		const ok = await this.#session.run('end', 'ended', async () => (await this.#live('end', 'the end of the session', { sessionId })).ok, this.saved);
		if (ok) pushToast({ level: 'success', message: 'Session ended: your AI stops waiting' });
	}

	/** Follow the stream and read what this page has not heard yet. Returns the teardown. */
	listen(): () => void {
		const onSignal = (event: Event) => {
			const { detail } = event as CustomEvent<LiveSessionSignal>;
			if (detail.requestId === this.requestId()) this.presence = detail;
		};
		window.addEventListener(LIVE_SESSION_EVENT, onSignal);
		const query = new URLSearchParams({ projectId: this.projectId, requestId: this.requestId() });
		void fetch(`/api/evolution/live?${query}`)
			.then((res) => (res.ok ? res.json() : null))
			.then((body: { presence?: LiveSessionSignal | null } | null) => {
				if (body?.presence && !this.presence) this.presence = body.presence;
			})
			.catch(() => {});
		return () => window.removeEventListener(LIVE_SESSION_EVENT, onSignal);
	}
}

/** What a click made before any session is, in the prompt that opens one. */
const WAITING: Record<AiClickKind, string> = { prefill: 'prefill', draw: 'drawing', ask: 'question', ticket: 'message for the ticket', build: 'build', close: 'step of the close' };

const KEY = Symbol('live-session');

export function provideLiveSession(session: LiveSession): void {
	setContext(KEY, session);
}

/** The page's live session; null outside a request page. */
export function useLiveSession(): LiveSession | null {
	return getContext<LiveSession | undefined>(KEY) ?? null;
}
