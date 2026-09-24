import type { Option } from '$domain/shared';

/**
 * The vocabulary of the evolution lifecycle: one dossier carrying a change from
 * the raw need to the human acceptance walkthrough, through four stages.
 *
 * Every enum here is the one the specification names. Codes are the wire values
 * and never change; labels are what a reader sees.
 */

/** Where a change came from. Read later to say how much work customers drive. */
export const REQUEST_ORIGINS = [
	{ code: 'internal_idea', label: 'Internal idea' },
	{ code: 'customer_feedback', label: 'Customer feedback' },
	{ code: 'support_ticket', label: 'Support ticket' },
	{ code: 'market_watch', label: 'Market watch' },
	{ code: 'regulatory', label: 'Regulatory' },
	{ code: 'technical_debt', label: 'Technical debt' }
] as const satisfies readonly Option[];
export type RequestOrigin = (typeof REQUEST_ORIGINS)[number]['code'];
export const isRequestOrigin = (v: unknown): v is RequestOrigin =>
	typeof v === 'string' && (REQUEST_ORIGINS as readonly Option[]).some((o) => o.code === v);

/**
 * The four stages plus the two ends of the run. `draft` is before the request is
 * opened; `delivered` is once the change is out. The board shows the four stages
 * and Delivered, which is why it always has five columns.
 */
export const REQUEST_STAGES = [
	{ code: 'draft', label: 'Draft' },
	// The four stages are verbs: what a person does there, not what the stage is about.
	{ code: 'specification', label: 'Specify' },
	{ code: 'coherence', label: 'Challenge' },
	{ code: 'implementation', label: 'Verify' },
	{ code: 'acceptance', label: 'Accept' },
	{ code: 'delivered', label: 'Delivered' }
] as const satisfies readonly Option[];
export type RequestStage = (typeof REQUEST_STAGES)[number]['code'];
export const isRequestStage = (v: unknown): v is RequestStage =>
	typeof v === 'string' && (REQUEST_STAGES as readonly Option[]).some((s) => s.code === v);

/** The columns of the board: the four stages in flight, then Delivered. */
export const BOARD_COLUMNS: readonly RequestStage[] = [
	'specification',
	'coherence',
	'implementation',
	'acceptance',
	'delivered'
];

/** Forward order of the run. A stage only ever moves one gate at a time. */
export const STAGE_ORDER: readonly RequestStage[] = [
	'draft',
	'specification',
	'coherence',
	'implementation',
	'acceptance',
	'delivered'
];

export const REQUEST_STATUSES = [
	{ code: 'open', label: 'Open' },
	{ code: 'closed', label: 'Closed' },
	{ code: 'deleted', label: 'Deleted' }
] as const satisfies readonly Option[];
export type RequestStatus = (typeof REQUEST_STATUSES)[number]['code'];
export const isRequestStatus = (v: unknown): v is RequestStatus =>
	typeof v === 'string' && (REQUEST_STATUSES as readonly Option[]).some((s) => s.code === v);

/** The five named tiers of the specification maturity score. */
export const MATURITY_TIERS = [
	{ code: 'idea', label: 'Idea' },
	{ code: 'framed', label: 'Framed' },
	{ code: 'functional', label: 'Functional' },
	{ code: 'complete', label: 'Complete' },
	{ code: 'ready', label: 'Ready' }
] as const satisfies readonly Option[];
export type MaturityTier = (typeof MATURITY_TIERS)[number]['code'];

/** How far a block of the dossier page has got. Every block reports one of these. */
export const BLOCK_STATES = [
	{ code: 'empty', label: 'Empty' },
	{ code: 'in_progress', label: 'In progress' },
	{ code: 'complete', label: 'Complete' },
	{ code: 'validated', label: 'Validated' }
] as const satisfies readonly Option[];
export type BlockState = (typeof BLOCK_STATES)[number]['code'];

