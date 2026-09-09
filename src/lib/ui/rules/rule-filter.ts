import {
	EDGE_OUTCOMES,
	RULE_CATEGORIES,
	RULE_SOURCES,
	type ConsolidatedRule,
	type EdgeCase
} from '$domain/rules';
import type { KernelRule } from '$application/index-feature-rules';
import { createFilter, type Filter } from '$ui/design-system';

/**
 * The Rules section's filter definitions.
 *
 * The Rules tab stacks two lists of different shapes (rules folded from the
 * behavior kernel, and rules consolidated from the other Lyriks sections) that
 * a reader thinks of as ONE corpus. Both are projected onto `RuleRow` here, so
 * a single `Filter` drives both lists and one toolbar filters the whole tab.
 * This is also the pattern any other page follows to declare its own facets:
 * project the rows, list the facets, hand the filter to `FilterBar`.
 */
export interface RuleRow {
	title: string;
	description: string;
	/** Where the rule lives, as the row shows it (feature, surface, action). */
	where: string;
	/** Which section authored it: the behavior model, or an upstream Lyriks step. */
	source: string;
	/** Blocks / Allows / Invariant / Declared. */
	kind: string;
	mandatory: boolean;
}

export const BEHAVIOR_SOURCE = 'Behavior model';

const sourceLabel = (code: string) => RULE_SOURCES.find((s) => s.code === code)?.label ?? code;
const categoryLabel = (code: string) => RULE_CATEGORIES.find((c) => c.code === code)?.label ?? code;

/** A kernel rule as a filterable row. `originLabel` is the caller's own wording. */
export const kernelRuleRow = (rule: KernelRule, originLabel: string): RuleRow => ({
	title: rule.title,
	description: rule.description,
	where: originLabel,
	source: BEHAVIOR_SOURCE,
	kind: rule.kind === 'invariant' ? 'Invariant' : rule.effect === 'block' ? 'Blocks' : 'Allows',
	mandatory: rule.kind === 'invariant' || rule.effect === 'block'
});

/** A consolidated rule as a filterable row. */
export const inventoryRuleRow = (rule: ConsolidatedRule): RuleRow => ({
	title: rule.label,
	description: rule.statement,
	where: categoryLabel(rule.category),
	source: sourceLabel(rule.source),
	kind: 'Declared',
	mandatory: rule.mandatory
});

/** The whole rules corpus, one filter over both lists. */
export const createRulesFilter = (): Filter<RuleRow> =>
	createFilter<RuleRow>({
		noun: 'rules',
		placeholder: 'Search a rule, condition or where it applies…',
		fields: (r) => [r.title, r.description, r.where],
		facets: [
			{
				key: 'source',
				label: 'Declared in',
				kind: 'pills',
				value: (r) => r.source,
				hint: 'Which part of the spec authored this rule'
			},
			{
				key: 'kind',
				label: 'Effect',
				kind: 'pills',
				value: (r) => r.kind,
				options: [
					{ value: 'Blocks', label: 'Blocks' },
					{ value: 'Allows', label: 'Allows' },
					{ value: 'Invariant', label: 'Invariant' },
					{ value: 'Declared', label: 'Declared' }
				],
				hint: 'What the rule does when it fires'
			},
			{
				key: 'mandatory',
				label: 'Mandatory only',
				kind: 'toggle',
				value: (r) => r.mandatory,
				hint: 'Rules that block, rather than merely guide'
			}
		]
	});

/** Edge cases have their own vocabulary: an expected outcome and a coverage flag. */
export const createEdgeCaseFilter = (): Filter<EdgeCase> =>
	createFilter<EdgeCase>({
		noun: 'edge cases',
		placeholder: 'Search an edge case, given / when / then…',
		fields: (e) => [e.title, e.given, e.whenText, e.then],
		facets: [
			{
				key: 'outcome',
				label: 'Outcome',
				kind: 'pills',
				value: (e) => e.expectedOutcome,
				options: EDGE_OUTCOMES.map((o) => ({ value: o.code, label: o.label })),
				hint: 'What the product should do in this case'
			},
			{
				key: 'covered',
				label: 'Not covered yet',
				kind: 'toggle',
				value: (e) => !e.covered,
				hint: 'Cases still missing an implementation'
			}
		]
	});
