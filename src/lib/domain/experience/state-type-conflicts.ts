import { fieldStateType, isFieldBuilderKind, type BuilderElementNode } from './builder';
import type { ProjectExperienceDraft } from './draft';

/**
 * The authoring-level cause of a formal `TYPE_COMPAT` violation: two inputs bound
 * to the SAME state path declare DIFFERENT types (e.g. a `number` field on one
 * screen and a `text` field on another, both writing `exp.date`). The DPO engine
 * flags this as a type incompatibility but only knows opaque internal node ids;
 * detecting it here, from the authored builder, lets the Control Center point
 * "Fix now" at the exact screen + field instead of a generic step.
 */
export interface StateTypeConflictEntry {
	type: string;
	screenId: string;
	screenLabel: string;
	nodeId: string;
	fieldLabel: string;
}

export interface StateTypeConflict {
	/** The shared state path the inputs disagree on. */
	path: string;
	/** Distinct types declared on that path (≥ 2). */
	types: string[];
	entries: StateTypeConflictEntry[];
}

/**
 * Find every state path that two or more builder inputs bind with conflicting
 * types. Only inputs EXPLICITLY bound to a named state can collide — an unbound
 * input gets a unique synthetic path, so it never conflicts.
 */
export function detectStateTypeConflicts(experience: ProjectExperienceDraft): StateTypeConflict[] {
	const builder = experience.builder;
	if (!builder) return [];
	const screenName = (id: string) => experience.screens.find((s) => s.id === id)?.name || 'Screen';

	const byPath = new Map<string, StateTypeConflictEntry[]>();
	for (const node of Object.values(builder.nodes)) {
		if (node.kind !== 'element' || !isFieldBuilderKind(node.elementKind)) continue;
		const el: BuilderElementNode = node;
		if (el.wiring.binding?.targetKind !== 'state' || !el.wiring.binding.targetRef) continue;
		const path = el.wiring.binding.targetRef;
		const entry: StateTypeConflictEntry = {
			type: fieldStateType(el),
			screenId: el.surfaceId,
			screenLabel: screenName(el.surfaceId),
			nodeId: el.id,
			fieldLabel: el.label || 'Field'
		};
		const arr = byPath.get(path);
		if (arr) arr.push(entry);
		else byPath.set(path, [entry]);
	}

	const conflicts: StateTypeConflict[] = [];
	for (const [path, entries] of byPath) {
		const types = [...new Set(entries.map((e) => e.type))];
		if (types.length > 1) conflicts.push({ path, types, entries });
	}
	return conflicts;
}

/**
 * Map every state path to the first builder input that binds it (screen + node).
 * Lets a formal DPO violation — which now reports the offending state path — be
 * deep-linked straight to the authored field, even when v3's own conflict
 * heuristic didn't flag it.
 */
export function stateBindingIndex(
	experience: ProjectExperienceDraft
): Map<string, { screenId: string; nodeId: string }> {
	const index = new Map<string, { screenId: string; nodeId: string }>();
	const builder = experience.builder;
	if (!builder) return index;
	for (const node of Object.values(builder.nodes)) {
		if (node.kind !== 'element' || !isFieldBuilderKind(node.elementKind)) continue;
		const ref = node.wiring.binding?.targetKind === 'state' ? node.wiring.binding.targetRef : null;
		if (ref && !index.has(ref)) index.set(ref, { screenId: node.surfaceId, nodeId: node.id });
	}
	return index;
}

/** The "Fix now" query suffix that focuses a screen + element on the Experience page. */
export function focusAnchor(screenId: string, nodeId?: string): string {
	const node = nodeId ? `&node=${encodeURIComponent(nodeId)}` : '';
	return `?tab=screens&screen=${encodeURIComponent(screenId)}${node}`;
}
