import { leafFeatures } from '$domain/features';
import type { BehavioralIndexPayload, CodeAdoptionPort } from '../ports';
import type { LoadFeaturesDraftUseCase } from './load-features-draft';

/** One feature's share of the spec that the index has located, or not. */
export interface FeatureGapStats {
	featureId: string;
	name: string;
	total: number;
	implemented: number;
	partial: number;
	missing: number;
}

export interface GapSweep {
	/** Features carrying at least one spec entity, worst coverage first. */
	features: FeatureGapStats[];
	totals: { features: number; total: number; implemented: number; partial: number; missing: number };
	/** Leaves the engine could not answer for, so a caller never reads silence as zero. */
	unavailable: string[];
}

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/**
 * Project-wide gaps: which features still have spec entities the code map has
 * not located, in ONE pass.
 *
 * The engine answers gaps for one feature at a time, which left "what is there
 * left to build across this product" as a loop every caller had to write, and
 * therefore usually skipped. This walks the leaves, keeps the per-feature
 * counters, and leaves the element-level detail to a scoped call: the roll-up
 * says WHICH features to open, `getImplementationGaps` says what is missing
 * inside one.
 *
 * Fail-soft per leaf, like every other adoption read: a feature the engine
 * cannot answer for is named in `unavailable` rather than counted as complete.
 */
export class SweepImplementationGapsUseCase {
	constructor(
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly adoption: CodeAdoptionPort
	) {}

	async execute(projectId: string, index: BehavioralIndexPayload): Promise<GapSweep> {
		const draft = await this.loadFeatures.execute(projectId);
		const unavailable: string[] = [];

		const rows = await Promise.all(
			leafFeatures(draft).map(async (leaf) => {
				const result = await this.adoption
					.getImplementationGaps(leaf.id, projectId, index)
					.catch(() => null);
				if (!result?.ok) {
					unavailable.push(leaf.id);
					return null;
				}
				const value = result.value as Record<string, unknown>;
				const stats = (value.stats ?? {}) as Record<string, unknown>;
				const total = typeof stats.total === 'number' ? stats.total : count(value.missing) + count(value.partial) + count(value.implemented);
				if (total === 0) return null;
				return {
					featureId: leaf.id,
					name: leaf.name,
					total,
					implemented: typeof stats.implemented === 'number' ? stats.implemented : count(value.implemented),
					partial: typeof stats.partial === 'number' ? stats.partial : count(value.partial),
					missing: typeof stats.missing === 'number' ? stats.missing : count(value.missing)
				} satisfies FeatureGapStats;
			})
		);

		const features = rows
			.filter((row): row is FeatureGapStats => row !== null)
			.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

		return {
			features,
			totals: {
				features: features.length,
				total: features.reduce((n, f) => n + f.total, 0),
				implemented: features.reduce((n, f) => n + f.implemented, 0),
				partial: features.reduce((n, f) => n + f.partial, 0),
				missing: features.reduce((n, f) => n + f.missing, 0)
			},
			unavailable
		};
	}
}
