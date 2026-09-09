import { describe, expect, it } from 'vitest';
import { appendScorePoint, emptyScoreHistory, SCORE_HISTORY_CAP, type ScorePoint } from './score-history';

const point = (at: string, coherence = 70): ScorePoint => ({
	at,
	coherence,
	readiness: 40,
	coverage: 60,
	maturity: 30,
	open: 3,
	blocking: 0
});

describe('score history', () => {
	it('records the first point, a change, and an hour of silence; skips a repeat within the hour', () => {
		const h1 = appendScorePoint(emptyScoreHistory(), point('2026-09-03T10:00:00Z'));
		expect(h1?.points).toHaveLength(1);
		expect(appendScorePoint(h1!, point('2026-09-03T10:20:00Z'))).toBeNull();
		expect(appendScorePoint(h1!, point('2026-09-03T10:20:00Z', 78))?.points).toHaveLength(2);
		expect(appendScorePoint(h1!, point('2026-09-03T11:00:01Z'))?.points).toHaveLength(2);
	});

	it('never grows past the cap', () => {
		let h = emptyScoreHistory();
		for (let i = 0; i < SCORE_HISTORY_CAP + 20; i++) {
			h = appendScorePoint(h, point(new Date(Date.UTC(2026, 0, 1, i)).toISOString(), i % 100)) ?? h;
		}
		expect(h.points).toHaveLength(SCORE_HISTORY_CAP);
	});
});
