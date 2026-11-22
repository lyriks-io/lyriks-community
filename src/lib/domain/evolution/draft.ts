import { mintUuid } from '../shared';
import type { AiDelegation } from './ai-delegation';
import type { DiagramAlignment, TechnicalAlignment, TextAlignment } from './functional-sync';
import type { AiClick, LiveSession } from './live-session';
import type { ProjectClick } from './project-session';
import type { StepValidation } from './path';
import type { StepPrefill } from './step-prefill';
import type { TicketPost } from './ticket-post';
import type { DraftProofImpact } from './proof-impact';
import type {
	AuthorKind,
	CodeWork,
	CoherenceAxis,
	FieldThreadState,
	FindingSeverity,
	HistoryEntryType,
	ImpactHypothesis,
	ImpactNodeKind,
	ImpactSection,
	ImplementationVerdict,
	InjectionKind,
	LineDecision,
	ObservationRuling,
	ObservationType,
	ProposalDecision,
	RequestOrigin,
	RequestStage,
	RequestStatus,
	WalkthroughTarget,
	CanonicalSection
} from './enums';
import type { CodeTrack } from './code-branch';

/**
 * The evolution section's stored shape.
 *
 * What lives here is the DOSSIER: the request, the reports it produced, the
 * proposals waiting for a person, the acceptance notebook and the timeline. What
 * does NOT live here is any specification value: every field of the dossier page
 * writes through to the section that owns it (see `blocks.ts`), so deleting a
 * request leaves the spec it wrote exactly as it is.
 */

/** Who acted, and whether they are a person or a model. */
export interface Actor {
	readonly id: string;
	readonly kind: AuthorKind;
	/** Workspace role, which is what the permission rules read. */
	readonly role: 'viewer' | 'member' | 'admin' | 'owner';
	/**
	 * Where the act comes from. A person acts from the dossier page, or through
	 * the AI client they are talking to, which relays the decision under the
	 * person's name; the channel is stamped on the timeline so a later reader
	 * knows the decision was typed to a client, not clicked on the page. A
	 * person may also have the installation's built-in assistant do the work
	 * from the page (ac-evo-diagram-assistant): the act is still the person's.
	 */
	readonly channel?: ActorChannel;
}

export type ActorChannel = 'page' | 'ai_client' | 'assistant';

/** A named, dated exception that let a request cross a gate whose threshold was not met. */
export interface GateWaiver {
	readonly id: string;
	/** The stage the waiver opened. */
	stage: RequestStage;
	reason: string;
	grantedBy: string;
	grantedAt: string;
	/** Null while the waiver still stands. Lifting is an admin act. */
	liftedBy: string | null;
	liftedAt: string | null;
}

/** One contradiction between the request and the existing specification. */
export interface CoherenceFinding {
	readonly id: string;
	axis: CoherenceAxis;
	severity: FindingSeverity;
	title: string;
	/** The node inside the request. */
	requestNodeId: string;
	/** The node in the existing spec it collides with. A finding names both. */
	existingNodeId: string;
	/** The canonical capability and element `Fix now` opens. */
	fixNowTarget: string;
	published: boolean;
	/**
	 * `inherited` when the product already carried it before the request was
	 * first checked: it is shown, and never holds the request (the change did
	 * not cause it). `request` otherwise, the default.
	 */
	scope?: FindingScope;
	/** A person accepted it as a known risk: it stays visible and no longer holds the gate. */
	risk?: { by: string; at: string; reason: string } | null;
	/**
	 * It only says how the change gets proved (a rule proved once the request's
	 * drafts land): read as information, never a contact point (ac-evo-dock-8).
	 */
	note?: boolean;
}

/** Whether a finding holds the gate: blocking, brought by the change, and nobody accepted the risk. */
export function findingHoldsGate(f: Pick<CoherenceFinding, 'published' | 'severity' | 'scope' | 'risk'>): boolean {
	return f.published && f.severity === 'blocking' && f.scope !== 'inherited' && !f.risk;
}

/** One node the change propagates to, under one hypothesis. */
export interface ImpactFinding {
	readonly id: string;
	hypothesis: ImpactHypothesis;
	section: ImpactSection;
	/** The graph node that moves. */
	nodeId: string;
	nodeLabel: string;
	/**
	 * What the node is, so a feature is never read as one of its actions.
	 */
	nodeKind: ImpactNodeKind;
	/**
	 * What it hangs under, outermost first: a core then a feature for an action,
	 * an entity for a field. Empty when the node hangs under nothing, and the
	 * list then shows it flat rather than inventing a heading for it.
	 */
	groupPath: string[];
	/**
	 * Why this node moves, in full. The list shows the node; this is what the
	 * reader opens it for, so it is never shortened to fit a row.
	 */
	note: string;
	/**
	 * What this impact means for the repository: something to write, to edit, to
	 * delete, or to leave alone and watch. Null while nobody has read the impact
	 * against a codebase, which is the honest state before an index exists.
	 */
	codeWork: CodeWork | null;
	/** How many steps from the touched node it sits. */
	depth: number;
	/**
	 * The touched feature (or draft) the walk reached this node from. A node
	 * takes the verb of the draft that stands for the feature it hangs under,
	 * so a role reached from an amended feature reads as a change even when the
	 * same request also adds something. Absent on readings computed before it
	 * was recorded, which then read with what the request does overall.
	 */
	fromLeafId?: string;
	/** Reached from a feature the change uses as it stands (ac-evo-imp-used): to check again, never edited. */
	fromUsed?: boolean;
	/** The section change or the change to the rules the walk reached it from (ac-evo-draft-section-impact). */
	fromChange?: string;
	severity: 'none' | 'low' | 'medium' | 'high' | 'blocking';
	/**
	 * Entities only: whether following this impact implies a data migration. An
	 * entity impact that does not say is not readable, so the section stays shut
	 * until every one of them answers.
	 */
	migrationImplied: boolean | null;
	/**
	 * Rules only: `replay` when the text still holds and only needs running
	 * again, `rewrite` when a person has to write it afresh. The two cost nothing
	 * alike, so they are never counted together.
	 */
	ruleWork: 'replay' | 'rewrite' | null;
	/**
	 * True when the walk reached this node from one of the request's drafts
	 * rather than from a feature that already exists (ac-evo-ovl-1). Absent on
	 * rows computed before drafts existed, which read as "from what exists".
	 */
	fromDraft?: boolean;
}