/** The five axes the coherence engine walks. */
export const COHERENCE_AXES = [
	{ code: 'semantic', label: 'Semantic' },
	{ code: 'functional', label: 'Functional' },
	{ code: 'structural', label: 'Structural' },
	{ code: 'behavioural', label: 'Behavioural' },
	{ code: 'access_and_data', label: 'Access and data' }
] as const satisfies readonly Option[];
export type CoherenceAxis = (typeof COHERENCE_AXES)[number]['code'];
export const isCoherenceAxis = (v: unknown): v is CoherenceAxis =>
	typeof v === 'string' && (COHERENCE_AXES as readonly Option[]).some((a) => a.code === v);

/** How badly a coherence finding hurts. Only `blocking` holds a request at the gate. */
export const FINDING_SEVERITIES = [
	{
		code: 'blocking',
		label: 'Blocking',
		hint: 'A contradiction the existing specification cannot absorb. It holds the request at the gate until it is fixed, accepted as it stands, or crossed with a named waiver.'
	},
	{
		code: 'major',
		label: 'Major',
		hint: 'A real disagreement somebody has to arbitrate, but the request keeps moving while it is open.'
	},
	{
		code: 'minor',
		label: 'Minor',
		hint: 'Worth knowing about, not worth stopping for.'
	}
] as const satisfies readonly Option[];
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number]['code'];
export const isFindingSeverity = (v: unknown): v is FindingSeverity =>
	typeof v === 'string' && (FINDING_SEVERITIES as readonly Option[]).some((s) => s.code === v);

/**
 * The three things an author might do to the spec. They are read separately and
 * never merged: removing does not break what adding breaks.
 */
export const IMPACT_HYPOTHESES = [
	{ code: 'add', label: 'Add' },
	{ code: 'change', label: 'Change' },
	{ code: 'remove', label: 'Remove' }
] as const satisfies readonly Option[];
export type ImpactHypothesis = (typeof IMPACT_HYPOTHESES)[number]['code'];
export const isImpactHypothesis = (v: unknown): v is ImpactHypothesis =>
	typeof v === 'string' && (IMPACT_HYPOTHESES as readonly Option[]).some((h) => h.code === v);

/**
 * The six kinds of node an impact list is split by. The six are never mixed.
 *
 * The labels are the words a reader of the product has. "Leaf" is how the tree
 * is spoken about in here; on screen the same thing is a feature, sitting under
 * a core, holding actions, and that is the path an impact names.
 */
export const IMPACT_SECTIONS = [
	{
		code: 'leaves',
		label: 'Features and actions',
		hint: 'The product tree: a core is a large part of the product, it holds features, and a feature holds the actions people run inside it.'
	},
	{
		code: 'screens_and_journeys',
		label: 'Screens and journeys',
		hint: 'What a person sees, and the paths they walk through it.'
	},
	{
		code: 'entities_and_fields',
		label: 'Entities and fields',
		hint: 'What is stored: the records the product keeps and the values inside them.'
	},
	{
		code: 'rules_and_scenarios',
		label: 'Rules and scenarios',
		hint: 'What the product refuses or guarantees, and the scenarios that prove it still does.'
	},
	{
		code: 'permissions',
		label: 'Permissions',
		hint: 'Who may do what, once the change ships.'
	},
	{
		code: 'glossary_terms',
		label: 'Glossary terms',
		hint: 'The agreed words, one per concept, so two screens never name the same thing differently.'
	},
	{
		code: 'code',
		label: 'Code',
		hint: 'The files the implementation index anchors on what moves: where the change lands in the repository.'
	}
] as const satisfies readonly Option[];
export type ImpactSection = (typeof IMPACT_SECTIONS)[number]['code'];
export const isImpactSection = (v: unknown): v is ImpactSection =>
	typeof v === 'string' && (IMPACT_SECTIONS as readonly Option[]).some((s) => s.code === v);

/**
 * What an impacted node IS. A feature and one of its actions cost nothing alike
 * and are not read the same way, so the list never leaves the reader guessing
 * which of the two a row names.
 *
 * The kinds are the things this product actually holds, section by section: a
 * core, a feature and its actions; a screen or a journey; a database, an entity,
 * a field; a rule, a scenario, an open question, a constraint; a role and a
 * permission; a term.
 */
