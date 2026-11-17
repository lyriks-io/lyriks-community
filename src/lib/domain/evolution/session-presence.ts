import type { EvolutionRequest } from './draft';
import { personKey } from './named-validators';
import type { LiveSession } from './live-session';

/**
 * Whose AI is at work on a request right now: a session still open whose AI
 * acted lately. An open session alone is not enough (a client that crashed
 * leaves one open until it is noticed gone), so the last act of the person's AI
 * on the request, or the opening, must be recent.
 */

/** How recent the AI's last act must be for its session to read in progress. */
export const LIVE_WINDOW_MS = 30 * 60 * 1000;

const lastAiAct = (request: Pick<EvolutionRequest, 'aiClicks'>, personId: string): number =>
	Math.max(
		0,
		...(request.aiClicks ?? [])
			.filter((c) => personKey(c.personId) === personKey(personId))
			.flatMap((c) => [c.at, c.takenAt, c.answeredAt])
			.filter((t): t is string => !!t)
			.map((t) => Date.parse(t))
	);

/** The sessions in progress on a request, one per person. */
export function sessionsInProgress(request: Pick<EvolutionRequest, 'liveSessions' | 'aiClicks'>, now: number): LiveSession[] {
	return (request.liveSessions ?? []).filter(
		(s) => !s.endedAt && now - Math.max(Date.parse(s.startedAt), lastAiAct(request, s.personId)) <= LIVE_WINDOW_MS
	);
}
