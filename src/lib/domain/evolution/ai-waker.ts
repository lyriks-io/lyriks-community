/**
 * The person's waker on a project (feat-ai-session): a program of their own
 * machine, started once by their AI from the waking command, that waits for
 * their clicks and starts their AI without a window when one waits and none
 * of their AIs is in session, so a click needs no prompt. What it is now and
 * where its last wake stands are read from when it was last heard and when a
 * wake was handed; nothing of it is saved. Pure.
 */

/** The numbers of the waker, as the spec declares them (constants of feat-ai-session). */
export const AI_WAKER = {
	/**
	 * PROVISIONAL: how long a woken AI has to open its session once its waker was
	 * handed the wake (Claude Code started without a window, connected to the
	 * Lyriks MCP, then opening its session); measured on real starts before it is settled.
	 */
	wakeOpenSeconds: 180,
	/**
	 * PROVISIONAL: how long the waker may go unheard before it reads gone. It calls
	 * again at once after every hold of withoutProgressSeconds (50), so this is two
	 * holds missed; it stays above withoutProgressSeconds.
	 */
	wakerGoneSeconds: 120
} as const;

/** Whether the person's waker listens: none before one was heard, gone once unheard for wakerGoneSeconds. */
export type WakerStatus = 'none' | 'listening' | 'gone';

/** Where the person's last wake stands. */
export type WakeState = 'none' | 'handed' | 'opened' | 'not_woken';

const ageMs = (at: string, nowMs: number) => nowMs - Date.parse(at);

/** "Keep my waker listening" and "Mark a silent waker gone", read from when the waker was last heard. */
export function wakerStatusOf(heardAt: string | null, nowMs: number): WakerStatus {
	if (!heardAt) return 'none';
	return ageMs(heardAt, nowMs) < AI_WAKER.wakerGoneSeconds * 1000 ? 'listening' : 'gone';
}

/**
 * Where the last wake stands ("Record that the woken AI opened its session",
 * "The wake runs out"): opened once a session of the person started after it
 * was handed, not woken once wakeOpenSeconds passed without one.
 */
export function wakeStateOf(handedAt: string | null, sessionStartedAts: readonly string[], nowMs: number): WakeState {
	if (!handedAt) return 'none';
	if (sessionStartedAts.some((at) => at > handedAt)) return 'opened';
	return ageMs(handedAt, nowMs) >= AI_WAKER.wakeOpenSeconds * 1000 ? 'not_woken' : 'handed';
}

/** What decides a wake, as the server reads it for one person on one project. */
export interface WakeFacts {
	/** When each click of the person still waiting for their AI was made, on any page. */
	readonly waitingClickAts: readonly string[];
	/** How many sessions of the person's AIs are open on the project. */
	readonly sessionsOpen: number;
	readonly waker: WakerStatus;
	readonly wake: WakeState;
	/** When the last wake was handed, if any. */
	readonly handedAt: string | null;
}

/** The refusals of "Wake my AI", in the spec's words. */
export const WAKE_REFUSALS = {
	nothingWaits: 'Nothing waits for the AI.',
	inSession: 'An AI of the person is in session: the click goes to it.',
	noWaker: 'No waker listens: the click waits for the next session the person opens from the prompt.',
	waking: 'The AI is already waking.',
	notWoken: 'Your AI did not wake for these clicks: a new click, or the prompt, tries again.'
} as const;

/**
 * Whether the waker is handed a wake now ("Wake my AI", action ccca0911): a
 * click waits, no AI of the person is in session (a session in progress takes
 * the click), the waker listens, no wake is under way, and after a wake that
 * ran out only a click made since tries again (rule ff868097), so a start that
 * fails never loops on its own. Null when it is; the refusal otherwise.
 */
export function wakeRefusal(facts: WakeFacts): string | null {
	if (facts.waitingClickAts.length === 0) return WAKE_REFUSALS.nothingWaits;
	if (facts.sessionsOpen > 0) return WAKE_REFUSALS.inSession;
	if (facts.waker !== 'listening') return WAKE_REFUSALS.noWaker;
	if (facts.wake === 'handed') return WAKE_REFUSALS.waking;
	const handedAt = facts.handedAt;
	if (facts.wake === 'not_woken' && handedAt && !facts.waitingClickAts.some((at) => at > handedAt)) return WAKE_REFUSALS.notWoken;
	return null;
}
