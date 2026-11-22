import { getContext, setContext } from 'svelte';
import { pushToast } from '$ui/design-system';
import type { ProjectClick, ProjectClickInput } from '$domain/evolution';
import { LIVE_SESSION_EVENT, type LiveSessionSignal } from '$lib/shared/live-session';
import { SECTION_CHANGE_EVENT } from '$ui/shell/live-sync.client';
import { copyPrompt } from '$ui/evolution/copy-prompt';
import { projectSessionPrompt } from '$ui/evolution/session-prompt';

/**
 * The reader's session with their own AI on the whole project, as every page
 * of it reads it (feat-ai-session): the chip at the right of the top bar,
 * published there through aiSessionSlot since it sits above the project's pages, and the
 * clicks made outside a request (a question on a block, a re-reading of the code), each
 * where it was made. One instance for the project, provided by its layout.
 * The layout outlives a move to another project in the same tab, so the
 * instance reads the project on screen each time and starts over when it
 * changes: a session fixed on the first project opened put its id beside
 * the next project's name in the prompt, and sent the clicks there.
 */

/** What the chip of the top bar says (ac-ai-session-band); `open` is a session nothing was heard of yet on this page. */
export type ProjectAiStatus = 'none' | 'open' | 'listening' | 'thinking' | 'writing' | 'cancelled' | 'gone' | 'ended';

/** One AI of the reader in session on the project, as the server reads it (EVO-015). */
interface SessionRow {
	readonly id: string;
	/** Its client and what it holds, as Claude Code · EVO-014. */
	readonly name: string;
	readonly startedAt: string;
	readonly presence: LiveSessionSignal | null;
}

interface Reading {
	readonly session: {
		readonly id: string;
		readonly open: boolean;
		readonly startedAt: string;
		readonly endReason: string | null;
	} | null;
	readonly presence: LiveSessionSignal | null;
	/** Every open session of the reader, newest first; absent from a server older than several AIs. */
	readonly sessions?: readonly SessionRow[];
	readonly clicks: readonly ProjectClick[];
}

/** One line of Ask my AI's box: an AI of the reader in session, its name, since when and what it does now (criterion 39e1abc1). */
export interface AiInSession {
	readonly id: string;
	readonly name: string;
	readonly startedAt: string;
	readonly status: ProjectAiStatus;
	readonly thinkingAbout: string | null;
	readonly saying: string | null;
}

/** How active a status reads, so Ask my AI's word says the most active AI of the reader (criterion 4cb97f74). */
const ACTIVITY: Partial<Record<ProjectAiStatus, number>> = { thinking: 3, writing: 3, cancelled: 3, listening: 2, open: 1 };

/** The presence key of the session of the whole project, beside the requests' own. */
const PROJECT_KEY = '';
const NO_SESSION = 'No session with your AI yet: a click copies the prompt that opens one.';
const COPIED = 'Prompt copied: paste it in a new conversation with your AI agent, then stay on the page.';
const WAITING: Record<ProjectClick['kind'], string> = {
	chat: 'message in Ask my AI',
	ask_block: 'question',
	reread: 'request to re-read the code',
	run: 'Reverse-Specification to run',
	resume: 'Reverse-Specification to resume',
	question: 'question of another AI'
};

export class ProjectAiSession {
	reading = $state<Reading | null>(null);
	presence = $state<LiveSessionSignal | null>(null);
	/** What each AI of the reader said last on this page's stream, by session (EVO-015). */
	#presences = $state<Record<string, LiveSessionSignal>>({});
	/** Sessions ended from this page and not read back yet. */
	#endedIds = $state<string[]>([]);
	/** Clicks sent from this page and not read back yet, so they read waiting at once. */
	#sent = $state<ProjectClick[]>([]);

	constructor(
		/** The project on screen, read each time (ac-ai-session-project). */
		private readonly projectOf: () => string,
		private readonly projectName: () => string,
		/** Whether the reader may edit the project: a re-reading is theirs only. */
		readonly canEdit: () => boolean,
		/** The edition the installation runs: on Community the prompt sends the AI to no playbook it lacks (EVO-008). */
		private readonly edition: () => string | null = () => null
	) {}

	get projectId(): string {
		return this.projectOf();
	}

