import type {
	BehaviorRepositoryPort,
	FeatureMaturityReport,
	FeatureMaturityScorerPort
} from '../ports';

/**
 * One leaf feature's maturity reading WITH the checks it failed, so the leaf
 * drawer can say what stands between the current readiness level and the next
 * one instead of only showing the number.
 *
 * Deliberately independent of the Unspaghettit advisor: the scorer is the
 * engine's own pure function over a local shell, so this answers on an
 * air-gapped appliance and with the MCP advisor switched off, exactly like the
 * bulk `LoadFeatureMaturityUseCase` it mirrors. Null means there is no authored
 * shell to score.
 */
export class LoadFeatureMaturityReportUseCase {
	constructor(
		private readonly behavior: BehaviorRepositoryPort,
		private readonly maturityScorer: FeatureMaturityScorerPort
	) {}

	async execute(projectId: string, featureId: string): Promise<FeatureMaturityReport | null> {
		if (!projectId || !featureId) return null;
		// A missing or unreadable shell is an unauthored feature, not an error the
		// drawer should fail on: the rest of the panel still has something to show.
		const snapshot = await this.behavior.loadFeature(projectId, featureId).catch(() => null);
		return this.maturityScorer.report(snapshot);
	}
}
