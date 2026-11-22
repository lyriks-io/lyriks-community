import type { LocalGraph, LocalNode } from './local-graph';

/**
 * The actions of the specification, each validated on its own like an answer
 * (the Specification step of the Evolution design). An action is read from the
 * request's graph, with the rules it carries; its validation is the answer
 * trail of a synthetic field, `element.<node id>` on the feature it belongs
 * to, whose value is the action's fingerprint. When the action or one of its
 * rules changes, the fingerprint changes with it and the validation goes stale,
 * exactly as an answer rewritten after it was validated.
 */
export const ELEMENT_PATH_PREFIX = 'element.';
export const elementPath = (nodeId: string): string => `${ELEMENT_PATH_PREFIX}${nodeId}`;
export const isElementPath = (path: string): boolean => path.startsWith(ELEMENT_PATH_PREFIX);

export interface SpecAction {
	readonly action: LocalNode;
	readonly rules: readonly LocalNode[];
	/** What a validation stands behind: the action and its rules as they read now. */
	readonly fingerprint: string;
}

/**
 * What an action says, rules included, as the value its validation is recorded
 * against: its content too, so a change of an effect, a parameter or a scenario
 * after the validation sets it waiting again (criterion c0a6eef3).
 */
export function actionFingerprint(action: LocalNode, rules: readonly LocalNode[]): string {
	return JSON.stringify([action.label, action.status, rules.map((r) => [r.label, r.statement ?? '', r.status]), action.content ?? '']);
}

/** The actions under one feature node of the graph, in the graph's order, each with its rules. */
export function featureActions(graph: LocalGraph, featureNodeId: string): SpecAction[] {
	const byId = new Map(graph.nodes.map((n) => [n.id, n]));
	const under = (id: string | null): boolean => {
		const seen = new Set<string>();
		while (id && !seen.has(id)) {
			if (id === featureNodeId) return true;
			seen.add(id);
			id = byId.get(id)?.parentId ?? null;
		}
		return false;
	};
	return graph.nodes
		.filter((n) => n.kind === 'action' && under(n.parentId))
		.map((action) => {
			const rules = graph.nodes.filter((n) => n.kind === 'rule' && n.parentId === action.id);
			return { action, rules, fingerprint: actionFingerprint(action, rules) };
		});
}

/** The features of the graph whose actions a person validates: the ones the request touches, not the ones it only reaches. */
export const touchedFeatureNodes = (graph: LocalGraph): LocalNode[] => graph.nodes.filter((n) => n.kind === 'feature' && n.status !== 'reached');

/** Actual changes need review; a standing explicit refusal remains reachable even on inherited context (041586c7). */
export function reviewActions(graph: LocalGraph, featureNodeId: string, hasStandingRefusal: (actionId: string) => boolean = () => false): SpecAction[] {
	return featureActions(graph, featureNodeId).filter(({ action, rules }) =>
		action.status !== 'existing' && action.status !== 'reached'
		|| rules.some((rule) => rule.status !== 'existing' && rule.status !== 'reached')
		|| hasStandingRefusal(action.id)
	);
}