export const IMPACT_NODE_KINDS = [
	{ code: 'core', label: 'Core' },
	{ code: 'feature', label: 'Feature' },
	{ code: 'action', label: 'Action' },
	{ code: 'screen', label: 'Screen' },
	{ code: 'journey', label: 'Journey' },
	{ code: 'database', label: 'Database' },
	{ code: 'entity', label: 'Entity' },
	{ code: 'field', label: 'Field' },
	{ code: 'rule', label: 'Rule' },
	{ code: 'scenario', label: 'Scenario' },
	{ code: 'issue', label: 'Open question' },
	{ code: 'constraint', label: 'Constraint' },
	{ code: 'role', label: 'Role' },
	{ code: 'permission', label: 'Permission' },
	{ code: 'term', label: 'Term' },
	// Read against a codebase, an impact sometimes lands on a file rather than on
	// anything the specification names: the theme block every colour comes from
	// belongs to no feature, and saying so beats filing it under one.
	{ code: 'file', label: 'File' }
] as const satisfies readonly Option[];
export type ImpactNodeKind = (typeof IMPACT_NODE_KINDS)[number]['code'];
export const isImpactNodeKind = (v: unknown): v is ImpactNodeKind =>
	typeof v === 'string' && (IMPACT_NODE_KINDS as readonly Option[]).some((k) => k.code === v);

/**
 * What an impact means for the REPOSITORY, which is a different question from
 * what it means for the specification.
 *
 * A change to the spec can land in code as four things and only four: something
 * that has to be written, something that has to be edited where it already
 * sits, something that has to go, and something nobody touches that breaks
 * anyway if the rest is done carelessly. The last one is the reason a code
 * briefing exists at all: it is the work nobody plans for.
 */
export const CODE_WORK = [
	{ code: 'add', label: 'To add', hint: 'Code that does not exist yet, anywhere.' },
	{
		code: 'change',
		label: 'To change',
		hint: 'Code that exists and has to be edited where it already sits.'
	},
	{
		code: 'remove',
		label: 'To delete',
		hint: 'Code the change makes wrong or redundant, which has to go rather than be left to rot.'
	},
	{
		code: 'at_risk',
		label: 'At risk',
		hint: 'Nothing to edit here, and it breaks anyway if the rest is done carelessly. This is the list a review reads.'
	}
] as const satisfies readonly Option[];
export type CodeWork = (typeof CODE_WORK)[number]['code'];
export const isCodeWork = (v: unknown): v is CodeWork =>
	typeof v === 'string' && (CODE_WORK as readonly Option[]).some((w) => w.code === v);

/**
 * How much an impacted node costs to follow. Printed on the board card.
 *
 * It is the WORK the impact implies, never how important the node is: a
 * glossary term everyone reads can be a low, and a table nobody has heard of a
 * high, because one is a word and the other is a migration.
 */
export const IMPACT_SEVERITIES = [
	{
		code: 'none',
		label: 'None',
		hint: 'Nothing to do. It is listed so you know it was looked at and cleared, rather than missed.'
	},
	{
		code: 'low',
		label: 'Low',
		hint: 'A small edit where it already sits. Minutes, and no decision to take.'
	},
	{
		code: 'medium',
		label: 'Medium',
		hint: 'Real work, and somebody has to decide how it is done before it is done.'
	},
	{
		code: 'high',
		label: 'High',
		hint: 'Expensive, or risky enough that getting it wrong is visible in the product. Plan it rather than discover it.'
	},
	{
		code: 'blocking',
		label: 'Blocking',
		hint: 'The change cannot ship until this is settled. It is not a cost, it is a stop.'
	}
] as const satisfies readonly Option[];
export type ImpactSeverity = (typeof IMPACT_SEVERITIES)[number]['code'];
export const isImpactSeverity = (v: unknown): v is ImpactSeverity =>
	typeof v === 'string' && (IMPACT_SEVERITIES as readonly Option[]).some((s) => s.code === v);

/**
 * The five verdicts of the implementation report. Exactly one per line, never
 * two, never none.
 */
