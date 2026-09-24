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
	 * knows the decision was typed to a client, not clicked on the page.
	 */
	readonly channel?: ActorChannel;
}

export type ActorChannel = 'page' | 'ai_client';

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
	decision: LineDecision;
	decidedBy: string | null;
	decidedAt: string | null;
}

/** A value the model suggested for one empty spec field, waiting for a person. */
export interface Proposal {
	readonly id: string;
	/** The field it fills, named the way the form names it. */
	targetField: string;
	canonicalSection: CanonicalSection;
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
}

/**
 * A touched feature taken out of the readiness average by a workspace admin,
 * with the reason. Traced: the leaf stays listed with it, never dropped.
 */
export interface ReadinessExclusion {
	readonly id: string;
	leafId: string;
	reason: string;
	by: string;
	at: string;
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
export interface DraftLeaf {
	/** `draft:<something>`; usable as a leafId for as long as the request lives. */
	readonly id: string;
	kind: DraftLeafKind;
	/** The existing leaf this stands for. Null on an addition, required otherwise. */
	baseLeafId: string | null;
	name: string;
	description: string;
	/** Where it would hang in the tree. Null until someone says. */
	coreId: string | null;
	parentFamilyId: string | null;
	objective: string;
	problem: string;
	expectedEffect: string;
	value: string;
	acceptanceCriteria: DraftCriterion[];
	/** Existing leaf ids, or other drafts of the same request. */
	dependsOn: string[];
	sourceIds: string[];
	behaviour: DraftBehaviourNote[];
	/** Set by the freeze that wrote it into the sections, with the id it took. */
	materialisedAs: string | null;
	materialisedAt: string | null;
}

export function createDraftLeaf(overrides: Partial<DraftLeaf> = {}): DraftLeaf {
	return {
		id: `${DRAFT_LEAF_PREFIX}${crypto.randomUUID()}`,
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
export interface EvolutionRequest {
	readonly id: string;
	title: string;
	origin: RequestOrigin | null;
	requester: string;
	stage: RequestStage;
	status: RequestStatus;
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
	/** Touched features an admin took out of the readiness average, with reasons. */
	readinessExclusions: ReadinessExclusion[];
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
	};
	impactReport: {
		status: 'not_run' | 'ready';
		hypothesis: ImpactHypothesis;
		depth: number;
		ranAt: string | null;
	};
	coherenceFindings: CoherenceFinding[];
	impactFindings: ImpactFinding[];
	implementationFindings: ImplementationFinding[];
	proposals: Proposal[];
	observations: Observation[];
	waivers: GateWaiver[];
	history: HistoryEntry[];
}

export interface ProjectEvolutionDraft {
	projectId: string;
	requests: EvolutionRequest[];
	lastSavedAt: string | null;
}

export function createEmptyEvolutionDraft(projectId: string): ProjectEvolutionDraft {
	return { projectId, requests: [], lastSavedAt: null };
}

export function createEvolutionRequest(
	overrides: Partial<EvolutionRequest> = {}
): EvolutionRequest {
	return {
		id: crypto.randomUUID(),
		title: '',
		origin: null,
		requester: '',
		stage: 'draft',
		status: 'open',
		leafIds: [],
		drafts: [],
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
		readinessExclusions: [],
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
		id: crypto.randomUUID(),
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
		id: crypto.randomUUID(),
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
