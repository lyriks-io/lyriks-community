import type { SupervisionTab } from '$domain/supervision';
import type { HelpEntry } from '$ui/design-system';

/**
 * Plain-language documentation for the AI Governance section. Written for an
 * enterprise reader whose job is to control the COST and QUALITY of AI token
 * spend: what each surface is for, how to use it, and why it matters for
 * governance. Consumed by the `?` HelpTip buttons on the page and each tab.
 */
export const SUPERVISION_HELP: HelpEntry = {
	title: 'Supervision',
	what: 'Supervision is where the specification becomes policy: product maturity, coherence, budgets and team rules compile into decisions that govern which AI models run, how much they may spend, and who is accountable. It is the third pillar next to the 360° spec and the coherence engine, the manager’s cockpit.',
	how: [
		'Task tracking: assign spec scopes to people and keep the work on pace.',
		'AI policy: set your AI-usage rules and watch live cost checks.',
		'AI Gateway: give each member a budgeted AI key and see real spend.',
		'Traceability: keep an audit trail of every decision.'
	],
	value:
		'One place to answer the three governance questions: who is doing what, is AI spend under control and within policy, and can every euro of token spend be attributed to a real person and a real decision. The chain at the top shows how a specification signal becomes a rule, a gateway decision, and attributed usage.'
};

export const TAB_HELP: Record<SupervisionTab, HelpEntry> = {
	tasks: {
		title: 'Task tracking',
		what: 'Assign parts of the specification (a step, a feature core, or a free topic) to team members and track progress and pace, so parallel work stays aligned and nothing quietly stalls.',
		how: [
			'Click Assign to give a member a scope, a type and a due window.',
			'Click a status chip to advance it: To do → In progress → In review → Done.',
			'Read team pace and the Rhythm & alignment risks panel to spot who is behind, blocked, or unassigned.'
		],
		value:
			'This is the quality side of governance: before you spend tokens generating from a spec, the work behind it should be owned, visible and on pace. It surfaces drift early, when it is cheap to fix, not after the budget is spent.'
	},
	policy: {
		title: 'AI policy',
		what: 'Your AI-usage policy in two layers. The Live cost checks at the top are computed from the gateway’s real metered spend; the declared rules below them are the qualitative policy your organisation requires: approved tools, admissible data, required human reviews.',
		how: [
			'Read the Live cost checks: they turn amber near a limit and red when a member or the project goes over budget.',
			'Add declared rules for the tools, data and reviews your org mandates.',
			'A wired LiteLLM proxy makes the checks “Live”; with no proxy they stay advisory (local).'
		],
		value:
			'It turns policy from a static checklist into a monitored control. Compliance is the other half of cost/quality governance: it proves AI usage stayed inside the rules, and automatically flags the moment real spend breaches a budget.'
	},
	gateway: {
		title: 'AI Gateway',
		what: 'The cost cockpit. First the governor decides whether the spec is mature and coherent enough to be worth spending tokens on. Then each member gets their own budgeted LiteLLM key, so AI spend is capped per person and every euro is attributable.',
		how: [
			'Read the verdict (Hold, Guardrails, or Clear), computed from live readiness and coherence.',
			'Provision a key per member with a monthly budget (it auto-resets each month on the proxy).',
			'Apply guardrails to LiteLLM, then Pull live spend to see each person’s real cost, tokens and recent calls.'
		],
		value:
			'This is the core FinOps control. It stops tokens going to an immature or incoherent spec, caps spend per member with monthly-resetting budgets, and attributes every call to a real login, so cost is controlled at the source and never anonymous.'
	},
	traceability: {
		title: 'Traceability',
		what: 'A durable, searchable log of the decisions behind the specification: what was decided, the rationale, the alternatives considered, and who decided.',
		how: [
			'Click Record a decision and capture the choice, why, and the alternatives.',
			'Filter by area or status, or search the rationale to find a past call.'
		],
		value:
			'An audit-ready record of the “why” behind scope and spend decisions. When a review asks why a budget, a model choice, or a scope was set the way it was, the answer is one search away.'
	}
};
