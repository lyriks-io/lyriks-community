import type { BehaviorMaturityReport, UnspaghettitAdvisorPort } from '$application/ports';

export interface ScoreBehaviorFeatureInput {
	readonly featureId: string;
	readonly includeIssues?: boolean;
	readonly surfaceId?: string;
	readonly area?: string;
	readonly severity?: 'critical' | 'recommended';
}

/** Return the engine's actionable, optionally filtered maturity report. */
export class ScoreBehaviorFeatureUseCase {
	constructor(private readonly advisor: Pick<UnspaghettitAdvisorPort, 'scoreFeatureDetailed'>) {}

	execute(input: ScoreBehaviorFeatureInput): Promise<BehaviorMaturityReport | null> {
		return this.advisor.scoreFeatureDetailed(input.featureId, input);
	}
}
