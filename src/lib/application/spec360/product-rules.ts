import { anchorOf } from '$domain/discussions';
import type { KernelRulesReadModel } from '../specification/index-feature-rules';

/**
 * The rules the whole product keeps (ac-rules-product-card): the project's own
 * invariants, the lines no single feature owns, read at the head of the
 * Features page. The invariants Lyriks generates from the Data map (their ids
 * are the keys of the data section's `rules.generated`) are rules about one
 * table: they read on the Data map with their table, never here.
 */

export interface ProductRule {
	/** The engine's invariant id, the rule's anchor ref. */
	readonly id: string;
	/** Its EARS sentence. */
	readonly text: string;
}

/** The anchor a product rule is discussed and validated under: a rule of no feature. */
export const productRuleAnchor = (id: string): string => anchorOf('rule', 'project', id);

export function productRules(rules: KernelRulesReadModel, generatedFromData: Readonly<Record<string, unknown>> = {}): ProductRule[] {
	const project = rules.groups.find((g) => g.featureId === null);
	if (!project) return [];
	return project.rules
		.filter((r) => r.origin.kind === 'project' && r.nodeId && !(r.nodeId in generatedFromData))
		.map((r) => ({ id: r.nodeId, text: r.statement }));
}
