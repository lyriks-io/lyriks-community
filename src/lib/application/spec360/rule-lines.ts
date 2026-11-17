import type { ActionRule, FeatureActionView } from './features';

/**
 * The rules an action obeys as the lines read under it (criterion 7d1e80b6):
 * the refusals that share one sentence read it once, over one line per
 * condition with the message it shows; every other rule is one line of its
 * own. Pure.
 */

/** One refusal of a shared sentence: the condition that refuses, the message it shows. */
export interface RefusalLine {
	readonly rule: ActionRule;
	readonly condition: string;
	readonly message: string;
}

export interface ActionRuleLines {
	/** The sentence the refusals share, read once above them; null when none share one. */
	readonly lead: string | null;
	readonly refusals: readonly RefusalLine[];
	readonly others: readonly ActionRule[];
}

export function ruleLines(action: Pick<FeatureActionView, 'refusalLead' | 'rules'>): ActionRuleLines {
	const refused = action.refusalLead ? action.rules.filter((r) => r.refusal) : [];
	return {
		lead: refused.length > 0 ? action.refusalLead : null,
		refusals: refused.map((rule) => ({ rule, condition: rule.refusal!.case, message: rule.refusal!.message })),
		others: action.rules.filter((r) => !refused.includes(r))
	};
}

export type RuleDisplayGroup = 'product' | 'technical' | 'other';

export interface GroupedRuleLines {
	readonly kind: RuleDisplayGroup;
	readonly title: string;
	/** Ordered runs: a shared refusal sentence never crosses a group or an ordinary rule. */
	readonly runs: readonly ActionRuleLines[];
}

/** A display convention over saved categories, never an interpretation of the sentence (criterion ad995374). */
export function ruleDisplayGroup(rule: Pick<ActionRule, 'kind' | 'category'>): RuleDisplayGroup {
	if (rule.kind === 'invariant') return 'other';
	switch (rule.category) {
		case 'business':
		case 'billing_quota':
		case 'permissions':
		case 'compliance':
			return 'product';
		case 'security':
		case 'validation':
		case 'data':
		case 'error_handling':
			return 'technical';
		default:
			return 'other';
	}
}

/** Preserve rule order; only consecutive refusals can safely share a sentence (criterion d9c7ce1a). */
function orderedRuns(rules: readonly ActionRule[], lead: string | null): ActionRuleLines[] {
	const runs: ActionRuleLines[] = [];
	let refusals: ActionRule[] = [];
	const flush = () => {
		if (refusals.length > 0) runs.push(ruleLines({ refusalLead: refusals.length > 1 ? lead : null, rules: refusals }));
		refusals = [];
	};
	for (const rule of rules) {
		if (lead && rule.refusal) refusals.push(rule);
		else {
			flush();
			runs.push(ruleLines({ refusalLead: null, rules: [rule] }));
		}
	}
	flush();
	return runs;
}

export function groupedRuleLines(action: Pick<FeatureActionView, 'refusalLead' | 'rules'>): GroupedRuleLines[] {
	const rules: Record<RuleDisplayGroup, ActionRule[]> = { product: [], technical: [], other: [] };
	for (const rule of action.rules) rules[ruleDisplayGroup(rule)].push(rule);
	return [
		{ kind: 'product' as const, title: 'Product rules' },
		{ kind: 'technical' as const, title: 'Technical rules' },
		{ kind: 'other' as const, title: 'Other rules' }
	]
		.filter((group) => rules[group.kind].length > 0)
		.map((group) => ({ ...group, runs: orderedRuns(rules[group.kind], action.refusalLead) }));
}