/** One line of the implementation report: a requirement confronted with the code. */
export interface ImplementationFinding {
	readonly id: string;
	/** The iteration that produced it. Every verdict names one. */
	iteration: number;
	verdict: ImplementationVerdict;
	/** What the spec asked for. */
	requirement: string;
	/** The file the line points at. A verdict with no file behind it is not reviewable. */
	filePath: string;
	/** First and last line touched inside that file. */
	lineRange: string;
	/** Shown on a non-conform line beside what the code does. */
	specStatement: string;
	codeStatement: string;
	/** The touched feature the line was read on, when the derivation knows it. */
	leafId?: string;
	/**
	 * The element the line is about, keyed the way the engine keys it
	 * (`action:<id>`, `rule:<id>`, `criterion:<id>`, `extra:<tag>`...), and the
	 * action or screen it was read under (`action:<id>`, `surface:<id>`): what
	 * the landing maps a line to its element of Knowledge with (EVO-002).
	 * Absent on a line derived before they were recorded.
	 */
	key?: string;
	owner?: string;
	/** False when the span carries no requirement anchor: that is an out-of-scope addition. */
	hasRequirementAnchor: boolean;
	/** True when the touched span belongs to another leaf: that is a regression. */
	anchorForeignLeaf: boolean;
	/** Conform cannot be claimed without one. */
	acceptanceTestPassing: boolean;
	/**
	 * The frozen spec version the report was built against. 0 when the report
	 * predates versioning. A report naming another version than the frozen one
	 * is refused at the door, never read.
	 */
	specVersion: number;
	/**
	 * Whose line it is. `request`: an element this request brought, or one it
	 * cannot tell apart from one (absent reads as `request`, which is what every
	 * line was before the distinction). `inherited`: an element the touched
	 * feature already held when the spec was first frozen for this request, so
	 * its standing is the feature's backlog, not this change. Only request lines
	 * hold the report open.
	 */
	scope?: FindingScope;
	decision: LineDecision;
	decidedBy: string | null;
	decidedAt: string | null;
}

export type FindingScope = 'request' | 'inherited';

/** A value the model suggested for one empty spec field, waiting for a person. */
export interface Proposal {
	readonly id: string;
	/** The field it fills, named the way the form names it. */
	targetField: string;
	/** The section the value lands in, or `request` for a question of the need. */
	canonicalSection: CanonicalSection | 'request';
	canonicalPath: string;
	value: string;
	reasoning: string;
	/**
	 * The two halves of the reasoning, each named: what was read in the sources,
	 * and what was inferred from it. Empty on a proposal made before they existed,
	 * whose verdict is then carried by the flag below exactly as it was.
	 */
	whatWasRead: string;
	whatWasInferred: string;
	/** True when the reasoning says which part was read and which part was inferred. */
	reasoningSeparatesReadFromInferred: boolean;
	/** Source ids from the evidence register. A proposal citing none cannot be accepted. */
	citedSourceIds: string[];
	/** Raised before the card is offered, when the value uses a word the glossary bans. */
	bannedSynonymDetected: boolean;
	/**
	 * Each flagged word and the agreed term it stands in for, so the flag names
	 * the sense it guards instead of only saying "banned". A flag warns and never
	 * blocks the decision: only the person knows which sense they meant.
	 */
	flaggedWords: { word: string; prefer: string }[];
	/**
	 * The person's own words when they keep a flagged wording, saying the word was
	 * used in another sense. Recorded beside the value it came with. Empty when
	 * nothing was flagged or nothing was said.
	 */
	keptWordingSense: string;
	/** Who made the proposal: the only caller that may withdraw it while undecided. */
	proposedBy: string;
	decision: ProposalDecision;
	comment: string;
	acceptedBy: string | null;
	acceptedAt: string | null;
	/**
	 * The workspace members tagged to decide it (ac-evo-llm-11). Empty means one
	 * acceptance writes the value; otherwise every tagged reviewer validates
	 * before the value is written, and one invalidation refuses it.
	 */
	reviewerIds: string[];
	/** The standing verdict of each reviewer who gave one. */
	verdicts: ProposalVerdict[];
	/**
	 * The one fact the AI is missing to finish this suggestion, asked with it
	 * instead of in the thread (ac-evo-live-card-ask). Absent when it asks nothing.
	 */
	ask?: ProposalAsk;
	/** The questions and answers of the suggestions this one replaced, oldest first: why it reads as it does. */
	dialogue?: ProposalExchange[];
	/** The ids of the suggestions this one rewrote in place, oldest first, so a link to one of them still lands here (ac-evo-link-arrival-only). */
	replaces?: string[];
	/** Each line of a list suggestion a person decided on its own, oldest first (ac-evo-llm-line-decision). */
	lineDecisions?: ProposalLineDecision[];
}

/** One line of a list suggestion, accepted or rejected on its own: added to the answer, or taken away from it. */
export interface ProposalLineDecision {
	readonly line: string;
	readonly side: 'added' | 'removed';
	readonly decision: 'accepted' | 'refused';
	readonly by: string;
	readonly at: string;
}

/** A question the AI asks with its suggestion, the answers a click gives, and the person's answer once given. */
export interface ProposalAsk {
	readonly question: string;
	readonly choices: readonly string[];
	/** The question takes several answers: they show as boxes to tick (ac-evo-live-choices). */
	readonly multiple?: true;
	readonly answer?: { readonly body: string; readonly by: string; readonly at: string };
}

/** One question of the AI and the person's answer, kept on the suggestion it led to. */
export interface ProposalExchange {
	readonly question: string;
	readonly answer: string;
	readonly by: string;
	readonly at: string;
}

export interface ProposalVerdict {
	readonly by: string;
	verdict: 'validated' | 'invalidated';
	comment: string;
	at: string;
}

/** One message in an observation thread, human or model, always attributed. */
export interface ObservationMessage {
	readonly id: string;
	channel: 'human' | 'llm';
	author: string;
	authorKind: AuthorKind;
	body: string;
	postedAt: string;
}

