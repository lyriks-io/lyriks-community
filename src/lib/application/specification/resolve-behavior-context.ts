import type { UnspaghettitAdvisorPort } from '$application/ports';
import {
	resolveBehaviorAddress,
	type BehaviorAddressQuery
} from '$application/projection/behavior-address';

export interface ResolvedBehaviorContext {
	readonly featureId: string;
	readonly rootKey: string | null;
	readonly surfaceId: string | null;
	readonly actionId: string | null;
	readonly name: string | null;
	/** True/false when the engine answered; null when it was unreachable. */
	readonly found: boolean | null;
	readonly depth: {
		readonly statesWritten: number;
		readonly statesRead: number;
		readonly eventsEmitted: number;
		readonly transitions: number;
		readonly actions: number;
	} | null;
	readonly engineAvailable: boolean;
}

/** The leaf features a project declares: where a kernel id may live besides the Experience. */
export type ProjectLeafFeatureIds = (projectId: string) => Promise<readonly string[]>;

/**
 * The id bridge as a use-case (Fix #2): compute a wizard entity's kernel address
 * purely, then enrich it with the engine's authoritative surface + connectivity
 * when reachable. Falls back to the computed ids alone when the engine is down, so
 * an author always gets the `featureId`/`surfaceId`/`actionId` they need for
 * apply_behavior_batch — the enrichment is a bonus, not a dependency.
 *
 * A wizard id (journey, step, screen) always lives in the Experience feature. A
 * KERNEL id does not have to: the action id a code comment or an index entry
 * carries usually belongs to a leaf feature. So when the Experience does not
 * hold a surface or action id, the project's leaf features are searched for it,
 * and the answer names the feature that owns it.
 */
export class ResolveBehaviorContextUseCase {
	constructor(
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'available' | 'getBehaviorContext'>,
		private readonly leafFeatureIds: ProjectLeafFeatureIds = async () => []
	) {}

	async execute(query: BehaviorAddressQuery): Promise<ResolvedBehaviorContext> {
		const addr = resolveBehaviorAddress(query);
		const inExperience = addr.rootKey
			? await this.advisor.getBehaviorContext(addr.featureId, addr.rootKey)
			: null;
		const kernelIdAsked = Boolean(query.surfaceId || query.actionId);
		const elsewhere =
			addr.rootKey && kernelIdAsked && inExperience?.found === false
				? await this.#findInLeafFeatures(query.projectId, addr.rootKey)
				: null;
		const ctx = elsewhere ?? inExperience;
		return {
			featureId: elsewhere?.featureId ?? addr.featureId,
			rootKey: addr.rootKey,
			// Prefer the engine's surface (authoritative for a step, whose surface the
			// pure resolver can't know), else the computed one.
			surfaceId: ctx?.surfaceId ?? addr.surfaceId,
			actionId: addr.actionId ?? ctx?.actionId ?? null,
			name: ctx?.name ?? null,
			found: ctx ? ctx.found : null,
			depth: ctx?.depth ?? null,
			// With no entity selector there is intentionally no neighborhood call.
			// Reporting `ctx !== null` used to label that valid feature-id-only lookup
			// unavailable even while verification was actively using the same engine.
			engineAvailable: addr.rootKey ? ctx !== null : this.advisor.available
		};
	}

	/** The first leaf feature holding this key, or null. One engine read per leaf, only on a miss. */
	async #findInLeafFeatures(projectId: string, rootKey: string) {
		for (const featureId of await this.leafFeatureIds(projectId)) {
			const ctx = await this.advisor.getBehaviorContext(featureId, rootKey);
			if (ctx?.found) return ctx;
		}
		return null;
	}
}
