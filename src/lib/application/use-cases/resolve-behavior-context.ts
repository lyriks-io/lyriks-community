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

/**
 * The id bridge as a use-case (Fix #2): compute a wizard entity's kernel address
 * purely, then enrich it with the engine's authoritative surface + connectivity
 * when reachable. Falls back to the computed ids alone when the engine is down, so
 * an author always gets the `featureId`/`surfaceId`/`actionId` they need for
 * apply_behavior_batch — the enrichment is a bonus, not a dependency.
 */
export class ResolveBehaviorContextUseCase {
	constructor(private readonly advisor: Pick<UnspaghettitAdvisorPort, 'available' | 'getBehaviorContext'>) {}

	async execute(query: BehaviorAddressQuery): Promise<ResolvedBehaviorContext> {
		const addr = resolveBehaviorAddress(query);
		const ctx = addr.rootKey
			? await this.advisor.getBehaviorContext(addr.featureId, addr.rootKey)
			: null;
		return {
			featureId: addr.featureId,
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
}
