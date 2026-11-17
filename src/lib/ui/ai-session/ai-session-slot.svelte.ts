import type { ProjectAiSession } from './project-ai-session.svelte';

/**
 * The person's LLM on a retrospecification under way, as its page reads it
 * (ac-ai-session-disconnected): when it last called Lyriks about the project,
 * and now (ticking, so the reading ages honestly). The prompt that resumes a
 * run whose LLM went silent is the live analysis's own.
 */
export interface RunPresence {
	readonly seenAt: string | null;
	readonly now: number;
}

/**
 * The session of the project on screen, and a running retrospecification's
 * LLM, for Ask my AI in the navigation (criterion 4cb97f74): the project
 * layout puts its session here while it is mounted, and the Reverse page its
 * run's LLM.
 */
class AiSessionSlot {
	session = $state<ProjectAiSession | null>(null);
	run = $state<RunPresence | null>(null);
}

export const aiSessionSlot = new AiSessionSlot();
