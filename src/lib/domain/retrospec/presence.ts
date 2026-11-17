/**
 * Whether the person's AI reads as connected to a project, from when it last
 * called Lyriks about it: the Source step of a retrospecification, its live
 * analysis and the "Create your project" dialog say it the same way. Only a
 * call naming the project counts; nothing else tells which project an AI is on.
 */

/** How long after its last call the AI still reads as connected: a provisional constant, to measure on real runs. */
export const CONNECTED_MS = 3 * 60_000;
/** How long after a call the AI reads as working on it, not only connected: a provisional constant, to measure on real runs. */
export const WORKING_MS = 45_000;

/** What the person reads of their AI: gone or never seen, connected, or at work right now. */
export type AiPresence = 'disconnected' | 'connected' | 'working';

/** How long the AI has been silent on the project, null when it never called. */
export function aiSilentFor(seenAt: string | null, now: number): number | null {
	return seenAt ? Math.max(0, now - Date.parse(seenAt)) : null;
}

/** The AI called about the project recently enough to read as connected. */
export function aiConnected(seenAt: string | null, now: number): boolean {
	const silent = aiSilentFor(seenAt, now);
	return silent !== null && silent < CONNECTED_MS;
}

export function aiPresence(seenAt: string | null, now: number): AiPresence {
	const silent = aiSilentFor(seenAt, now);
	if (silent === null || silent >= CONNECTED_MS) return 'disconnected';
	return silent < WORKING_MS ? 'working' : 'connected';
}

/**
 * The person's LLM on a running retrospecification, as the floating chip reads
 * it (ac-ai-session-approvals): still connected but past WORKING_MS without a
 * call, it is quiet, and its window may be asking the person to allow a Lyriks
 * tool. Lyriks never sees that question, only the silence it leaves.
 */
export type LlmOnRun = 'working' | 'quiet' | 'disconnected';

export function llmOnRun(seenAt: string | null, now: number): LlmOnRun {
	const presence = aiPresence(seenAt, now);
	return presence === 'connected' ? 'quiet' : presence;
}

/**
 * A running retrospecification whose LLM reads disconnected is paused: the app
 * bar, the live analysis and Home stop saying it is at work (criterion
 * 7a4a99e4). A quiet LLM may be waiting on the person: its run still reads live.
 */
export const runPaused = (seenAt: string | null, now: number): boolean => llmOnRun(seenAt, now) === 'disconnected';