/** A remark made while walking the product, anchored on what it concerns. */
export interface Observation {
	readonly id: string;
	type: ObservationType;
	target: WalkthroughTarget;
	body: string;
	screenId: string;
	elementId: string;
	captureAttached: boolean;
	captureAnnotated: boolean;
	status: 'draft' | 'logged';
	ruling: ObservationRuling;
	/** Written down with the ruling. An invalidation without one is refused. */
	rulingReason: string;
	assignee: string | null;
	messages: ObservationMessage[];
	/** Set by a requalification: the new request this one opened. */
	linkedRequestId: string | null;
	/** Set once the validated observation has been folded back into the spec. */
	foldedBackAt: string | null;
	foldedBackBy: string | null;
	foldedBackKind: InjectionKind | null;
	foldedBackLeafId: string | null;
}

/**
 * One person standing behind one value of one field home. A receipt of the
 * exact text signed: shown as standing only while the owning section still
 * holds that text, voided the moment it moves.
 */
export interface FieldSignature {
	readonly id: string;
	/** The field home, keyed like `fieldKey`. */
	key: string;
	signerId: string;
	signedAt: string;
	/** The exact value signed; `written` for a field edited in its own capability. */
	signedValue: string;
	/** Set when an edit voided the signature. The history keeps the name. */
	voidedAt: string | null;
	voidedBy: string | null;
}

/** One message in a field thread, human or model, always attributed. */
export interface FieldThreadMessage {
	readonly id: string;
	author: string;
	authorKind: AuthorKind;
	body: string;
	postedAt: string;
	/** The texts the message held before each edit, oldest first, kept readable (ac-evo-fthread-edit). */
	earlier?: { readonly body: string; readonly at: string }[];
	/** When it was last edited. */
	editedAt?: string;
	/** The message of the same thread this one answers; absent for a message of its own (ac-evo-fthread-reply). */
	replyTo?: string;
	/** How a person settled the conversation this message opened; absent while it is open. Only a message of its own carries it. */
	ruling?: TopicRuling;
	/** An exchange with one's own AI that nobody else reads until it is published: the person it belongs to (ac-evo-live-ask). */
	privateTo?: string;
	/** The AI's reply asks the person something and waits for their answer (ac-evo-live-scope). */
	awaitsAnswer?: true;
	/** The answers that question offers as buttons, and whether it takes several (ac-evo-live-choices). */
	choices?: string[];
	multiple?: true;
	/** The texts the AI offers in this message, each at the place it would write, for a person to accept or refuse (ac-evo-live-comment-suggests). */
	suggests?: SuggestedWrite[];
	/** How a person decided that suggestion; absent while it waits. */
	suggestion?: SuggestionDecision;
	/** Independent requirement decisions; retained when a message is replayed or rewritten. */
	requirementDecisions?: RequirementDecision[];
}

/** One text an AI message offers, at the place it would write: a step's description or one of its questions. */
export interface SuggestedWrite {
	readonly fieldPath: string;
	readonly value: string;
}

export interface RequirementDecision extends SuggestionDecision {
	readonly fieldPath: string;
	readonly line: string;
}

/** Who accepted or refused the suggestion of a message, and when. */
export interface SuggestionDecision {
	readonly state: 'accepted' | 'refused';
	readonly by: string;
	readonly at: string;
}

/** A conversation agreed with (validated) or closed (resolved), by whom and when. */
export interface TopicRuling {
	readonly state: 'validated' | 'resolved';
	readonly by: string;
	readonly at: string;
}

/**
 * The conversation about one field home, held next to the field. Never
 * deleted; a thread that became a change stays readable and names the value
 * it produced and the person who wrote it.
 */
export interface FieldThread {
	readonly id: string;
	/** The field home, keyed like `fieldKey`. */
	key: string;
	state: FieldThreadState;
	messages: FieldThreadMessage[];
	changeValue: string | null;
	changedBy: string | null;
	changedAt: string | null;
}

/** One freeze of the specification: the number and the moment. Every one stays readable. */
export interface FrozenVersion {
	readonly version: number;
	at: string;
	by: string;
	/** What the version held, kept at the freeze and never changed after (ac-evo-freeze-5). Absent on versions frozen before copies were kept. */
	readonly snapshot?: import('./versions').VersionSnapshot;
}

/** One entry of the append-only timeline. */
export interface HistoryEntry {
	readonly id: string;
	type: HistoryEntryType;
	summary: string;
	authorId: string;
	authorKind: AuthorKind;
	recordedAt: string;
	/** The proposal an accepted value came from. Empty when a person typed it. */
	proposalId: string | null;
	/** The person who accepted a proposed value. */
	acceptedByPersonId: string | null;
	/** Set when a later entry replaces this one. The original stays readable. */
	supersededById: string | null;
	/** The channel the author acted through (see Actor.channel); null on legacy entries. */
	channel: ActorChannel | null;
}

/* ───────────────────────── The change, as a draft ───────────────────────── */

/**
 * The three things a change can be. `add` is a capability the product does not
 * have; `amend` is an existing one in the form the change would leave it in;
 * `remove` is an existing one the change takes away.
 */
export type DraftLeafKind = 'add' | 'amend' | 'remove';

/** The prefix that tells a draft leaf id from a real one, everywhere. */
export const DRAFT_LEAF_PREFIX = 'draft:';

/** Whether a feature id names a draft carried by a request rather than a leaf of the tree. */
export const isDraftLeafId = (id: string): boolean => id.startsWith(DRAFT_LEAF_PREFIX);

/** One testable statement the draft must satisfy, shaped like a leaf criterion. */
export interface DraftCriterion {
	readonly id: string;
	text: string;
}

/**
 * One row of the draft's behaviour: a surface, a state, an action, a rule or a
 * scenario, named and described.
 *
 * It is deliberately prose rather than the kernel's own shape. The kernel models
 * what EXISTS; a draft is a thing that does not exist yet, and giving it kernel
 * rows would put it in the engine, which is the one thing the dossier must not
 * do. What is written here is what the freeze hands to the behaviour tools.
 */
export interface DraftBehaviourNote {
	readonly id: string;
	kind: 'surface' | 'state' | 'action' | 'rule' | 'scenario';
	name: string;
	detail: string;
}

/**
 * What the request proposes, held by the dossier and written nowhere else.
 *
 * A draft is named among the features the request touches, exactly like an
 * existing leaf, so the impact report, the coherence check and the prototype can
 * be computed FROM the change instead of from the hole where it would sit
 * (ac-evo-draft-3, ac-evo-ovl-1). It carries what a leaf carries, so the freeze
 * has everything it needs to write it into the features section and nothing has
 * to be retyped (ac-evo-draft-2, ac-evo-draft-5).
 *
 * Deleting the request deletes its drafts, and the specification is exactly as
 * it was (ac-evo-draft-4).
 */
