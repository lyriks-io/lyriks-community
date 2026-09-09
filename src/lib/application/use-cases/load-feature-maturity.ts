import { leafFeatures } from '$domain/features';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import type { BehaviorRepositoryPort, FeatureMaturityScorerPort } from '../ports';
import type { LoadFeaturesDraftUseCase } from './load-features-draft';

/** Entity names out of a behavior shell, tolerant of the loose snapshot shape. */
function entityNames(snapshot: UnspaFeatureSnapshot | null): string[] {
	const feature = (snapshot?.feature ?? {}) as Record<string, unknown>;
	const entities = Array.isArray(feature.entities) ? feature.entities : [];
	return entities
		.map((entity) => {
			const name = (entity as Record<string, unknown> | null)?.name;
			return typeof name === 'string' ? name.trim() : '';
		})
		.filter((name) => name.length > 0);
}

/**
 * One leaf feature's behavioral maturity, joined to its owning Core and the
 * Release it's assigned to on the roadmap. Consumed by Step 09's Behavior
 * Maturity reading, so the row carries display-ready names.
 * `maturity` is 0–100; 0 when the feature has no authored Unspaghettit shell.
 */
export interface FeatureMaturityRow {
	featureId: string;
	name: string;
	coreId: string | null;
	coreName: string;
	releaseId: string | null;
	releaseName: string;
	maturity: number;
	/** Entity names this leaf's behavior model declares; the completion gate
	 *  checks each one is represented in the data section. */
	entities: string[];
}

/**
 * Reads per-feature behavioral maturity for the Behavior Maturity reading — the same
 * signal `LocalGlobalCoherenceChecker` averages into the `maturity` dimension,
 * but kept per-leaf here so the UI can list which features are/aren't buildable.
 *
 * Pure + offline-safe: the scorer returns 0 for a missing shell,
 * so this never touches the network and never throws on an unauthored feature.
 * Deliberately does NOT use the Unspaghettit advisor (null when the engine is
 * off) — the local shell read is the MAP baseline.
 */
export class LoadFeatureMaturityUseCase {
	constructor(
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly behavior: BehaviorRepositoryPort,
		private readonly maturityScorer: FeatureMaturityScorerPort
	) {}

	async execute(projectId: string): Promise<FeatureMaturityRow[]> {
		const features = await this.loadFeatures.execute(projectId);
		const coreName = new Map(features.cores.map((c) => [c.id, c.name]));
		const releaseById = new Map(features.releases.map((r) => [r.id, r]));
		const releaseByFeature = new Map(
			features.roadmapAssignments.map((a) => [a.featureId, a.releaseId])
		);

		const leaves = leafFeatures(features);
		return Promise.all(
			leaves.map(async (leaf) => {
				const snapshot = await this.behavior.loadFeature(projectId, leaf.id);
				const maturity = this.maturityScorer.score(snapshot);
				const releaseId = releaseByFeature.get(leaf.id) ?? null;
				const release = releaseId ? releaseById.get(releaseId) : undefined;
				return {
					featureId: leaf.id,
					name: leaf.name,
					coreId: leaf.coreId ?? null,
					coreName: (leaf.coreId && coreName.get(leaf.coreId)) || '',
					releaseId: release ? release.id : null,
					releaseName: release ? release.name : '',
					maturity,
					entities: entityNames(snapshot)
				};
			})
		);
	}
}