export const IMPLEMENTATION_VERDICTS = [
	{ code: 'conform', label: 'Conform' },
	{ code: 'non_conform', label: 'Non-conform' },
	{ code: 'missing', label: 'Missing' },
	{ code: 'out_of_scope', label: 'Out of scope' },
	{ code: 'regression', label: 'Regression' }
] as const satisfies readonly Option[];
export type ImplementationVerdict = (typeof IMPLEMENTATION_VERDICTS)[number]['code'];
export const isImplementationVerdict = (v: unknown): v is ImplementationVerdict =>
	typeof v === 'string' && (IMPLEMENTATION_VERDICTS as readonly Option[]).some((v2) => v2.code === v);

/** What a reviewer decided about one line. Every line ends somewhere else than undecided. */
export const LINE_DECISIONS = [
	{ code: 'undecided', label: 'Undecided' },
	{ code: 'validated', label: 'Validated' },
	{ code: 'invalidated', label: 'Invalidated' },
	{ code: 'adopted', label: 'Adopted into the spec' },
	{ code: 'removed', label: 'Removed from the code' }
] as const satisfies readonly Option[];
export type LineDecision = (typeof LINE_DECISIONS)[number]['code'];
export const isLineDecision = (v: unknown): v is LineDecision =>
	typeof v === 'string' && (LINE_DECISIONS as readonly Option[]).some((d) => d.code === v);

/**
 * Where the report's verdicts come from. Only the crossing of specified
 * requirements with implementation coverage is accepted: the agent's own account
 * of what it did is a claim, not evidence.
 */
export const DERIVATION_SOURCES = [
	{ code: 'requirement_crossing', label: 'Requirement crossing' },
	{ code: 'agent_account', label: 'Agent account' }
] as const satisfies readonly Option[];
export type DerivationSource = (typeof DERIVATION_SOURCES)[number]['code'];

/** What a reader decided about one LLM proposal. */
export const PROPOSAL_DECISIONS = [
	{ code: 'pending', label: 'Pending' },
	{ code: 'accepted', label: 'Accepted' },
	{ code: 'refused', label: 'Refused' },
	{ code: 'commented', label: 'Commented' },
	{ code: 'reworded', label: 'Reworded' }
] as const satisfies readonly Option[];
export type ProposalDecision = (typeof PROPOSAL_DECISIONS)[number]['code'];
export const isProposalDecision = (v: unknown): v is ProposalDecision =>
	typeof v === 'string' && (PROPOSAL_DECISIONS as readonly Option[]).some((d) => d.code === v);

/** How an acceptance observation is typed. A revealed need is the one no upstream check finds. */
export const OBSERVATION_TYPES = [
	{ code: 'defect', label: 'Defect' },
	{ code: 'adjustment', label: 'Adjustment' },
	{ code: 'revealed_need', label: 'Revealed need' }
] as const satisfies readonly Option[];
export type ObservationType = (typeof OBSERVATION_TYPES)[number]['code'];
export const isObservationType = (v: unknown): v is ObservationType =>
	typeof v === 'string' && (OBSERVATION_TYPES as readonly Option[]).some((t) => t.code === v);

/** What the observer walked. A remark on the prototype does not weigh the same as one on what shipped. */
export const WALKTHROUGH_TARGETS = [
	{ code: 'prototype', label: 'Prototype' },
	{ code: 'delivered_product', label: 'Delivered product' }
] as const satisfies readonly Option[];
export type WalkthroughTarget = (typeof WALKTHROUGH_TARGETS)[number]['code'];
export const isWalkthroughTarget = (v: unknown): v is WalkthroughTarget =>
	typeof v === 'string' && (WALKTHROUGH_TARGETS as readonly Option[]).some((t) => t.code === v);

/** How an observation thread ends. Exactly one ruling per thread. */
export const OBSERVATION_RULINGS = [
	{ code: 'open', label: 'Open' },
	{ code: 'validated', label: 'Validated' },
	{ code: 'invalidated', label: 'Invalidated' },
	{ code: 'deferred', label: 'Deferred' },
	{ code: 'requalified', label: 'Requalified' }
] as const satisfies readonly Option[];
export type ObservationRuling = (typeof OBSERVATION_RULINGS)[number]['code'];
export const isObservationRuling = (v: unknown): v is ObservationRuling =>
	typeof v === 'string' && (OBSERVATION_RULINGS as readonly Option[]).some((r) => r.code === v);

