import { hasJourney, leafFeatures } from '$domain/features';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import type { BehaviorRepositoryPort, FeatureMaturityScorerPort } from '../ports';
import type { LoadFeaturesDraftUseCase } from '../specification/load-features-draft';

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

/** The ids of the actions in force on a behavior shell: a disabled action, or any action of a disabled feature, is left out. */
function actionsInForce(snapshot: UnspaFeatureSnapshot | null): string[] {
	const feature = (snapshot?.feature ?? {}) as Record<string, unknown>;
	if (feature.disabled) return [];
	const surfaces = Array.isArray(feature.surfaces) ? (feature.surfaces as { actions?: unknown }[]) : [];
	return surfaces
		.flatMap((surface) => (Array.isArray(surface.actions) ? (surface.actions as Record<string, unknown>[]) : []))
		.flatMap((action) => (typeof action?.id === 'string' && !action.disabled ? [action.id] : []));
}

/**
 * One leaf feature's behavioral maturity, joined to its owning Core. Consumed by Step 09's Behavior
 * Maturity reading, so the row carries display-ready names.
 * `maturity` is 0–100; 0 when the feature has no authored Unspaghettit shell.
 */
export interface FeatureMaturityRow {
	featureId: string;
	name: string;
	coreId: string | null;
	coreName: string;
	maturity: number;
	/** Entity names this leaf's behavior model declares; the completion gate
	 *  checks each one is represented in the data section. */
	entities: string[];
	/** How many actions in force the leaf holds, and whether its journeys diagram links any of them
	 *  (criterion a0ebe123): the completion gate names a feature of several actions none links. */
	actions: number;
	journeyLinked: boolean;
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

		const leaves = leafFeatures(features);
		return Promise.all(
			leaves.map(async (leaf) => {
				const snapshot = await this.behavior.loadFeature(projectId, leaf.id);
				const maturity = this.maturityScorer.score(snapshot);
				const actions = actionsInForce(snapshot);
				return {
					featureId: leaf.id,
					name: leaf.name,
					coreId: leaf.coreId ?? null,
					coreName: (leaf.coreId && coreName.get(leaf.coreId)) || '',
					maturity,
					entities: entityNames(snapshot),
					actions: actions.length,
					journeyLinked: hasJourney(features.actionJourneys?.[leaf.id] ?? [], actions)
				};
			})
		);
	}
}
