import type { BehaviorOverview } from './summarize-behavior';
import type { FeatureActionIndex, FeatureScenarioIndex } from './index-feature-actions';
import type { KernelRulesReadModel } from './index-feature-rules';
import type { DisabledMarker } from '$lib/unspa-schema';

/** The read models folded from the canonical kernel in one pass over its snapshots. */
export interface BehaviorReading {
	readonly overview: BehaviorOverview;
	readonly actions: FeatureActionIndex;
	readonly kernelRules: KernelRulesReadModel;
	/** When each feature's behavior was last written, by feature id: what the search's Recently changed reads (criterion e11bf80b). */
	readonly writtenAt: Record<string, string>;
	/** The features disabled as a whole, by id: who, when and why. Absent from a reading folded before it existed. */
	readonly disabledFeatures?: Record<string, DisabledMarker>;
	/** Each action's scenarios, by feature then action. Absent from a reading folded before it existed. */
	readonly scenarios?: FeatureScenarioIndex;
}

export interface BehaviorFold {
	readonly reading: BehaviorReading;
	/** Whether every feature could be read for it: one that failed may read next time. */
	readonly whole: boolean;
}
