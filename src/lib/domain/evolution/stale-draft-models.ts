import type { CoherenceFinding, EvolutionRequest } from './draft';
import { stableId } from './ids';

/** A drafted behaviour model the engine no longer replays on the feature as it now stands, and why. */
export interface StaleDraftModel {
	readonly draftId: string;
	/** The feature the draft stands for; null for an addition not landed yet. */
	readonly featureId: string | null;
	/** The draft as a person names it: the feature it amends, or the name it adds. */
	readonly name: string;
	readonly why: string;
}

/**
 * A draft that no longer applies after another request landed is met in the
 * Simulation, before the build, not at the landing (rule 4c181849): each one
 * reads as a blocking finding naming what moved, to rework in the drafts. Its
 * id holds across checks, so a risk a person accepted on it stays accepted.
 */
export function staleModelFindings(request: Pick<EvolutionRequest, 'id'>, stale: readonly StaleDraftModel[]): CoherenceFinding[] {
	return stale.map((model) => ({
		id: stableId('coh-model-stale', request.id, model.draftId),
		axis: 'behavioural',
		severity: 'blocking',
		title: `The behaviour drafted on ${model.name} no longer applies: ${model.why}. Rework it in the drafts before the build.`,
		requestNodeId: model.draftId,
		existingNodeId: model.featureId ? `feature:${model.featureId}` : model.draftId,
		fixNowTarget: `evolution.${request.id}.drafts.${model.draftId}`,
		published: true
	}));
}
