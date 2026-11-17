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
export type AiTone = 'off' | 'connecting' | 'listening' | 'working' | 'run' | 'quiet';

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
}

export function aiStanding(live: AiReading | null, run: RunPresence | null): AiStanding {
	if (live?.isOpen) {
		if (live.status === 'thinking') return { tone: 'working', word: 'Working', doing: live.thinkingAbout ? `on ${live.thinkingAbout}` : 'thinking' };
		if (live.status === 'writing') return { tone: 'working', word: 'Working', doing: live.saying ?? 'writing' };
		// Listening only while a call of the AI waits; an open session nothing was heard of yet is connecting.
		if (live.status === 'listening') return { tone: 'listening', word: 'Listening', doing: 'listening' };
		return { tone: 'connecting', word: 'Connecting', doing: 'connecting' };
	}
	const onRun = run ? llmOnRun(run.seenAt, run.now) : null;
	if (onRun === 'quiet') return { tone: 'quiet', word: 'Check your AI', doing: null };
	if (onRun === 'working') return { tone: 'run', word: 'Working', doing: null };
	return { tone: 'off', word: 'Not connected', doing: null };
}