/**
 * The behaviour of a draft as the engine runs it: the change itself, as the
 * operations that make it (apply_behavior_batch vocabulary), in order. An
 * addition's operations build the feature from nothing; an amendment's apply
 * to the feature it stands for. Nothing official holds them: the engine
 * replays them in memory whenever the draft is read, walked or checked, and
 * the freeze is what applies them to a feature.
 *
 * The operations are kept rather than the resulting feature because a draft
 * IS a change: an amendment replayed over the feature as it is today says
 * whether the change still applies, where a stored copy would silently undo
 * whatever moved since. `mintedIds` are the ids the engine minted replaying
 * them, handed back on every replay so every element keeps its id and a later
 * batch can address what an earlier one created.
 */
export interface DraftBehaviourModel {
	/** What the change still has to write: replayed over the feature as it stands. */
	operations: Record<string, unknown>[];
	mintedIds: string[];
	updatedAt: string;
	/**
	 * What an earlier freeze already wrote into the feature. A request reopened
	 * after its first version replays only `operations` over the feature, which
	 * holds these already; replaying them again would add every element twice.
	 */
	landed?: { operations: Record<string, unknown>[]; mintedIds: string[] };
}

/** Every operation of the change, written or not, for counting what it does. */
export function behaviourOperationCount(model: DraftBehaviourModel | undefined): number {
	return (model?.operations.length ?? 0) + (model?.landed?.operations.length ?? 0);
}

/**
 * The model once its operations are written into the feature: they move to
 * `landed`, and nothing is left to replay until the change says more.
 */
export function landBehaviourModel(model: DraftBehaviourModel, at: string): DraftBehaviourModel {
	return {
		operations: [],
		mintedIds: [],
		updatedAt: at,
		landed: {
			operations: [...(model.landed?.operations ?? []), ...model.operations],
			mintedIds: [...(model.landed?.mintedIds ?? []), ...model.mintedIds]
		}
	};
}

/**
 * The feature a draft's model replays over: the one it amends, or, for an
 * addition an earlier freeze already created, the feature it became.
 */
export function behaviourBaseOf(draft: Pick<DraftLeaf, 'kind' | 'baseLeafId' | 'materialisedAs'>): string | null {
	if (draft.kind === 'add') return draft.materialisedAs;
	return draft.baseLeafId;
}

export interface DraftLeaf {
	/** `draft:<something>`; usable as a leafId for as long as the request lives. */
	readonly id: string;
	kind: DraftLeafKind;
	/** The existing leaf this stands for. Null on an addition, required otherwise. */
	baseLeafId: string | null;
	name: string;
	description: string;
	/**
	 * What the subject changes, in one sentence shown on the subject itself
	 * (ac-evo-draft-subject-2). A note for the people deciding: the freeze never
	 * writes it into the feature, whose description stays what `description`
	 * and the description delta say.
	 */
	changeSummary?: string;
	/** Where it would hang in the tree. Null until someone says. */
	coreId: string | null;
	parentFamilyId: string | null;
	objective: string;
	problem: string;
	expectedEffect: string;
	value: string;
	acceptanceCriteria: DraftCriterion[];
	/**
	 * An amendment said as a delta rather than restated whole. `acceptanceCriteria`
	 * are the criteria it ADDS; these name, by id, the base feature's criteria it
	 * retires and the ones it rewords (same id, new text). Stating a fifty-line
	 * feature again to change two lines is how lines nobody meant to touch get
	 * lost or retyped wrong.
	 */
	retireCriteria?: string[];
	changeCriteria?: DraftCriterion[];
	/**
	 * The base description edited in place instead of resent whole: each patch
	 * replaces one exact passage, then the appended text follows. Ignored when
	 * `description` is set, which replaces the description outright.
	 */
	descriptionPatch?: { find: string; replace: string }[];
	descriptionAppend?: string;
	/** Existing leaf ids, or other drafts of the same request. */
	dependsOn: string[];
	sourceIds: string[];
	behaviour: DraftBehaviourNote[];
	/**
	 * The runnable behaviour of the change, when one was authored: see
	 * DraftBehaviourModel. Absent on a draft described in prose only.
	 */
	behaviourModel?: DraftBehaviourModel;
	/** Set by the freeze that wrote it into the sections, with the id it took. */
	materialisedAs: string | null;
	materialisedAt: string | null;
}

export function createDraftLeaf(overrides: Partial<DraftLeaf> = {}): DraftLeaf {
	return {
		id: `${DRAFT_LEAF_PREFIX}${mintUuid()}`,
		kind: 'add',
		baseLeafId: null,
		name: '',
		description: '',
		coreId: null,
		parentFamilyId: null,
		objective: '',
		problem: '',
		expectedEffect: '',
		value: '',
		acceptanceCriteria: [],
		dependsOn: [],
		sourceIds: [],
		behaviour: [],
		materialisedAs: null,
		materialisedAt: null,
		...overrides
	};
}

/** One numbered attempt, with the report it produced. */
export interface Iteration {
	readonly number: number;
	startedAt: string;
	/** The brief handed to the model for this attempt. */
	brief: string;
	/** Ids of the conform lines the brief says must not be touched. */
	protectedLineIds: string[];
	/** Closed once every line of its report has been decided. */
	reportStatus: 'building' | 'ready' | 'closed';
}

/** The dossier that carries one change from the raw need to acceptance. */
/** A request stopped along the way: readable, reopenable, its reason kept (ac-evo-req-cancel). */
/** The deferred omission a request was started from (criterion 03b7eacf). */
export interface RequestDeferredFrom {
	readonly requestId: string;
	readonly lineId: string;
}

export interface RequestCancellation {
	readonly reason: string;
	readonly by: string;
	readonly at: string;
}

