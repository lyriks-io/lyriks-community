import {
	elementPath,
	reviewActions,
	fieldKey,
	fieldValidationOf,
	latestThread,
	touchedFeatureNodes,
	FUNCTIONAL_DIAGRAM_KEY,
	JOURNEY_PATH_PREFIX,
	journeyPaths,
	readFunctionalDiagram,
	requestPagePath,
	type EvolutionRequest,
	type LocalGraph,
	type SpecificationActions
} from '$domain/evolution';
import type { AppServices } from '$composition/container.server';
import { fieldTrail, type EvolutionView, type SpecificationEntry } from './evolution-view.server';
import { loadLocalGraph, type LocalGraphReading } from './evolution-graph.server';

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
 * the answers and the journey (ac-evo-form-step-lock), or why they could not be
 * read, which holds the freeze instead of a wrong count (criterion c623df9c).
 */
export async function specificationActionTrails(services: AppServices, view: EvolutionView, request: EvolutionRequest): Promise<SpecificationActions> {
	// The very items part "specification" lists, so the gate and the list never disagree.
	const listed = await specificationActionEntries(services, view, request);
	return listed.status === 'read' ? { status: 'read', items: listed.entries.map((entry) => entry.trail) } : listed;
}

/** The actions of the Specification as part "specification" lists them, or why the engine could not read them (criterion c623df9c). */
export type SpecificationActionEntries =
	| { readonly status: 'read'; readonly entries: readonly SpecificationEntry[] }
	| { readonly status: 'unread'; readonly reason: string };

/**
 * Every action the Specification offers to validate as an item of get_evolution
 * part "specification": validate_field takes it as `element.<action node id>` on
 * the feature node it belongs to (criterion 2df61e72). None is listed from a
 * fallback: while the engine does not answer, the answer says why instead.
 */
export async function specificationActionEntries(services: AppServices, view: EvolutionView, request: EvolutionRequest): Promise<SpecificationActionEntries> {
	const reading = await loadLocalGraph(services, view, request);
	if (reading.status === 'unread') return { status: 'unread', reason: reading.reason };
	const graph = reading.graph;
	const page = requestPagePath(view.projectId, request.id);
	return {
		status: 'read',
		entries: touchedFeatureNodes(graph).flatMap((feature) =>
			reviewActions(graph, feature.id, (id) => fieldValidationOf(request, fieldKey(elementPath(id), feature.id)).refusal !== null).map((spec) => {
				const fieldPath = elementPath(spec.action.id);
				return {
					fieldPath,
					leafId: feature.id,
					kind: 'action' as const,
					label: `${feature.label} › ${spec.action.label}`,
					trail: fieldTrail(view, request, fieldKey(fieldPath, feature.id), spec.fingerprint),
					href: page
				};
			})
		)
	};
}

/** What an element reads now: its fingerprint, null when the Specification offers no such element, or why the actions could not be read. */
export type ElementReading = { readonly status: 'read'; readonly fingerprint: string | null } | { readonly status: 'unread'; readonly reason: string };

/**
 * What an action or a path of the journey reads now, the value a validation of
 * it stands behind: the very fingerprint the page shows, computed here when an
 * AI client validates by key alone, since it never holds what the page read
 * (criterion fa81c0eb). A path is read from its drawing; an action from the
 * engine's graph, never from a fallback: unread while the engine does not
 * answer (rule 519642d3). `graph` reads the request's graph, once per batch.
 */
export async function elementFingerprint(
	services: AppServices,
	view: EvolutionView,
	request: EvolutionRequest,
	key: string,
	graph: () => Promise<LocalGraphReading> = () => loadLocalGraph(services, view, request)
): Promise<ElementReading> {
	const path = key.split('@')[0];
	if (path.startsWith(JOURNEY_PATH_PREFIX)) {
		const drawing = request.stepAnswers.functional_spec?.[FUNCTIONAL_DIAGRAM_KEY] ?? '';
		return { status: 'read', fingerprint: journeyPaths(readFunctionalDiagram(drawing).diagram).find((p) => p.key === path)?.fingerprint ?? null };
	}
	const reading = await graph();
	if (reading.status === 'unread') return { status: 'unread', reason: reading.reason };
	return { status: 'read', fingerprint: actionReadings(view, request, reading.graph)[key]?.fingerprint ?? null };
}
