/**
 * The `disabled` marker of the behaviour model, read off a snapshot as the
 * engine writes it (unspaghettit: `Disabled`, `DisabledElements`). A disabled
 * element stays in the model under its id, readable, and every reading leaves
 * it out: the engine filters it where it loads the model, and the platform does
 * the same where it reads a snapshot in process (the maturity), with this.
 *
 * Wire contract, like the rest of this folder: a field the engine writes and
 * the platform reads, so it is parsed defensively.
 */

/** Who disabled the element, when and why. */
export interface DisabledMarker {
	readonly by: string;
	readonly at: string;
	readonly reason: string;
}

type Node = Record<string, unknown>;

const rows = (v: unknown): Node[] => (Array.isArray(v) ? v.filter((x): x is Node => !!x && typeof x === 'object') : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The marker a node carries, or null when it is in force (or the marker is malformed). */
export function disabledMarkerOf(node: unknown): DisabledMarker | null {
	if (!node || typeof node !== 'object') return null;
	const marker = (node as Node).disabled;
	if (!marker || typeof marker !== 'object') return null;
	const { by, at, reason } = marker as Node;
	if (typeof reason !== 'string' || reason.trim() === '') return null;
	return { by: text(by), at: text(at), reason };
}

const inForce = (node: Node): boolean => disabledMarkerOf(node) === null;

/**
 * The feature as every reading takes it: without its disabled rules,
 * always-true statements, scenarios, goals and actions (with what they hold),
 * and empty of behaviour when the feature itself is disabled. Mirrors the
 * engine's `operativeFeature` on the raw snapshot; a feature with nothing
 * disabled comes back as it was.
 */
export function operativeSnapshotFeature<T extends Node>(feature: T): T {
	if (!inForce(feature)) {
		return {
			...feature,
			surfaces: rows(feature.surfaces).map((s) => ({ ...s, actions: [], rules: [], invariants: [] })),
			featureInvariants: [],
			reachabilityGoals: []
		};
	}
	const off = new Set(
		rows(feature.surfaces).flatMap((s) => rows(s.actions).filter((a) => !inForce(a)).map((a) => text(a.id)))
	);
	const anyOff =
		off.size > 0 ||
		rows(feature.featureInvariants).some((n) => !inForce(n)) ||
		rows(feature.reachabilityGoals).some((n) => !inForce(n)) ||
		rows(feature.surfaces).some(
			(s) =>
				rows(s.rules).some((n) => !inForce(n)) ||
				rows(s.invariants).some((n) => !inForce(n)) ||
				rows(s.actions).some((a) => rows(a.rules).some((n) => !inForce(n)) || rows(a.invariants).some((n) => !inForce(n)) || rows(a.scenarios).some((n) => !inForce(n)))
		);
	if (!anyOff) return feature;
	const replaysOff = (scenario: Node) => rows(scenario.steps).some((step) => off.has(text(step.actionId)));
	return {
		...feature,
		surfaces: rows(feature.surfaces).map((s) => ({
			...s,
			rules: rows(s.rules).filter(inForce),
			invariants: rows(s.invariants).filter(inForce),
			actions: rows(s.actions)
				.filter(inForce)
				.map((a) => ({
					...a,
					rules: rows(a.rules).filter(inForce),
					invariants: rows(a.invariants).filter(inForce),
					...(Array.isArray(a.scenarios) ? { scenarios: rows(a.scenarios).filter((sc) => inForce(sc) && !replaysOff(sc)) } : {})
				}))
		})),
		...(Array.isArray(feature.featureInvariants) ? { featureInvariants: rows(feature.featureInvariants).filter(inForce) } : {}),
		...(Array.isArray(feature.reachabilityGoals) ? { reachabilityGoals: rows(feature.reachabilityGoals).filter(inForce) } : {})
	};
}
