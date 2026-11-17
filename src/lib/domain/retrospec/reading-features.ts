import type { ActionFeature, FeatureGroup, RetroItem, RetrospecSpec } from './reading';
import { clean, firstSentence } from './reading-text';

/**
 * The Features and the Actions of the review: each core's features, then each
 * feature's actions with the rules that constrain them, by the specification's
 * own ids. Pure.
 */

export function featureLayout(spec: RetrospecSpec): { groups: FeatureGroup[]; items: RetroItem[] } {
	const leaves = spec.features.features;
	let n = 0;
	const groups = spec.features.cores
		.map((core) => {
			const items = leaves
				.filter((f) => f.coreId === core.id)
				.map((f): RetroItem => {
					const actions = spec.behavior.actionsByFeature[f.id] ?? [];
					n += 1;
					return {
						id: `feature:${f.id}`,
						ref: `FT-${n}`,
						tab: 'features',
						title: clean(f.name) || f.id,
						// What a person can do in it, the way the design lists it; its description when the AI wrote no action.
						desc: actions.length > 0 ? actions.map((a) => a.name).join(' · ') : firstSentence(f.description),
						rejectable: true
					};
				});
			return { id: core.id, title: clean(core.name) || core.id, desc: firstSentence(core.description), items };
		})
		.filter((g) => g.items.length > 0);
	// A leaf filed under no known core still reads, under its own heading.
	const known = new Set(spec.features.cores.map((c) => c.id));
	const stray = leaves.filter((f) => !known.has(f.coreId));
	if (stray.length > 0) {
		groups.push({
			id: 'unfiled',
			title: 'Other features',
			desc: '',
			items: stray.map((f): RetroItem => {
				n += 1;
				return { id: `feature:${f.id}`, ref: `FT-${n}`, tab: 'features', title: clean(f.name) || f.id, desc: firstSentence(f.description), rejectable: true };
			})
		});
	}
	return { groups, items: groups.flatMap((g) => g.items) };
}

export function actionLayout(spec: RetrospecSpec): { features: ActionFeature[]; items: RetroItem[] } {
	const coreName = new Map(spec.features.cores.map((c) => [c.id, clean(c.name)]));
	let a = 0;
	let r = 0;
	const features = spec.features.features
		.map((f): ActionFeature => ({
			id: f.id,
			core: coreName.get(f.coreId) ?? '',
			name: clean(f.name) || f.id,
			actions: (spec.behavior.actionsByFeature[f.id] ?? []).map((action) => {
				a += 1;
				const item: RetroItem = { id: `action:${f.id}:${action.id}`, ref: `AC-${a}`, tab: 'actions', title: clean(action.name) || action.id, desc: clean(action.intent), rejectable: true };
				const rules = (spec.behavior.rulesByAction[`${f.id}:${action.id}`] ?? []).map((rule): RetroItem => {
					r += 1;
					return { id: `rule:${f.id}:${action.id}:${rule.id}`, ref: `RG-${r}`, tab: 'actions', title: clean(rule.text) || rule.id, desc: '', rejectable: true };
				});
				return { item, rules };
			})
		}))
		.filter((f) => f.actions.length > 0);
	return { features, items: features.flatMap((f) => f.actions.flatMap((x) => [x.item, ...x.rules])) };
}