export interface EvolutionRequest {
	readonly id: string;
	title: string;
	origin: RequestOrigin | null;
	requester: string;
	stage: RequestStage;
	status: RequestStatus;
	/** Why, by whom and when the request was cancelled; absent while it is not (ac-evo-req-cancel). */
	cancellation?: RequestCancellation;
	/** The deferred omission it was started from; absent on any other request. */
	deferredFrom?: RequestDeferredFrom;
	/**
	 * The leaf features the change touches. Zero or more, in no particular rank:
	 * a change routinely spans several, and the requester is not asked to pick a
	 * single answerable one before the work of finding out has been done. The
	 * impact report is what fills this in, and until it does the leaf-scoped
	 * blocks of the dossier have nowhere to write, which the maturity score
	 * reports as the hole it is.
	 */
	leafIds: string[];
	/**
	 * What the change proposes, held here and written into no section until the
	 * freeze. A draft's id appears in `leafIds` like any other touched feature,
	 * which is what lets the reports be computed from the change itself.
	 */
	drafts: DraftLeaf[];
	/** The data the request changes: tables added, amended or removed (ac-evo-draft-data). Written into the Data section only when the change is declared live. */
	dataDrafts: import('./data-drafts').DataDraft[];
	/** The other parts of the spec the request changes: the Brief, the users, the Experience... (ac-evo-draft-section). Written into their sections only when the change lands. */
	sectionDrafts: import('./section-drafts').SectionDraft[];
	/** The rules the whole product keeps that the request adds, changes or retires (ac-evo-draft-rules). Written into the project's behaviour only when the change lands. */
	ruleDrafts: import('./rule-drafts').RuleDraft[];
	/** The findings of Project health the request settles, each fixed or kept (ac-evo-draft-findings). They leave Project health when the change lands. */
	findingDrafts?: import('./finding-drafts').FindingDraft[];
	/** Numbered from one, only ever moving forward. */
	iteration: number;
	iterations: Iteration[];
	/**
	 * The frozen specification version. 0 until the first freeze; incremented on
	 * every crossing into Verify. What was built is compared against a numbered,
	 * dated thing, never against whatever the spec says today.
	 */
	specVersion: number;
	/** True between a freeze and an amendment. Verify implies a frozen spec. */
	frozen: boolean;
	frozenVersions: FrozenVersion[];
	/** Version N+1 in correction in the Build, while the code is still built against N (EVO-012); absent otherwise. */
	correction?: import('./correction').SpecCorrection;
	/**
	 * The elements the touched features already held at the FIRST freeze, keyed
	 * `<entityType>:<entityId>` as the implementation index resolves them. It is
	 * what tells a report line this request introduced from one it inherited:
	 * without it, amending a feature of fifty criteria put the whole feature's
	 * backlog in front of the person asked to accept an eight-line change.
	 * Absent on requests frozen before it existed; every line then counts.
	 */
	baselineKeys?: string[];
	/**
	 * The touched features `baselineKeys` already covers: those of the first
	 * freeze, then each feature a rebrief adds, photographed at the freeze that
	 * first carries it. Absent on requests baselined before it existed; the
	 * features their first frozen version amended are read as covered then.
	 */
	baselineLeafIds?: string[];
	/**
	 * The findings the coherence engine reported at the request's first check,
	 * before anything was written: what the product already carried.
	 */
	coherenceBaseline?: string[];
	/**
	 * The touched features `coherenceBaseline` covers: those of the first check,
	 * then each feature that joined the request since, its findings added to the
	 * baseline at the first complete reading after it joined (criterion dd8db104).
	 * Absent on requests baselined before it existed: the features owning a finding
	 * of the baseline are read as covered then.
	 */
	coherenceBaselineLeafIds?: string[];
	createdAt: string;
	/**
	 * The fields the author marked as questions they cannot answer yet, keyed
	 * like `fieldKey`. An open question is shown in amber, counted as empty, and
	 * lowers nothing on the other fields: a declared unknown, never a fault. It
	 * is what the guided fill walks and what the completion targets first.
	 */
	openQuestionKeys: string[];
	/**
	 * The fields THIS request answered, keyed like `fieldKey`: a value typed on
	 * the dossier or a proposal accepted on it. The value itself lives in the
	 * owning section; this only says whose decision it was, so a value the touched
	 * feature already held is never read as an answer the request gave (2a9716f2).
	 */
	answeredKeys: string[];
	/** Who stands behind which value, field home by field home. */
	fieldSignatures: FieldSignature[];
	/** The conversations held next to the fields, oldest first. */
	fieldThreads: FieldThread[];
	/**
	 * The fields the author has marked as written, for the blocks whose home has
	 * an editor of its own (the behaviour kernel, the access matrix, the data
	 * model, the architecture board, the glossary).
	 *
	 * It is kept on the request because it is the only presence the dossier
	 * cannot read back: an inline field is filled when the section that owns it
	 * holds a value, and that is read live, but no cheap read tells the page
	 * whether the invariants of a leaf were authored in the kernel. Held only in
	 * the page it would die on the next reload, and the maturity score would
	 * report holes in blocks that are genuinely full, which is the one thing the
	 * score must never do.
	 *
	 * Keyed like `fieldKey`: the bare field path, or `path@leafId` for a
	 * leaf-scoped field.
	 */
	filledFieldKeys: string[];
	/** Set when an amend closes the stage 2 gate again. */
	coherenceGateClosed: boolean;
	coherenceReport: {
		status: 'not_run' | 'running' | 'ready';
		projectScore: number;
		requestDelta: number;
		ranAt: string | null;
		/** Project health now and as the change would leave it (ac-evo-coh-after). */
		health?: import('./finding-drafts').ProjectHealthAfter;
	};
	impactReport: {
		status: 'not_run' | 'ready';
		hypothesis: ImpactHypothesis;
		depth: number;
		ranAt: string | null;
	};
	coherenceFindings: CoherenceFinding[];
	impactFindings: ImpactFinding[];
	/**
	 * What each draft with a behaviour model does to the solver's proofs of its
	 * feature, computed with the impact. Absent until an impact ran with one.
	 */
	proofImpact?: DraftProofImpact[];
	implementationFindings: ImplementationFinding[];
	proposals: Proposal[];
	observations: Observation[];
	waivers: GateWaiver[];
	history: HistoryEntry[];
	/**
	 * Why the change exists (ac-evo-need-1..3): the description in the
	 * requester's words and the facts a specification needs. It belongs to the
	 * request, is written into no section, and is asked once rather than once per
	 * touched feature.
	 */
	need: RequestNeed;
	/** The steps of specification a person marked not applicable, each with its reason (ac-evo-req-16). */
	skippedSteps: StepSkip[];
	/** Set once a person declared the change live (ac-evo-req-18). Null until then. */
	deployment: Deployment | null;
	/** Who stands behind each important step: the validations given (ac-evo-req-19). */
	stepValidations: StepValidation[];
	/**
	 * The free description each step of specification opens on, in the person's
	 * own words (ac-evo-form-step-description). The Need keeps its own, on `need`.
	 */
	stepDescriptions: StepDescriptions;
	/** The answers to the questions a step asks after its description (ac-evo-func-prose). */
	stepAnswers: StepAnswers;
	/** The questions left unanswered on purpose, keyed like a field (ac-evo-form-question-skip). */
	skippedQuestions: SkippedQuestion[];
	/**
	 * The texts of the Functional spec its diagram follows, as they stood when it
	 * was drawn from them or wrote them; null before any (ac-evo-func-uml-sync).
	 */
	diagramAlignment: DiagramAlignment | null;
	/** The description of the Technical spec its diagram follows; null before any (ac-evo-tech-uml-sync). */
	technicalAlignment: TechnicalAlignment | null;
	/** The diagram each text a diagram edit moved past follows, by field key; null while every text is in step (ac-evo-func-uml-sync). */
	textAlignment: TextAlignment | null;
	/** How many different people must validate the current version of an answer, one by default (ac-evo-req-validations-per-answer). */
	validationsPerAnswer: number;
	/** The people expected to validate an answer or a step, where someone named them (ac-evo-req-named-validators). */
	namedValidators: NamedValidators[];
	/** The questions an AI client asked of this request in particular (ac-evo-coach-custom-1). */
	customQuestions: CustomQuestion[];
	/** Every value a dossier field held, oldest first (ac-evo-hist-field-versions). */
	fieldVersions: FieldVersion[];
	/** Who stands behind which version of a field (ac-evo-hist-field-validation). */
	fieldValidations: FieldValidation[];
	/**
	 * The implementation index entries that name what this request adds, held
	 * while the change is not official (ac-evo-impl-held): the index resolves
	 * them only once the change is declared live and lands. Keyed like
	 * `.unspa.json`, the newest entry of each key kept.
	 */
	heldImplementation: Record<string, Readonly<Record<string, unknown>>>;
	/** Where the request's code stands in git, as its AI reports it, from its branch to its merge (feat-evo-code-branch). */
	code?: CodeTrack;
	/** Why the last validation of the Specification froze nothing, said by the foot while the request stands at the Impact analysis (EVO-011). */
	freezeHeld?: import('./crossings-on-their-own').FreezeHeld;
	/** The live sessions people opened with their AI on this request, oldest first (ac-evo-live-start). */
	liveSessions: LiveSession[];
	/** The people who delegated validation to their own AI on this request (ac-evo-llm-delegation). */
	aiDelegations?: AiDelegation[];
	/** The clicks people sent to their AI, kept until answered (ac-evo-live-nothing-lost). */
	aiClicks: AiClick[];
	/** The prefills of a whole step people asked of their AI, each walking the step's sections (ac-evo-live-prefill-step). */
	stepPrefills?: StepPrefill[];
	/**
	 * The baseline of the specification captured when the request closed: the
	 * version of the Specification 360° the change moved it to. Absent on a
	 * request closed before closes captured one.
	 */
	closingBaselineId?: string;
	/** What the person's AI did on the ticket the closed request came from, as it reported it. */
	ticketPost?: TicketPost;
	/** What its landing validated in Knowledge and what stays to review (EVO-002); absent on a request that never landed since. */
	knowledgeLanding?: import('./landed-elements').KnowledgeLanding;
	/**
	 * The elements of Knowledge the change touches that were set to Validate at
	 * the landing, by element id, with who chose it and when (EVO-003): carried
	 * in the frozen version and read by the landing.
	 */
	landingChoices?: Readonly<Record<string, import('./touched-validation').LandingChoice>>;
	/** The requests under way this one lands after, set at its freeze or by a person (EVO-005); absent while it is ordered after none. */
	landsAfter?: string[];
	/** What a person decided on a pair of overlapping requests: an order, or a conflict accepted as a risk (EVO-005). */
	pairDecisions?: import('./landing-order').PairDecision[];
	/** The other requests that landed on what this one shares, newest last (EVO-005, action d632b48b). */
	otherLandings?: import('./landing-order').OtherLanding[];
}

