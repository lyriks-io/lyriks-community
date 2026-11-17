import { ELEMENT_PATH_PREFIX } from './spec-actions';
import type { DiagramFlow, FunctionalDiagram } from './functional-diagram';

/**
 * The paths of the user journey, each validated on its own at the
 * Specification (ac-evo-spec-journey-paths): one per flow of the Functional
 * spec's diagram, named after the use case it walks through. Its validation is
 * the answer trail of a synthetic field, `element.path.<use case>`, whose value
 * is the path's fingerprint, the way an action is validated (spec-actions.ts):
 * a step changed, added or removed changes the fingerprint and the validation
 * goes stale, exactly as an answer rewritten after it was validated.
 */
export const JOURNEY_PATH_PREFIX = `${ELEMENT_PATH_PREFIX}path.`;

export interface JourneyPath {
	/** The synthetic field the path is validated on. */
	readonly key: string;
	readonly useCase: string;
	readonly fingerprint: string;
	readonly flow: DiagramFlow;
}

const slug = (text: string): string =>
	text
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'path';

/** Everything a path says, one line per step and per refusal or failure under it. */
export function pathFingerprint(flow: DiagramFlow): string {
	return [
		flow.useCase.trim(),
		...flow.steps.flatMap((step) => [`${step.lane.trim()}: ${step.text.trim()}`, ...step.branches.map((b) => `  ${b.kind} ${b.when.trim()} -> ${b.then.trim()}`)])
	].join('\n');
}

/** The paths of a drawing, in its order; two flows of one use case get distinct keys. */
export function journeyPaths(diagram: Pick<FunctionalDiagram, 'flows'>): JourneyPath[] {
	const seen = new Map<string, number>();
	return diagram.flows.map((flow) => {
		const base = slug(flow.useCase);
		const n = (seen.get(base) ?? 0) + 1;
		seen.set(base, n);
		return { key: `${JOURNEY_PATH_PREFIX}${n === 1 ? base : `${base}-${n}`}`, useCase: flow.useCase, fingerprint: pathFingerprint(flow), flow };
	});
}
