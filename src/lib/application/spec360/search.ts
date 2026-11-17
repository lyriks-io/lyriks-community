import { readableName } from '$domain/features';
import type { SpecSearchRule } from '$domain/graph/spec-search';
import type { KernelRulesReadModel } from '../specification/index-feature-rules';
import { text } from './labels';
import type { SpecOutline } from './outline';

/**
 * The rules the search finds (criterion e11bf80b): the ones the feature pages
 * of the Specification 360° list under an action, each under the name its
 * feature reads in the tree. A rule held elsewhere (a whole screen, a feature
 * invariant, a feature outside the tree) has no action to open on, so the
 * search leaves it out rather than open a page that does not show it.
 */
export function searchRulesOf(outline: SpecOutline, rules: KernelRulesReadModel): SpecSearchRule[] {
	const names = new Map(outline.cores.flatMap((c) => c.features.map((f) => [f.id, f.name] as const)));
	return rules.groups.flatMap((group) =>
		group.rules.flatMap((r) => {
			const featureId = r.origin.featureId;
			const name = featureId ? names.get(featureId) : undefined;
			if (r.origin.kind !== 'action' || !featureId || name === undefined) return [];
			return [
				{
					featureId,
					featureName: name,
					actionName: readableName(text(r.origin.actionName ?? '')),
					ruleId: r.nodeId,
					sentence: text(r.statement),
					reason: r.hasDescription ? text(r.description) : ''
				}
			];
		})
	);
}
