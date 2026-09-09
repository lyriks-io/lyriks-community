import { leafFeatures } from '$domain/features';
import { mapLimit } from '$lib/shared/map-limit';
import type {
	BehaviorRepositoryPort,
	FeatureGap,
	FeatureScore,
	FeatureSummary,
	FeaturesDraftRepositoryPort,
	UnspaghettitAdvisorPort
} from '../ports';
import { SpecVersionMemo, specVersionOf } from '../spec-version-memo';

export interface FeatureAdvice {
	readonly featureId: string;
	readonly summary: FeatureSummary | null;
	readonly score: FeatureScore | null;
	readonly gaps: FeatureGap[];
}

/**
 * Engine calls in flight at once. The engine is one single-threaded process, so
 * width buys nothing but a longer queue, and a longer queue is what a budget
 * kill takes down wholesale.
 */
const ENGINE_WIDTH = 2;

/**
 * Asks the Unspaghettit engine for every read-only signal it can give about
 * the Step 04 leaf set: the on-disk index (surfaces / actions / state counts),
 * the maturity score (when the OSS bug allowing it is not tripped), and the
 * implementation gaps. All three round-trip per leaf, then we stitch them into
 * one `FeatureAdvice` row. Missing answers fall to null / empty so the UI
 * degrades gracefully when one tool fails.
 *
 * With a behavior repository to read the leaf's write stamp from, a leaf whose
 * spec has not changed since its last reading is served from memory instead of
 * asked again: the background refresh then costs the engine only what changed.
 */
export class ScoreFeaturesUseCase {
	readonly #memo = new SpecVersionMemo<FeatureAdvice>();

	constructor(
		private readonly drafts: FeaturesDraftRepositoryPort,
		private readonly advisor: UnspaghettitAdvisorPort,
		private readonly behavior?: BehaviorRepositoryPort
	) {}

	async execute(projectId: string): Promise<FeatureAdvice[]> {
		if (!this.advisor.available) return [];
		const draft = await this.drafts.load(projectId);
		if (!draft) return [];
		const leaves = leafFeatures(draft);
		return mapLimit(leaves, ENGINE_WIDTH, async (leaf) => {
			const version = await this.#versionOf(projectId, leaf.id);
			const key = `${projectId}/${leaf.id}`;
			const remembered = version ? this.#memo.get(key, version) : undefined;
			if (remembered) return remembered;
			const advice = await this.#ask(leaf.id);
			// Only a complete reading is worth remembering: a summary the engine
			// could not produce is retried on the next refresh, not frozen.
			if (version && advice.summary) this.#memo.set(key, version, advice);
			return advice;
		});
	}

	async #ask(featureId: string): Promise<FeatureAdvice> {
		// Resolve the summary first: it carries the feature id, so a missing
		// shell (or a global fuzzy match to ANOTHER project's feature) yields no
		// summary — in which case we report honest nulls instead of borrowing
		// another project's score/gaps.
		const summary = await this.advisor.getFeatureSummary(featureId);
		if (!summary) return { featureId, summary: null, score: null, gaps: [] };
		const [score, gaps] = await Promise.all([
			this.advisor.scoreFeature(featureId),
			this.advisor.findFeatureGaps(featureId)
		]);
		return { featureId, summary, score, gaps };
	}

	async #versionOf(projectId: string, featureId: string): Promise<string | null> {
		if (!this.behavior) return null;
		const snapshot = await this.behavior.loadFeature(projectId, featureId).catch(() => null);
		return specVersionOf(snapshot);
	}
}
