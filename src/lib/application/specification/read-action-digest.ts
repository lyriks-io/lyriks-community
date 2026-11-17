import type { FeatureDigest, UnspaghettitAdvisorPort } from '../ports';

/**
 * The engine's plain-language digest of ONE action: the same projection a
 * feature's summary comes from, scoped to the action. Null when the engine is
 * unreachable. Kept apart from the action's snapshot fold, which answers at
 * once and offline, because this one waits on the engine.
 */
export class ReadActionDigestUseCase {
	constructor(private readonly advisor: UnspaghettitAdvisorPort) {}

	execute(featureId: string, surfaceId: string, actionId: string): Promise<FeatureDigest | null> {
		return this.advisor.getDigest(featureId, { surfaceId, actionId });
	}
}
