import type { KernelRule } from './index-feature-rules';

/**
 * Arranges one feature's rules the way its spec is written: by surface, then by
 * action, with the surface's own rules and statements after its actions. The
 * grouping is read from each rule's origin, so it never drifts from the model,
 * and it runs after filtering, so a filtered list keeps the same shape.
 */

/** One action and the rules and statements attached to it. */
export interface ActionRules {
	actionId: string;
	actionName: string;
	/**
	 * Set when two or more of its rules refuse it under a condition: the one
	 * sentence they share, each of them then reading as a line under it.
	 */
	refusalLead: string | null;
	rules: KernelRule[];
}

/** One surface: its actions, then its own rules and statements. */
export interface SurfaceRules {
	surfaceId: string;
	surfaceName: string;
	actions: ActionRules[];
	/** Rules and always-true statements of the surface itself, attached to no action. */
	own: KernelRule[];
	count: number;
}

export interface PlacedRules {
	surfaces: SurfaceRules[];
	/** Statements of the whole feature, or of the project. */
	featureWide: KernelRule[];
}

export function nestKernelRules(rules: readonly KernelRule[]): PlacedRules {
	const surfaces = new Map<string, SurfaceRules>();
	const actions = new Map<string, ActionRules>();
	const featureWide: KernelRule[] = [];

	const surfaceOf = (id: string, name: string): SurfaceRules => {
		let surface = surfaces.get(id);
		if (!surface) {
			surface = {
				surfaceId: id,
				surfaceName: name,
				actions: [],
				own: [],
				count: 0
			};
			surfaces.set(id, surface);
		}
		return surface;
	};

	for (const rule of rules) {
		const o = rule.origin;
		if (o.kind !== 'action' && o.kind !== 'surface') {
			featureWide.push(rule);
			continue;
		}
		const surface = surfaceOf(o.surfaceId ?? '', o.surfaceName ?? '');
		surface.count += 1;
		if (o.kind === 'surface') {
			surface.own.push(rule);
			continue;
		}
		const key = `${o.surfaceId}:${o.actionId}`;
		let action = actions.get(key);
		if (!action) {
			action = {
				actionId: o.actionId ?? '',
				actionName: o.actionName ?? '',
				refusalLead: null,
				rules: []
			};
			actions.set(key, action);
			surface.actions.push(action);
		}
		action.rules.push(rule);
	}

	for (const action of actions.values()) action.refusalLead = sharedRefusalLead(action.rules);
	return { surfaces: [...surfaces.values()], featureWide };
}

/**
 * The sentence one action's refusals share, once two or more of its rules
 * refuse it under a condition; null below that, where the whole sentence
 * reads better than a lead over a single line.
 */
export function sharedRefusalLead(rules: readonly KernelRule[]): string | null {
	const refusals = rules.filter((r) => r.refusal);
	return refusals.length >= 2 ? refusals[0]!.refusal!.lead : null;
}