/** The steps that open on a description of their own, beside the Need's. */
export const DESCRIBED_STEPS = ['solution', 'functional_spec', 'technical_spec'] as const;
export type DescribedStep = (typeof DESCRIBED_STEPS)[number];
export const isDescribedStep = (v: unknown): v is DescribedStep =>
	typeof v === 'string' && (DESCRIBED_STEPS as readonly string[]).includes(v);
export type StepDescriptions = Record<DescribedStep, string>;
export const createEmptyStepDescriptions = (): StepDescriptions => ({
	solution: '',
	functional_spec: '',
	technical_spec: ''
});

/**
 * The questions the steps of prose ask after their description (ac-evo-sol-prose,
 * ac-evo-func-prose, ac-evo-tech-prose). Everything a person writes before the
 * Impact analysis is prose; what the change touches is derived from it there.
 */
export const STEP_QUESTIONS = [
	{
		step: 'solution',
		key: 'examples',
		label: 'How we will know it works',
		// Offered, never owed: the Solution owes its description only (EVO-013, criterion c1db73b7).
		required: false,
		question: 'How will we know it works? Give a few concrete examples.',
		example: 'A customer whose bag is ready gets one text within a minute; a customer with no phone number gets none.',
		whyItMatters: 'The examples become the acceptance criteria the code is checked against.'
	},
	{
		step: 'solution',
		key: 'out_of_scope',
		label: 'What is left out',
		required: false,
		question: 'What is left out of this change?',
		example: 'No e-mail, no reminder the next day.',
		whyItMatters: 'Saying what is not done keeps the change from growing while it is built.'
	},
	{
		// Its rules, refusals included: the key stays 'refusals', the name of the answers already written (src-owner-fr-kinds-20261030).
		step: 'functional_spec',
		key: 'refusals',
		label: 'Its rules',
		// The Functional spec owes no text (EVO-013, criterion e5ba6571).
		required: false,
		question: 'What does the product allow or refuse, and why?',
		example: 'No text without a phone number: the baker sees "no number on file". Never two texts for one order.',
		whyItMatters: 'The rules are what the code enforces and the tests check.'
	},
	{
		step: 'functional_spec',
		key: 'interactions',
		label: 'How the person acts',
		required: false,
		question: 'How does the person act on it: what do they click, type or press?',
		example: 'The baker taps "Ready" on the order; a long press undoes it within ten seconds.',
		whyItMatters: 'What the person does becomes the actions of the features, and their parameters.'
	},
	{
		step: 'functional_spec',
		key: 'screens',
		label: 'What each screen shows',
		required: false,
		question: 'What does each screen show, and where?',
		example: 'The order list shows a "Ready" button on each order not collected yet; the customer screen shows the pick-up slot.',
		whyItMatters: 'The screens are drawn from it in the Experience.'
	},
	{
		step: 'functional_spec',
		key: 'experience',
		label: 'What the person feels',
		required: false,
		question: 'What should the person feel or notice: feedback, pace, accessibility?',
		example: 'The baker sees at once that the text left; nothing makes them wait in the morning rush.',
		whyItMatters: 'It says how the change should feel, which the design and its checks hold it to.'
	},
	{
		step: 'functional_spec',
		key: 'failures',
		label: 'When it goes wrong',
		required: false,
		question: 'What happens when something goes wrong?',
		example: 'The SMS provider is down: the order stays ready and the text is retried for an hour.',
		whyItMatters: 'What breaks is what nobody thinks of until it happens in production.'
	},
	{
		// The diagram in UML, kept as its notation (ac-evo-func-uml, ac-evo-func-uml-text).
		step: 'functional_spec',
		key: 'diagram',
		label: 'Diagram',
		required: false,
		question: 'Draw it: who takes part, how each use case goes and where it may stop, what each thing goes through.',
		example: 'use case Mark a bag ready: Baker',
		whyItMatters: 'A drawing shows the holes prose hides: a step nobody does, a refusal with no way out, a state nothing leaves.'
	},
	{
		// The Technical spec's diagram in UML, kept as its notation (ac-evo-tech-uml).
		step: 'technical_spec',
		key: 'diagram',
		label: 'Diagram',
		required: false,
		question: 'Draw it: the parts the change involves and what it adds, how they talk, what goes wrong.',
		example: 'component SMS sender: new',
		whyItMatters: 'A drawing shows what a decision brings: a new dependency, a new store, a call that can fail.'
	},
	{
		step: 'technical_spec',
		key: 'data',
		label: 'The data it moves',
		required: false,
		question: 'What data does the change add, change or remove?',
		example: 'Orders get a "text sent at" date; nothing is removed.',
		whyItMatters: 'The tables are declared from it at the Impact analysis.'
	}
] as const;
export type StepQuestion = (typeof STEP_QUESTIONS)[number];
export type AnsweredStep = StepQuestion['step'];
export type StepAnswers = Record<AnsweredStep, Record<string, string>>;
export const createEmptyStepAnswers = (): StepAnswers => {
	const out: StepAnswers = { solution: {}, functional_spec: {}, technical_spec: {} };
	for (const q of STEP_QUESTIONS) out[q.step][q.key] = '';
	return out;
};
export const stepQuestionOf = (step: string, key: string): StepQuestion | null =>
	STEP_QUESTIONS.find((q) => q.step === step && q.key === key) ?? null;

