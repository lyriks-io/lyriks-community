import {
	appendScorePoint,
	applyDecisions,
	coverageScoreOf,
	emptyScoreHistory,
	maturityScoreOf,
	type CoherenceAnalysis,
	type ScoreHistory,
	type ScorePoint
} from '$domain/coherence';
import { coherenceScoreOf } from '$domain/coherence/incoherence';
import type {
	ClockPort,
	CoherenceAnalysisOptions,
	CoherenceDraftRepositoryPort,
	GlobalCoherenceCheckerPort
} from './ports';

/** Where the dated score points live between analyses (one document per project). */
export interface ScoreHistoryStore {
	load(projectId: string): Promise<ScoreHistory | null>;
	save(projectId: string, history: ScoreHistory): Promise<void>;
}

/**
 * The outermost checker: what every consumer (rings, Control Center, portfolio,
 * Coherence page, MCP) reads through.
 *
 * 1. DECISIONS. A gap a person settled with a traced decision leaves the open
 *    list here, so every score agrees: the sidebar ring, the portfolio card and
 *    the Coherence page used to disagree on whether an acknowledged gap counted.
 *    Blocking gaps never settle (the domain rule); the trace rides along in
 *    `settled` so the panel can still show who decided and why.
 *
 * 2. HISTORY. Each analysis worth keeping appends a dated point (see
 *    appendScorePoint for what "worth keeping" means), fire-and-forget: a failed
 *    write never fails or slows the read. This is what lets the panel draw where
 *    the product has been instead of only where it stands.
 */
export class DecisionAwareCoherenceChecker implements GlobalCoherenceCheckerPort {
	constructor(
		private readonly inner: GlobalCoherenceCheckerPort,
		private readonly drafts: Pick<CoherenceDraftRepositoryPort, 'load'>,
		private readonly history: ScoreHistoryStore | null,
		private readonly clock: ClockPort,
		private readonly onError?: (err: unknown) => void
	) {}

	async analyze(projectId: string, opts?: CoherenceAnalysisOptions): Promise<CoherenceAnalysis> {
		const [raw, draft] = await Promise.all([
			this.inner.analyze(projectId, opts),
			this.drafts.load(projectId).catch((err) => {
				this.onError?.(err);
				return null;
			})
		]);
		const analysis = draft ? applyDecisions(raw, draft) : raw;
		void this.record(projectId, analysis);
		return analysis;
	}

	private async record(projectId: string, analysis: CoherenceAnalysis): Promise<void> {
		if (!this.history) return;
		try {
			const point: ScorePoint = {
				at: this.clock.nowIso(),
				coherence: coherenceScoreOf(analysis.gaps),
				readiness: Math.round(analysis.readinessScore),
				coverage: coverageScoreOf(analysis.dimensions, analysis.readinessScore),
				maturity: maturityScoreOf(analysis.dimensions),
				open: analysis.gaps.length,
				blocking: analysis.gaps.filter((g) => g.blocking).length
			};
			const current = (await this.history.load(projectId)) ?? emptyScoreHistory();
			const next = appendScorePoint(current, point);
			if (next) await this.history.save(projectId, next);
		} catch (err) {
			this.onError?.(err);
		}
	}
}
