/**
 * What a person's AI is doing in a live session on one Evolution request, as
 * the live-sync stream carries it to that person's pages, and only theirs
 * (ac-evo-live-state, ac-evo-live-one-agent). Nothing here is saved: the
 * session and the clicks are on the request; this says what happens now.
 */
/** The presence key of the person's waker on a project, apart from every session's (feat-ai-session, "Keep my waker listening"). */
export const WAKER_KEY = '~waker';

export type LivePresenceStatus = 'listening' | 'thinking' | 'writing' | 'cancelled' | 'gone' | 'ended';

export interface LiveSessionSignal {
	readonly requestId: string;
	/** The person whose AI holds the session. */
	readonly personId: string;
	readonly sessionId: string;
	readonly status: LivePresenceStatus;
	/** The click the AI thinks about, in the page's words; null when it holds none. */
	readonly thinkingAbout: string | null;
	/** The latest step the AI announced on the click it is on, in one sentence (ac-evo-live-state). */
	readonly saying: string | null;
	/** That step's number, counted from the click it took; null before its first step. */
	readonly step: number | null;
	/** Why the session ended, once it did. */
	readonly endReason: 'ended_by_person' | 'idle' | 'gone' | 'replaced' | 'finished' | null;
	/**
	 * A waiting call of the AI is held right now (EVO-015): what makes the AI free
	 * to take a click, read on every node through the bus; said again at each
	 * beat of the wait, so a signal no longer refreshed stops counting.
	 */
	readonly callHeld?: boolean;
	/**
	 * On the signal of the person's waker only (requestId WAKER_KEY): when it was
	 * last handed a wake, kept until the next one, so every node reads the AI
	 * waking, woken, or not woken (feat-ai-session, "Wake my AI").
	 */
	readonly wakeHandedAt?: string | null;
	readonly at: string;
}

/** The window event the live-sync client re-emits each signal under. */
export const LIVE_SESSION_EVENT = 'lyriks:live-session';
