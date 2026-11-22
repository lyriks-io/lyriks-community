import { isFieldBuilderKind } from './builder';
import type { ProjectExperienceDraft } from './draft';

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
