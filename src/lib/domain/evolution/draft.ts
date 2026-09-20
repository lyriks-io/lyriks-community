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
	/** True when the reasoning says which part was read and which part was inferred. */
	reasoningSeparatesReadFromInferred: boolean;
	/** Source ids from the evidence register. A proposal citing none cannot be accepted. */
	citedSourceIds: string[];
	/** Raised before the card is offered, when the value uses a word the glossary bans. */
	bannedSynonymDetected: boolean;
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
		iteration: 1,
		iterations: [],
		specVersion: 0,
		frozen: false,
		frozenVersions: [],
		createdAt: '',
		openQuestionKeys: [],
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
		reasoningSeparatesReadFromInferred: false,
		citedSourceIds: [],
		bannedSynonymDetected: false,
		reviewerIds: [],
		verdicts: [],
		decision: 'pending',
		comment: '',
		acceptedBy: null,
		acceptedAt: null,
		...overrides
	};
}
