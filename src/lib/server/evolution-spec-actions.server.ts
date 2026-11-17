import { elementPath, reviewActions, fieldKey, fieldValidationOf, latestThread, touchedFeatureNodes, type EvolutionRequest, type LocalGraph, type SpecificationItem } from '$domain/evolution';
import type { AppServices } from '$composition/container.server';
import { fieldTrail, type EvolutionView } from './evolution-view.server';
import { loadLocalGraph } from './evolution-graph.server';

/**
 * Where each action of the specification stands, read with the graph it comes
 * from: its validation trail against the action as it reads now, and the
 * comments on it. Keyed like a field, `element.<action id>@<feature node id>`.
 */
export function actionReadings(view: EvolutionView, request: EvolutionRequest, graph: LocalGraph) {
	return Object.fromEntries(
		touchedFeatureNodes(graph).flatMap((feature) =>
			reviewActions(graph, feature.id, (id) => fieldValidationOf(request, fieldKey(elementPath(id), feature.id)).refusal !== null).map((spec) => {
				const key = fieldKey(elementPath(spec.action.id), feature.id);
				const thread = latestThread(request, key) ?? null;
				return [
					key,
					{
						fingerprint: spec.fingerprint,
						trail: fieldTrail(view, request, key, spec.fingerprint),
						thread: thread ? { id: thread.id, state: thread.state, messages: thread.messages } : null
					}
				] as const;
			})
		)
	);
}

export type ActionReading = ReturnType<typeof actionReadings>[string];

/**
 * The trails of every action the Specification offers to validate, read with
 * the engine's graph: what the freeze and the dossier's next step count beside
 * the answers and the journey (ac-evo-form-step-lock).
 */
export async function specificationActionTrails(services: AppServices, view: EvolutionView, request: EvolutionRequest): Promise<SpecificationItem[]> {
	const graph = await loadLocalGraph(services, view, request);
	return Object.values(actionReadings(view, request, graph)).map((reading) => reading.trail);
}