	get session() {
		const s = this.reading?.session ?? null;
		return s && this.#endedIds.includes(s.id) ? { ...s, open: false, endReason: 'ended_by_person' } : s;
	}

	/** The AIs of the reader in session on the project, newest first, each with what it does now (criterion 39e1abc1). */
	get aiSessions(): AiInSession[] {
		const rows = this.reading?.sessions ?? [];
		return rows
			.filter((row) => !this.#endedIds.includes(row.id))
			.map((row) => {
				const now = this.#presences[row.id] ?? row.presence;
				return {
					id: row.id,
					name: row.name,
					startedAt: row.startedAt,
					status: (now?.status ?? 'open') as ProjectAiStatus,
					thinkingAbout: now?.thinkingAbout ?? null,
					saying: now?.saying ?? null
				};
			})
			.filter((ai) => ai.status !== 'gone' && ai.status !== 'ended');
	}

	/** The most active AI of the reader in session: the one Ask my AI's word speaks for. */
	private get leading(): AiInSession | null {
		return [...this.aiSessions].sort((a, b) => (ACTIVITY[b.status] ?? 0) - (ACTIVITY[a.status] ?? 0))[0] ?? null;
	}

	private get now(): LiveSessionSignal | null {
		const s = this.session;
		const now = (s ? this.#presences[s.id] : null) ?? this.presence ?? this.reading?.presence ?? null;
		return s && now?.sessionId === s.id ? now : null;
	}

	get status(): ProjectAiStatus {
		const leading = this.leading;
		if (leading) return leading.status;
		const s = this.session;
		if (!s) return 'none';
		const now = this.now;
		if (now && (now.status === 'gone' || now.status === 'ended')) return now.status;
		if (!s.open || this.reading?.sessions) return s.endReason === 'gone' ? 'gone' : 'ended';
		return now?.status ?? 'open';
	}

	get isOpen(): boolean {
		const status = this.status;
		return status !== 'none' && status !== 'gone' && status !== 'ended';
	}

	/** An AI of the reader listens or works now: a session opened where no call of its AI was heard does not count (rule 1e796d88). */
	get listening(): boolean {
		const status = this.status;
		return status === 'listening' || status === 'thinking' || status === 'writing';
	}

	get thinkingAbout(): string | null {
		return this.leading ? this.leading.thinkingAbout : (this.now?.thinkingAbout ?? null);
	}

	get saying(): string | null {
		return this.leading ? this.leading.saying : (this.now?.saying ?? null);
	}

	/** The latest click of the reader on a place, sent from here or read back. */
	clickOn(kind: ProjectClick['kind'], anchor: string): ProjectClick | null {
		const all = [...(this.reading?.clicks ?? []), ...this.#sent].filter((c) => c.kind === kind && c.anchor === anchor);
		return all.sort((a, b) => a.at.localeCompare(b.at)).pop() ?? null;
	}

	/** The click a message of a thread asked, if any. */
	clickOfMessage(messageId: string): ProjectClick | null {
		return (this.reading?.clicks ?? []).find((c) => c.kind === 'ask_block' && c.messageId === messageId) ?? null;
	}

	/** Why an AI button reads greyed: no session of the reader's own (ac-ai-session-ask-block). */
	get refusal(): string | null {
		return this.isOpen ? null : NO_SESSION;
	}

	/** The prompt that opens a session, copied by a click made without one (ac-ai-session-project). */
	prompt(waiting: string | null = null): string {
		return projectSessionPrompt(this.projectId, this.projectName(), { waiting, edition: this.edition() });
	}

	async refresh(): Promise<void> {
		const projectId = this.projectId;
		const res = await fetch(`/api/evolution/live?${new URLSearchParams({ projectId })}`).catch(() => null);
		if (!res?.ok) return;
		const reading = (await res.json()) as Reading;
		// A reading of the project left meanwhile is not this one's.
		if (projectId !== this.projectId) return;
		this.reading = reading;
		const known = new Set(this.reading.clicks.map((c) => c.at));
		this.#sent = this.#sent.filter((c) => !known.has(c.at));
		// A session read back is as the server says: still open, or gone from the list.
		const open = new Set((reading.sessions ?? []).map((s) => s.id));
		this.#endedIds = this.#endedIds.filter((id) => !open.has(id) && id !== reading.session?.id);
	}

	async #post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
		const res = await fetch('/api/evolution/live', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: this.projectId, ...body })
		}).catch(() => null);
		const answer = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
		if (!res?.ok || answer?.ok === false) {
			pushToast({ level: 'error', message: String(answer?.reason ?? answer?.message ?? 'Lyriks could not reach the server: try again.') });
			return null;
		}
		return answer;
	}

	/**
	 * End one AI's session from Ask my AI's box: it leaves the list at once, the
	 * reader's other AIs stay ("End the session"); the newest when none is named.
	 */
	async end(sessionId: string | undefined = this.aiSessions[0]?.id ?? this.session?.id): Promise<void> {
		if (!sessionId) return;
		this.#endedIds = [...this.#endedIds, sessionId];
		const done = await this.#post({ act: 'end', sessionId });
		if (!done) this.#endedIds = this.#endedIds.filter((id) => id !== sessionId);
		else pushToast({ level: 'success', message: 'Session ended: your AI stops waiting' });
		await this.refresh();
	}

	/**
	 * Send a click outside a request: it reads waiting at once; without a
	 * session, the prompt that opens one is copied and the click waits for it
	 * (ac-ai-session-ask-block, ac-ai-session-reread).
	 */
	async send(input: ProjectClickInput): Promise<boolean> {
		const unsent: ProjectClick = { ...input, id: `unsent:${Date.now()}`, personId: '', at: new Date().toISOString(), state: 'waiting' };
		this.#sent = [...this.#sent, unsent];
		const open = this.isOpen;
		const answer = await this.#post({ act: 'click', ...input });
		this.#sent = this.#sent.filter((c) => c !== unsent);
		if (!answer) return false;
		await this.refresh();
		if (!open) await copyPrompt(this.prompt(WAITING[input.kind]), COPIED);
		return true;
	}

	/**
	 * The prompt that opens a session, for a message of Ask my AI no AI listens
	 * to (rule 1e796d88, action 164257ae). Called at the press itself, before
	 * any request, while the browser still lets the page write to the clipboard.
	 */
	copyChatPrompt(): Promise<void> {
		return copyPrompt(this.prompt(WAITING.chat), COPIED);
	}

	async withdraw(clickId: string): Promise<void> {
		await this.#post({ act: 'withdraw', clickId });
		await this.refresh();
	}

	/**
	 * Follow the stream: what the AI does, and the clicks it answered. Returns
	 * the teardown. Run in an effect, it reads the project on screen, so a move
	 * to another project tears it down and starts it over from nothing.
	 */
	listen(): () => void {
		void this.projectId;
		this.reading = null;
		this.presence = null;
		this.#presences = {};
		this.#endedIds = [];
		this.#sent = [];
		const onSignal = (event: Event) => {
			const { detail } = event as CustomEvent<LiveSessionSignal>;
			if (detail.requestId !== PROJECT_KEY) return;
			const before = this.#presences[detail.sessionId];
			// Each AI of the reader speaks for its own session (EVO-015); a new one or a new status reads the list again.
			const changed = before?.status !== detail.status || !(this.reading?.sessions ?? []).some((s) => s.id === detail.sessionId);
			this.#presences = { ...this.#presences, [detail.sessionId]: detail };
			this.presence = detail;
			if (changed) void this.refresh();
		};
		const onSection = (event: Event) => {
			if ((event as CustomEvent<string>).detail === 'evolution') void this.refresh();
		};
		window.addEventListener(LIVE_SESSION_EVENT, onSignal);
		window.addEventListener(SECTION_CHANGE_EVENT, onSection);
		void this.refresh();
		return () => {
			window.removeEventListener(LIVE_SESSION_EVENT, onSignal);
			window.removeEventListener(SECTION_CHANGE_EVENT, onSection);
		};
	}
}

const KEY = Symbol('project-ai-session');

export function provideProjectAiSession(session: ProjectAiSession): void {
	setContext(KEY, session);
}

/** The project's AI session; null outside a project. */
export function useProjectAiSession(): ProjectAiSession | null {
	return getContext<ProjectAiSession | undefined>(KEY) ?? null;
}
