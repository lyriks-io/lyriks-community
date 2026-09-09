/**
 * The scores over time. One point per analysis worth keeping, so the Control
 * Center can draw where the product has been instead of only where it stands.
 * Recorded server-side after an analysis, never trusted from the client.
 */
export interface ScorePoint {
	at: string;
	coherence: number;
	readiness: number;
	coverage: number;
	maturity: number;
	/** Open incoherences at that moment (settled ones excluded). */
	open: number;
	blocking: number;
}

export interface ScoreHistory {
	points: ScorePoint[];
}

/** Bound the series so a busy project never grows an unbounded document. */
export const SCORE_HISTORY_CAP = 400;
/** Two analyses with identical scores closer than this record one point. */
export const SCORE_HISTORY_MIN_GAP_MS = 60 * 60 * 1000;

export function emptyScoreHistory(): ScoreHistory {
	return { points: [] };
}

const sameScores = (a: ScorePoint, b: ScorePoint) =>
	a.coherence === b.coherence &&
	a.readiness === b.readiness &&
	a.coverage === b.coverage &&
	a.maturity === b.maturity &&
	a.open === b.open &&
	a.blocking === b.blocking;

/**
 * Append a point when it says something new: the first point, a change in any
 * score, or an hour of silence (so a flat week still draws as a line). Returns
 * null when nothing is worth recording, so the caller skips the write.
 */
export function appendScorePoint(history: ScoreHistory, point: ScorePoint): ScoreHistory | null {
	const last = history.points[history.points.length - 1];
	if (last) {
		const elapsed = Date.parse(point.at) - Date.parse(last.at);
		if (sameScores(last, point) && Number.isFinite(elapsed) && elapsed < SCORE_HISTORY_MIN_GAP_MS) return null;
	}
	const points = [...history.points, point].slice(-SCORE_HISTORY_CAP);
	return { points };
}

/** The last `n` points, oldest first, for a sparkline. */
export function recentPoints(history: ScoreHistory, n: number): ScorePoint[] {
	return history.points.slice(-n);
}