/**
 * Where a version of a field came from. `earlier` is a value the field held
 * before the dossier kept versions, recorded the first time someone validates
 * it, under the validator's name as the one who found it there.
 */
export type FieldVersionSource = 'typed' | 'proposal' | 'ai_client' | 'earlier' | 'diagram' | 'assistant';

/** One value a field held: what, who, when, and from where. Never edited, never removed. */
export interface FieldVersion {
	readonly id: string;
	/** The field, keyed like `fieldKey`: the bare path, or `path@leafId`. */
	readonly key: string;
	readonly value: string;
	readonly by: string;
	readonly byKind: AuthorKind;
	readonly source: FieldVersionSource;
	readonly proposalId: string | null;
	readonly at: string;
}

/** A person standing behind one version of a field. */
/**
 * A question left unanswered on purpose, with who decided it and why
 * (ac-evo-form-question-skip): it is no longer owed, required or not.
 */
export interface SkippedQuestion {
	readonly key: string;
	readonly reason: string;
	readonly by: string;
	readonly byKind: AuthorKind;
	readonly at: string;
}

export const skippedQuestionOf = (request: Pick<EvolutionRequest, 'skippedQuestions'>, key: string): SkippedQuestion | null =>
	(request.skippedQuestions ?? []).find((s) => s.key === key) ?? null;

/**
 * The people expected to validate one answer (keyed like a field) or one step
 * validated as a whole (`step:<step>`). Once someone is named, only they count
 * (ac-evo-req-named-validators). `gone` keeps who was named and left the
 * workspace, so the card can say it: they are no longer waited on.
 */
export interface NamedValidators {
	readonly target: string;
	readonly people: readonly string[];
	readonly gone: readonly string[];
}

export interface FieldValidation {
	readonly key: string;
	readonly versionId: string;
	readonly by: string;
	readonly byKind: AuthorKind;
	readonly at: string;
	/** Set when the verdict refuses the version rather than standing behind it (ac-evo-form-question-acts). */
	readonly verdict?: 'refused';
	/** Given by the person's AI under their delegation: it counts as the person's (ac-evo-llm-delegation-marks). */
	readonly delegated?: true;
	/** Why it was refused, in the member's words. */
	readonly reason?: string;
}

export type CustomQuestionStatus = 'open' | 'answered' | 'set_aside';

/** A question asked of this request in particular, after reading it. */
export interface CustomQuestion {
	readonly id: string;
	/** The step it is asked on, one of the validated steps. */
	readonly step: string;
	/** The field it bears on, keyed like `fieldKey`, or null for the step as a whole. */
	readonly fieldKey: string | null;
	readonly question: string;
	readonly why: string;
	readonly askedBy: string;
	readonly askedByKind: AuthorKind;
	readonly askedAt: string;
	status: CustomQuestionStatus;
	/** The answer, or the reason it was set aside. */
	resolution: string;
	resolvedBy: string | null;
	resolvedAt: string | null;
}

/** The answers of the need, one string per question; a list question holds one entry per line. */
export interface RequestNeed {
	description: string;
	situation: string;
	symptoms: string;
	cost: string;
	objectives: string;
	measures: string;
}

