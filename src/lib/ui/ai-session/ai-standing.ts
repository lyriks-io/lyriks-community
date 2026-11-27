import { llmOnRun } from '$domain/retrospec';
import type { ProjectAiStatus } from './project-ai-session.svelte';
import type { RunPresence } from './ai-session-slot.svelte';

/**
 * Where the reader's own AI stands on the project, as Ask my AI shows it at the
 * foot of the navigation (criterion 4cb97f74): the one place that says it, the
 * top bar holding no chip any more. A session speaks for the AI first; with
 * none, the AI of a Reverse-Specification under way, working or gone quiet
 * (criterion bc0f0767); else it is not connected.
 */
export type AiTone = 'off' | 'connecting' | 'listening' | 'working' | 'run' | 'quiet' | 'needs';

export interface AiStanding {
	readonly tone: AiTone;
	/** The word under Ask my AI. */
	readonly word: string;
	/** In session, what the AI does now (the box's Now: line). */
	readonly doing: string | null;
}

export interface AiReading {
	readonly isOpen: boolean;
	readonly status: ProjectAiStatus;
	readonly thinkingAbout: string | null;
	readonly saying: string | null;
	/** With no session: the reader's waker listens, so a click starts their AI (action ccca0911). */
	readonly wakes?: boolean;
	/** With no session: their AI was woken and has not opened its session yet. */
	readonly waking?: boolean;
	/** With no session: their AI was woken and opened no session in time ("The wake runs out"). */
	readonly notWoken?: boolean;
}

/** What Ask my AI's box says once a wake ran out (action be0ba713). */
export const NOT_WOKEN = 'Your AI did not wake: copy the prompt to open it yourself.';

export function aiStanding(live: AiReading | null, run: RunPresence | null): AiStanding {
	if (live?.isOpen) {
		if (live.status === 'thinking') return { tone: 'working', word: 'Working', doing: live.thinkingAbout ? `on ${live.thinkingAbout}` : 'thinking' };
		if (live.status === 'writing') return { tone: 'working', word: 'Working', doing: live.saying ?? 'writing' };
		// Listening only while a call of the AI waits; an open session nothing was heard of yet is connecting.
		if (live.status === 'listening') return { tone: 'listening', word: 'Listening', doing: 'listening' };
		return { tone: 'connecting', word: 'Connecting', doing: 'connecting' };
	}
	// The reader's waker started their AI on a click: it reads waking until its session opens (criterion 7cfc6440).
	if (live?.waking) return { tone: 'connecting', word: 'Waking', doing: 'Waking your AI' };
	if (live?.notWoken) return { tone: 'quiet', word: 'Did not wake', doing: NOT_WOKEN };
	const onRun = run ? llmOnRun(run.seenAt, run.now) : null;
	if (onRun === 'quiet') return { tone: 'quiet', word: 'Check your AI', doing: null };
	if (onRun === 'working') return { tone: 'run', word: 'Working', doing: null };
	if (live?.wakes) return { tone: 'off', word: 'Wakes on click', doing: null };
	return { tone: 'off', word: 'Not connected', doing: null };
}

/** What waits on the reader in Ask my AI: the latest question of their AI, or why it stopped (criterion 31488628). */
export interface WaitingOnReader {
	readonly about: 'question' | 'stopped';
	readonly text: string;
}

/**
 * The reader's AI asked them something on its own or said why it stopped
 * (criterion 31488628): Ask my AI says Needs you, louder than a session that
 * listens or an AI gone quiet, never than an AI at work, whose answer comes.
 */
export function withWaiting(standing: AiStanding, waiting: WaitingOnReader | null): AiStanding {
	if (!waiting || standing.tone === 'working') return standing;
	return { tone: 'needs', word: 'Needs you', doing: `${waiting.about === 'question' ? 'asks you' : 'stopped'}: ${waiting.text}` };
}
