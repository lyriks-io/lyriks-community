import type { BehaviorOverview } from './summarize-behavior';
import type { FeatureActionIndex } from './index-feature-actions';
import type { KernelRulesReadModel } from './index-feature-rules';

/** The read models folded from the canonical kernel in one pass over its snapshots. */
export interface BehaviorReading {
	readonly overview: BehaviorOverview;
	readonly actions: FeatureActionIndex;
	readonly kernelRules: KernelRulesReadModel;
	/** When each feature's behavior was last written, by feature id: what the search's Recently changed reads (criterion e11bf80b). */
	readonly writtenAt: Record<string, string>;
}

export interface BehaviorFold {
	readonly reading: BehaviorReading;
	/** Whether every feature could be read for it: one that failed may read next time. */
	readonly whole: boolean;
}
