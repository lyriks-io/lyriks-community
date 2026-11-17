import type { EvolutionRequest } from './draft';
import { featureOfLink, type DiagramLink } from './diagram-links';
import { FUNCTIONAL_DIAGRAM_KEY, readFunctionalDiagram, type DiagramPlace, type DiagramProblem, type FunctionalDiagram } from './functional-diagram';
import { readTechnicalDiagram, type TechnicalDiagram } from './technical-diagram';

export type DiagramStepKey = 'functional_spec' | 'technical_spec';

/** One link a diagram holds, and the element of the drawing it sits on. */
export interface PlacedLink {
	readonly step: DiagramStepKey;
	readonly link: DiagramLink;
	readonly at: DiagramPlace;
}

/** The links a Functional spec's diagram holds, each with the element it sits on. */
export function functionalLinks(diagram: FunctionalDiagram): { link: DiagramLink; at: DiagramPlace }[] {
	return [
		...diagram.useCases.flatMap((u) => (u.link ? [{ link: u.link, at: { kind: 'use_case', name: u.name } as const }] : [])),
		...diagram.flows.flatMap((f) => f.steps.flatMap((s, index) => (s.link ? [{ link: s.link, at: { kind: 'step', useCase: f.useCase, index } as const }] : [])))
	];
}

/** The links a Technical spec's diagram holds, each with the part it sits on. */
export const technicalLinks = (diagram: TechnicalDiagram): { link: DiagramLink; at: DiagramPlace }[] =>
	diagram.elements.flatMap((e) => (e.link ? [{ link: e.link, at: { kind: 'element', name: e.name } as const }] : []));

/** Every link the request's two diagrams hold, in drawing order (ac-evo-func-uml-link, ac-evo-tech-uml-link). */
export function diagramLinks(request: Pick<EvolutionRequest, 'stepAnswers' | 'skippedSteps'>): PlacedLink[] {
	const skipped = (step: DiagramStepKey) => request.skippedSteps.some((s) => s.step === step);
	const notation = (step: DiagramStepKey) => request.stepAnswers[step][FUNCTIONAL_DIAGRAM_KEY] ?? '';
	return [
		...(skipped('functional_spec') ? [] : functionalLinks(readFunctionalDiagram(notation('functional_spec')).diagram).map((l) => ({ step: 'functional_spec' as const, ...l }))),
		...(skipped('technical_spec') ? [] : technicalLinks(readTechnicalDiagram(notation('technical_spec')).diagram).map((l) => ({ step: 'technical_spec' as const, ...l })))
	];
}

/**
 * A link to what the product no longer has, pointed out under the drawing on
 * the element it sits on; the element is still drawn. `hrefOf` answers null for
 * a link known gone, undefined while it is not known yet, and a link not known
 * yet is never pointed out.
 */
export function goneLinkProblems(links: readonly { link: DiagramLink; at: DiagramPlace }[], hrefOf: (ref: string) => string | null | undefined): DiagramProblem[] {
	return links
		.filter((l) => hrefOf(l.link.ref) === null)
		.map((l) => ({ line: null, message: `"${l.link.name}" is no longer in the product: link it again, or take the link off.`, at: [l.at] }));
}

/** A feature the change uses without changing it, and the diagrams that link to it. */
export interface UsedFeature {
	readonly featureId: string;
	readonly diagrams: readonly DiagramStepKey[];
}

/**
 * The features the request's diagrams link to that it neither adds, amends nor
 * removes (ac-evo-imp-used): what the change uses as it stands. A feature the
 * request already touches is read as touched, never twice.
 */
export function usedFeatures(request: Pick<EvolutionRequest, 'stepAnswers' | 'skippedSteps' | 'leafIds' | 'drafts'>): UsedFeature[] {
	const touched = new Set([...request.leafIds, ...request.drafts.flatMap((d) => (d.baseLeafId ? [d.baseLeafId] : []))]);
	const byFeature = new Map<string, Set<DiagramStepKey>>();
	for (const placed of diagramLinks(request)) {
		const featureId = featureOfLink(placed.link.ref);
		if (!featureId || touched.has(featureId)) continue;
		byFeature.set(featureId, (byFeature.get(featureId) ?? new Set()).add(placed.step));
	}
	return [...byFeature].map(([featureId, diagrams]) => ({ featureId, diagrams: [...diagrams] }));
}