export const createEmptyNeed = (): RequestNeed => ({
	description: '',
	situation: '',
	symptoms: '',
	cost: '',
	objectives: '',
	measures: ''
});

/** One step of specification marked not applicable: who said so, when, and why. */
export interface StepSkip {
	step: SkippableStep;
	reason: string;
	by: string;
	at: string;
}

/** The steps a change may skip: Solution is what it changes, the rest are gates. */
export const SKIPPABLE_STEPS = ['need', 'functional_spec', 'technical_spec'] as const;
/**
 * The steps a person marks not applicable as a whole today (ac-evo-req-16): the
 * Need skips its questions one by one instead. A Need marked so before is still
 * read, and its mark can still be lifted, which is why it stays skippable.
 */
export const MARKABLE_STEPS = ['functional_spec', 'technical_spec'] as const;
export const isMarkableStep = (v: unknown): boolean => typeof v === 'string' && (MARKABLE_STEPS as readonly string[]).includes(v);
export type SkippableStep = (typeof SKIPPABLE_STEPS)[number];
export const isSkippableStep = (v: unknown): v is SkippableStep =>
	typeof v === 'string' && (SKIPPABLE_STEPS as readonly string[]).includes(v);

/** The declaration that the change is live, with the release it shipped in when one was named. */
export interface Deployment {
	releaseId: string | null;
	note: string;
	declaredBy: string;
	declaredAt: string;
}

export interface ProjectEvolutionDraft {
	projectId: string;
	requests: EvolutionRequest[];
	/**
	 * The branch the project deploys from (ac-evo-branch-setting): every request's
	 * code is written on a branch derived from it and merged back into it. Absent
	 * while none is named, and requests are then built and declared live as before.
	 */
	deploymentBranch?: string;
	/** The admins who delegated validation to their own AI on every evolution of the project (ac-evo-llm-delegation). */
	aiDelegations?: AiDelegation[];
	/** The sessions of each person's AI on the whole project (ac-ai-session-project). */
	sessions?: LiveSession[];
	/** The clicks made outside a request, on the Specification 360° and the Retrospecification (ac-ai-session-ask-block, ac-ai-session-reread). */
	clicks?: ProjectClick[];
	lastSavedAt: string | null;
}

export function createEmptyEvolutionDraft(projectId: string): ProjectEvolutionDraft {
	return { projectId, requests: [], lastSavedAt: null };
}

export function createEvolutionRequest(
	overrides: Partial<EvolutionRequest> = {}
): EvolutionRequest {
	return {
		id: mintUuid(),
		title: '',
		origin: null,
		requester: '',
		stage: 'draft',
		status: 'open',
		leafIds: [],
		drafts: [],
		dataDrafts: [],
		sectionDrafts: [],
		ruleDrafts: [],
		findingDrafts: [],
		iteration: 1,
		iterations: [],
		specVersion: 0,
		frozen: false,
		frozenVersions: [],
		createdAt: '',
		openQuestionKeys: [],
		answeredKeys: [],
		fieldSignatures: [],
		fieldThreads: [],
		filledFieldKeys: [],
		coherenceGateClosed: false,
		coherenceReport: { status: 'not_run', projectScore: 0, requestDelta: 0, ranAt: null },
		impactReport: { status: 'not_run', hypothesis: 'add', depth: 2, ranAt: null },
		coherenceFindings: [],
		impactFindings: [],
		implementationFindings: [],
		proposals: [],
		observations: [],
		waivers: [],
		history: [],
		need: createEmptyNeed(),
		skippedSteps: [],
		deployment: null,
		stepValidations: [],
		stepDescriptions: createEmptyStepDescriptions(),
		stepAnswers: createEmptyStepAnswers(),
		skippedQuestions: [],
		diagramAlignment: null,
		technicalAlignment: null,
		textAlignment: null,
		validationsPerAnswer: 1,
		namedValidators: [],
		customQuestions: [],
		fieldVersions: [],
		fieldValidations: [],
		heldImplementation: {},
		liveSessions: [],
		aiClicks: [],
		...overrides
	};
}

/**
 * The features a request touches, one entry each, in the order they were named.
 *
 * `leafIds` deliberately holds BOTH sides of an amendment: the draft, because
 * every reading starts from what the change proposes, and the leaf it stands
 * for, because what rests on that leaf is what the walk has to reach. Neither
 * belongs in a list a person reads, though: an amendment IS that leaf in its
 * proposed form, so the two collapse onto the leaf that exists, which is also
 * where the freeze patches it and where its answers already live. An addition
 * stands for no existing leaf and stays an entry of its own.
 */
export const touchedLeafIds = (request: EvolutionRequest): readonly string[] => {
	const standIns = new Set(
		request.drafts.filter((d) => d.baseLeafId !== null).map((d) => d.id)
	);
	return request.leafIds.filter((id) => !standIns.has(id));
};

/** The draft a request carries for one touched feature, whichever side names it. */
export const draftFor = (request: EvolutionRequest, leafId: string): DraftLeaf | null =>
	request.drafts.find((d) => d.id === leafId || d.baseLeafId === leafId) ?? null;

export function createObservation(overrides: Partial<Observation> = {}): Observation {
	return {
		id: mintUuid(),
		type: 'defect',
		target: 'prototype',
		body: '',
		screenId: '',
		elementId: '',
		captureAttached: false,
		captureAnnotated: false,
		status: 'draft',
		ruling: 'open',
		rulingReason: '',
		assignee: null,
		messages: [],
		linkedRequestId: null,
		foldedBackAt: null,
		foldedBackBy: null,
		foldedBackKind: null,
		foldedBackLeafId: null,
		...overrides
	};
}

export function createProposal(overrides: Partial<Proposal> = {}): Proposal {
	return {
		id: mintUuid(),
		targetField: '',
		canonicalSection: 'features',
		canonicalPath: '',
		value: '',
		reasoning: '',
		whatWasRead: '',
		whatWasInferred: '',
		reasoningSeparatesReadFromInferred: false,
		citedSourceIds: [],
		bannedSynonymDetected: false,
		flaggedWords: [],
		keptWordingSense: '',
		proposedBy: '',
		reviewerIds: [],
		verdicts: [],
		decision: 'pending',
		comment: '',
		acceptedBy: null,
		acceptedAt: null,
		...overrides
	};
}