/** What a validated observation becomes when it is folded back into the spec. */
export const INJECTION_KINDS = [
	{ code: 'acceptance_criterion', label: 'Acceptance criterion' },
	{ code: 'behavior_rule', label: 'Behaviour rule' }
] as const satisfies readonly Option[];
export type InjectionKind = (typeof INJECTION_KINDS)[number]['code'];
export const isInjectionKind = (v: unknown): v is InjectionKind =>
	typeof v === 'string' && (INJECTION_KINDS as readonly Option[]).some((k) => k.code === v);

/** The five things that can change the fate of a request. All land on one timeline. */
export const HISTORY_ENTRY_TYPES = [
	{ code: 'stage_crossing', label: 'Stage crossing' },
	{ code: 'waiver', label: 'Waiver' },
	{ code: 'accepted_proposal', label: 'Accepted proposal' },
	{ code: 'withdrawn_proposal', label: 'Withdrawn proposal' },
	{ code: 'proposal_verdict', label: 'Proposal verdict' },
	{ code: 'verdict_decision', label: 'Verdict decision' },
	{ code: 'acceptance_ruling', label: 'Acceptance ruling' },
	{ code: 'field_signature', label: 'Signature' },
	{ code: 'field_thread', label: 'Field thread' },
	{ code: 'readiness_exclusion', label: 'Readiness exclusion' },
	{ code: 'spec_frozen', label: 'Spec frozen' },
	{ code: 'spec_amended', label: 'Spec amended' },
	{ code: 'draft_change', label: 'Draft change' }
] as const satisfies readonly Option[];
export type HistoryEntryType = (typeof HISTORY_ENTRY_TYPES)[number]['code'];
export const isHistoryEntryType = (v: unknown): v is HistoryEntryType =>
	typeof v === 'string' && (HISTORY_ENTRY_TYPES as readonly Option[]).some((t) => t.code === v);

/**
 * Where a thread on a field stands. Open: someone is waiting. Answered: the
 * question got its answer. Turned into a change: it produced the new value.
 */
export const FIELD_THREAD_STATES = [
	{ code: 'open', label: 'Open' },
	{ code: 'answered', label: 'Answered' },
	{ code: 'turned_into_change', label: 'Turned into a change' }
] as const satisfies readonly Option[];
export type FieldThreadState = (typeof FIELD_THREAD_STATES)[number]['code'];
export const isFieldThreadState = (v: unknown): v is FieldThreadState =>
	typeof v === 'string' && (FIELD_THREAD_STATES as readonly Option[]).some((s) => s.code === v);

/**
 * Whether an author is a person or an AI client. The distinction is load-bearing
 * throughout: a client may write and report, but every DECISION belongs to a
 * person.
 */
export const AUTHOR_KINDS = [
	{ code: 'person', label: 'Person' },
	{ code: 'ai_client', label: 'AI client' }
] as const satisfies readonly Option[];
export type AuthorKind = (typeof AUTHOR_KINDS)[number]['code'];
export const isAuthorKind = (v: unknown): v is AuthorKind =>
	typeof v === 'string' && (AUTHOR_KINDS as readonly Option[]).some((k) => k.code === v);

/** The canonical sections a dossier field can write through to. */
export const CANONICAL_SECTIONS = [
	'scope',
	'foundation',
	'users',
	'features',
	'experience',
	'rules',
	'data',
	'glossary',
	'architecture'
] as const;
export type CanonicalSection = (typeof CANONICAL_SECTIONS)[number];
export const isCanonicalSection = (v: unknown): v is CanonicalSection =>
	typeof v === 'string' && (CANONICAL_SECTIONS as readonly string[]).includes(v);

/** The furthest the impact engine walks. Past it the result is the whole project. */
export const MAX_IMPACT_DEPTH = 5;
/** The furthest the read-only graph lens walks around the main leaf. */
export const MAX_LENS_DEPTH = 3;
