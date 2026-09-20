import type { AddElaborationItem, ElaborationInput } from './report';
import { shortLabel } from './report';
import { dependencyCycleMembers } from './dependency-cycles';

export function elaborationFeatureActions(input: ElaborationInput, add: AddElaborationItem): void {
	if (!input.features) return;
	const draft = input.features;
	const ids = new Set(draft.features.map(f => f.id));
	const cycles = dependencyCycleMembers(new Map(draft.features.map(f => [f.id, draft.leafMeta?.[f.id]?.dependsOn ?? []])));
	for (const feature of draft.features) {
		const meta = draft.leafMeta?.[feature.id];
		const dependencies = [...new Set(meta?.dependsOn ?? [])];
		const blockedBy = dependencies.filter(id => !ids.has(id) || draft.leafMeta?.[id]?.status !== 'done');
		const base = { section: 'features', subjectId: feature.id, requiresUserDecision: false };
		const label = shortLabel(feature.name || feature.id);
		if (cycles.has(feature.id)) add('feature-cycle', {
			...base, kind: 'action', priority: 1, path: `leafMeta.${feature.id}.dependsOn`,
			observation: `"${label}" belongs to a dependency cycle.`,
			prompt: 'Review the dependency cycle and clarify the intended order or split of responsibilities before scheduling the affected work.'
		});
		// One list: the model's, which holds the criteria projected from this panel AND
		// the ones an AI client wrote. A feature the model does not know yet is answered
		// by the draft, so the question still works before the first save.
		const modelCriteria = input.acceptanceCriteriaByFeature?.[feature.id];
		const criterionCount = modelCriteria ?? (meta?.acceptanceCriteria ?? []).filter(c => c.text.trim()).length;
		if (criterionCount === 0) add('feature-acceptance', {
			...base, kind: 'question', priority: 2, path: `leafMeta.${feature.id}.acceptanceCriteria`,
			observation: `"${label}" has no recorded acceptance criterion.`,
			prompt: 'Which input, observable result, failure case and tolerance should a real implementation test check?', requiresUserDecision: true
		});
		for (const dependency of dependencies) {
			if (dependency === feature.id || !ids.has(dependency)) add('feature-dependency', {
				...base, kind: 'action', priority: 1, path: `leafMeta.${feature.id}.dependsOn.${dependency}`,
				observation: `"${label}" has a ${dependency === feature.id ? 'self' : 'missing'} dependency.`,
				prompt: 'Inspect the intended dependency and repair its reference before planning implementation.'
			});
		}
		if (meta?.status !== 'done') add('feature-work', {
			...base, kind: 'action', priority: meta?.status === 'in-progress' ? 2 : 3,
			path: `leafMeta.${feature.id}.status`, blockedBy,
			observation: `"${label}" is ${meta?.status ?? 'backlog'}.`,
			prompt: blockedBy.length ? 'Resolve the listed feature dependencies before implementing this feature; authoring its requirements can continue.' : 'Inspect the feature behavior, acceptance criteria and current implementation evidence before starting or continuing implementation.'
		});
	}
}
