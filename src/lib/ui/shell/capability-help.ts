import type { HelpEntry } from '$ui/design-system';

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
	evolution: {
		title: 'Evolution',
		what: 'One dossier per change request, carrying it through four stages: the specification on a single progressive page, the coherence and impact reports that challenge it before any code, the five-verdict confrontation between what was asked and what was built, and the acceptance walkthrough whose validated remarks are folded back into the spec.',
		how: [
			'Open a request with a title, an origin and the single leaf feature answerable for the change.',
			'Fill the ten specification blocks in any order. Every field is written into the section that owns it, so nothing is duplicated here.',
			'Run the coherence check over the whole project, then read the impact under each of the three hypotheses separately: adding does not break what removing breaks.',
			'Cross a stage gate when its threshold is met, or waive it with a stated reason that stays visible until an admin lifts it.',
			'Decide every line of the implementation report, then rebrief from the refusals or amend the spec.',
			'Walk the product, log anchored observations, and fold the validated ones back before closing.'
		],
		value:
			'It is the difference between a change that was agreed and a change that merely happened. The reports are derived from the spec crossed with the code, never from what the model says it did, so the omissions and the unrequested additions surface before they become the product. And because every decision is recorded with its author and whether that author was a person or a model, a sentence questioned six months later can be traced to the decision that put it there.'
	},
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
		what: 'Where the PRODUCT is defined: the brief, the business bet (pain, outcome, KPIs, success & kill criteria, risks), the market, and the product-level expectations on tech, security and operations. The stack itself lives in Tech & Data; detailed rules live in Functional.',
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
		title: 'Features',
		what: 'The feature tree: the product broken into families and leaf features, with MVP scope and a release roadmap.',
		how: [
			'Build the tree of families and features.',
			'Mark what is in the MVP versus later releases.',
			'Each feature’s maturity identifies missing specification details.'
		],
		value:
			'Features connect product intent, behavior, implementation and acceptance evidence. An honest tree makes missing work visible.'
	},
	experience: {
		title: 'Experience',
		what: 'How the product looks and flows: the design.md a coding agent reads, the journeys and the screens they visit.',
		how: [
			'Write the design.md from the brand: identity, colors, typography, examples.',
			'Map the journeys step by step, with the test fixtures they need.',
			'List every screen with its route and the steps that visit it.'
		],
		value:
			'A precise design.md and an honest screen inventory are what an AI coder needs to ship the right UI the first time.'
	},
	functional: {
		title: 'Functional',
		what: 'The behind-the-scenes logic: workflows, automations and AI agents that power the product.',
		how: [
			'Model the workflows and automations.',
			'Define the AI agents and what each is allowed to do.'
		],
		value:
			'Where automated behavior is specified: define permissions, consequences and failure paths before implementation.'
	},
	infrastructure: {
		title: 'Tech & Data',
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
		what: 'The project’s canonical vocabulary: approved terms, their definitions, and the words to avoid.',
		how: [
			'Add each governed term with its definition.',
			'Mark allowed synonyms and the words to avoid.',
			'Governed words are highlighted wherever they appear in the app.'
		],
		value:
			'One canonical vocabulary stops the downstream LLM drifting. It is the cheapest quality control there is: consistent language in, consistent (and cheaper) output out.'
	},
	coherence: {
		title: 'Health',
		what: 'The score of the project and every point that weighs on it: the coherence gaps of every severity, what the completeness audit flags and what the code says about the spec.',
		how: [
			'Read the points, the heaviest first, and narrow them by severity.',
			'Open a point to see where it comes from and what to do, then fix it where it lives.',
			'Reject a point the product is right without, or turn it into an evolution.'
		],
		value:
			'One list and one score say how the project stands. The score helps locate gaps; it does not certify runtime correctness.'
	},
	generate: {
		title: 'Generate specs',
		what: 'The spec generator, with the guarantee tiers it runs under and the threshold it waits for.',
		how: ['Pick the guarantee tiers.', 'Set the threshold.', 'Generate the specs once nothing blocks.'],
		value: 'The generated documents are read from the same specification the project health reads.'
	},
	traceability: {
		title: 'Traceability',
		what: 'Every feature as a requirement, traced to its acceptance criteria, behavior, source and release; the named versions of the spec; and who signed off what.',
		how: [
			'Coverage: read the matrix, where each red cell is a gap to close.',
			'Baselines: freeze the spec at discovery, design or launch; each one records the scores, the feature count and a full requirements snapshot you can compare and export.',
			'Approvals: track who reviews what and record the rationale behind every approval or accepted risk.'
		],
		value:
			'A requirement nobody can trace is one nobody can defend. A lightweight worklist, not a workflow engine.'
	},
	documents: {
		title: 'Documents & Sources',
		what: 'A register of the interviews, research, links, regulations and evidence behind the spec, so any requirement can cite its source.',
		how: [
			'Register a source with its title, kind and reference.',
			'Cite it from any field of the spec.'
		],
		value:
			'Every claim says where it comes from. Not a document store: it records the reference, not the bytes.'
	}
};
