import type { HelpEntry } from '$ui/design-system';
import { SUPERVISION_HELP } from '$ui/supervision/help';

/**
 * Plain-language documentation for every capability page, keyed by capability id
 * (see `capabilities.ts`). Surfaced app-wide by the top bar's `?` button, which
 * shows the entry for whatever page you're on. Written for an enterprise reader
 * whose remit is the cost and quality of what the product — and the AI generating
 * it — will produce: what each page is for, how to use it, and why it matters.
 */
/** The portfolio home's entry — the top bar's `?` outside any project. */
export const PORTFOLIO_HELP: HelpEntry = {
	title: 'Portfolio',
	what: 'Your whole product portfolio: projects grouped into enterprise domains, each card scored on coverage, maturity and readiness.',
	how: [
		'Pick a domain in the left rail to see its projects and rollups.',
		'Open a card to work on that project; its gauges come from the coherence engine.',
		'Create domains and projects from here, or move a project between domains from its card menu.'
	],
	value:
		'One glance tells you where specification effort is paying off and which projects are ready to build, before any generation cost is committed.'
};

export const CAPABILITY_HELP: Record<string, HelpEntry> = {
	scope: {
		title: 'Scope coverage',
		what: 'The external reference set for the project: what the source material says the product must cover, what is included, and which omissions were explicitly approved. It is authored by the modelling agent and has no page in the product.',
		how: [
			'The agent declares the boundary and inventories every expected capability before it authors anything.',
			'It then audits the model against that ledger and completes the project only when no blocker remains.',
			'Driven entirely through the MCP and the JSON API; there is nothing to fill in by hand.'
		],
		value:
			'This prevents a complete-looking model from hiding missing product areas. Completion is based on the agreed external scope, not on the content the model happened to generate, and because a human never fills the ledger in, passing the gate is never self-certification.'
	},
	foundation: {
		title: 'Foundation',
		what: 'Where the PRODUCT is defined: the brief, the business bet (pain, outcome, KPIs, success & kill criteria, risks), the market, and the product-level expectations on tech, security and operations. The stack itself lives in Data & Architecture; detailed rules live in Functional.',
		how: [
			'Fill the brief, then the Business tab: the problem, the expected outcome and how you will measure them.',
			'Frame the market and the product-level technical & security expectations (integrations, performance, trust).',
			'Set the product rails in the Ops tab (locales, quality budgets, UI states, fixtures).'
		],
		value:
			'A well-formed foundation is what makes the spec (and any AI generated from it) coherent and cheap to produce. Weak inputs here multiply cost downstream.'
	},
	users: {
		title: 'Users & Permissions',
		what: 'The people who will use the product (personas) and the access matrix: who is allowed to do what.',
		how: [
			'Personas tab: define each user class and their goals.',
			'Access matrix tab: grant capabilities to roles.',
			'Coverage is scored: every capability owned, every role given the access it needs.'
		],
		value:
			'Clear roles and permissions are the backbone of an enterprise-grade spec and drive the run-mode simulator’s per-persona gating.'
	},
	features: {
		title: 'Feature',
		what: 'The feature tree: the product broken into families and leaf features, with MVP scope and a release roadmap.',
		how: [
			'Build the tree of families and features.',
			'Mark what is in the MVP versus later releases.',
			'Each feature’s maturity feeds the coherence score and the AI-spend governor.'
		],
		value:
			'Features are the unit AI generation and cost governance act on. An immature feature is exactly where the governor holds spend, so an honest tree directly controls cost.'
	},
	experience: {
		title: 'Experience',
		what: 'The product’s journeys and screens: a live, clickable prototype plus the reusable component library.',
		how: [
			'Design journeys as flows of screens.',
			'Wire components and simulate the experience per persona.',
			'Verify coverage so every journey is reachable and complete.'
		],
		value:
			'A verified experience is the highest-fidelity input to AI generation: the closer to real it is, the less rework (and token spend) implementation takes.'
	},
	functional: {
		title: 'Functional',
		what: 'The behind-the-scenes logic: workflows, automations and AI agents that power the product.',
		how: [
			'Model the workflows and automations.',
			'Define the AI agents and what each is allowed to do.'
		],
		value:
			'Where automated and AI behaviour is specified: the place to set guardrails on autonomous spend before it ever runs.'
	},
	infrastructure: {
		title: 'Data & Architecture',
		what: 'Where the product runs: hosts, databases, regions and the data topology, plus the whole project as one connected graph.',
		how: [
			'Declare hosts, databases and regions.',
			'Map which entities live where.',
			'Open the Knowledge graph tab to see every context at once, and follow a node to its editor.'
		],
		value:
			'Infrastructure choices set the cost and compliance envelope: data residency and hosting are enterprise non-negotiables the spec must capture. The graph is how you spot orphans and gaps before they become expensive surprises.'
	},
	glossary: {
		title: 'Glossary',
		what: 'The project’s canonical vocabulary: approved terms, their definitions, and banned synonyms.',
		how: [
			'Add each governed term with its definition.',
			'Mark allowed versus banned synonyms.',
			'Governed words are highlighted wherever they appear in the app.'
		],
		value:
			'One canonical vocabulary stops the downstream LLM drifting. It is the cheapest quality control there is: consistent language in, consistent (and cheaper) output out.'
	},
	coherence: {
		title: 'Project health',
		what: 'The health dashboard for the whole spec: the readiness and coherence scores, the breaches behind them, and the approval queue.',
		how: [
			'Read the scores and the blocking gaps.',
			'Work the breach list to raise readiness.',
			'The AI-spend governor reads these exact scores to decide whether to spend.'
		],
		value:
			'This is the quality signal the cost governor gates on. Raising maturity here is literally what unlocks safe AI spend; low maturity means held spend.'
	},
	supervision: SUPERVISION_HELP
};
