import type { AppServices } from '$composition/container.server';
import { draftIndexKeys, isLanded } from '$domain/evolution';
import { featureIndexUnits, type DraftIndexUnits } from '$domain/implementation';
import { readDraftFeature } from './evolution-graph.server';

/** What the drafts of the open requests add, and the requests whose drafts could not be read now. */
export interface DraftHolders {
	readonly drafts: readonly DraftIndexUnits[];
	readonly notRead: readonly string[];
}

/**
 * The keys each draft of an open, not landed Evolution request adds, with the
 * units its model places them in (feat-100, criterion a501859a). The keys are
 * the ones a sync holds on the request (holdDraftEntries): what the draft's
 * model makes that the feature it stands for does not hold. A draft the engine
 * does not answer for names its request under `notRead`: it is never read as
 * adding nothing.
 */
export async function readDraftHolders(services: AppServices, projectId: string): Promise<DraftHolders> {
	const evolution = await services.loadEvolutionDraft.execute(projectId);
	const pending = (evolution?.requests ?? []).filter((r) => r.status === 'open' && !isLanded(r) && r.drafts.length > 0);
	if (!evolution || pending.length === 0) return { drafts: [], notRead: [] };
	const features = await services.loadFeaturesDraft.execute(projectId);
	const signedOf = (leafId: string) => features.leafMeta?.[leafId]?.acceptanceCriteria ?? [];
	const drafts: DraftIndexUnits[] = [];
	const notRead = new Set<string>();
	for (const request of pending) {
		for (const draft of request.drafts) {
			if (draft.kind === 'remove' || draft.materialisedAs !== null) continue;
			const [reading, base] = await Promise.all([
				readDraftFeature(services, evolution, draft.id),
				draft.baseLeafId ? services.readBehaviorFeature.execute(projectId, draft.baseLeafId).catch(() => null) : Promise.resolve(null)
			]);
			// #72 made the engine's silence a reading of its own; anything but a computed feature stays unread here, as before.
			const snapshot = reading.status === 'computed' ? reading.feature : null;
			if (!snapshot) {
				notRead.add(request.id);
				continue;
			}
			const official = new Set(
				draftIndexKeys((base?.feature as Record<string, unknown> | undefined) ?? null, {
					acceptanceCriteria: draft.baseLeafId ? signedOf(draft.baseLeafId) : []
				})
			);
			const signed = signedOf(draft.id).map((c) => c.id);
			drafts.push({
				requestId: request.id,
				draftId: draft.id,
				units: featureIndexUnits(snapshot as Record<string, unknown>).units,
				adds: draftIndexKeys(snapshot, draft, signed).filter((key) => !official.has(key))
			});
		}
	}
	return { drafts, notRead: [...notRead] };
}
