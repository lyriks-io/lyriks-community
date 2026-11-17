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
		what: 'One request per change to the product, read in six steps: Briefing, Solution, Specification, Simulation, Implementation and Verification. Nothing a request changes is written into the specification before the change is declared live. The Roadmap view plans the releases its features ship in.',
		how: [
			'Open a request with New change, then answer the Briefing and the Solution in your own words, or let your AI suggest the answers: accept or reject each suggestion, and answer the question it asks there.',
			'Validate each answer, then each element of the Specification: a step opens once a person has validated what the step before holds.',
			'Read the Simulation, the impact of the change on the product as it would be and the evolutions in progress it meets, then freeze the version and move to the Implementation.',
			'Read the Verification of what was built against the frozen version, decide each line of its report, then close the evolution.',
			'Some acts have no control on this page: waiving a gate with a stated reason and lifting a waiver, rewording a suggestion or asking members to look at it, skipping, postponing or taking back a question, naming who validates and how many validations an answer needs, marking a step not applicable, and logging the remarks of the acceptance walkthrough and writing them back into the spec. They go through the API, or through your AI over the Lyriks MCP where you work alone: in a workspace of several members most of them are a decision a person takes, and an AI is refused them.'
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
		what: 'The feature tree: the product broken into families and leaf features, with MVP scope. The release roadmap is a view of Evolution.',
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
		what: 'How the product looks and flows: the design system a coding agent reads through the MCP (get_design_system), the journeys and the screens they visit.',
		how: [
			'Write the design system from the brand: identity, colors, typography, examples.',
			'Map the journeys step by step, with the test fixtures they need.',
			'List every screen with its route and the steps that visit it.'
		],
		value:
			'A precise design system and an honest screen inventory are what an AI coder needs to ship the right UI the first time.'
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
