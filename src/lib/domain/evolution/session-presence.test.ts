import { describe, expect, it } from 'vitest';
import { LIVE_WINDOW_MS, sessionsInProgress } from './session-presence';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const session = (personId: string, startedAt: string, endedAt?: string) => ({ id: `s-${personId}`, personId, startedAt, ...(endedAt ? { endedAt } : {}) });

describe('whose AI is at work on a request', () => {
	it('is a session still open that opened or acted lately', () => {
		const request = { liveSessions: [session('me@x.io', ago(60_000))], aiClicks: [] };
		expect(sessionsInProgress(request, NOW).map((s) => s.personId)).toEqual(['me@x.io']);
	});

	it('keeps a long session whose AI keeps acting', () => {
		const request = {
			liveSessions: [session('me@x.io', ago(3 * LIVE_WINDOW_MS))],
			aiClicks: [{ id: 'c1', personId: 'ME@x.io', kind: 'ask' as const, fieldPath: 'x', leafId: null, at: ago(4 * LIVE_WINDOW_MS), answeredAt: ago(60_000), state: 'answered' as const }]
		};
		expect(sessionsInProgress(request, NOW)).toHaveLength(1);
	});

	it('drops an ended session, and an open one silent for longer than the window', () => {
		const request = { liveSessions: [session('a@x.io', ago(60_000), ago(30_000)), session('b@x.io', ago(LIVE_WINDOW_MS + 1))], aiClicks: [] };
		expect(sessionsInProgress(request, NOW)).toEqual([]);
	});
});
