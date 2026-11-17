import { pointsOf, textOfPoints } from './prose-statements';
import type { DraftProofImpact } from './proof-impact';
import { isElementPath } from './spec-actions';
import {
	MAX_IMPACT_DEPTH,
	REQUEST_ORIGINS,
	STAGE_ORDER,
	type ImpactHypothesis,
	type InjectionKind,
	type LineDecision,
	type ObservationRuling,
	type RequestOrigin,
	type RequestStage
} from './enums';
import {
	createDraftLeaf,
	createEvolutionRequest,
	createProposal,
	DRAFT_LEAF_PREFIX,
	type Actor,
	type CoherenceFinding,
	type DraftBehaviourNote,
	type DraftCriterion,
	type DraftLeaf,
	type DraftLeafKind,
	type EvolutionRequest,
	type RequestDeferredFrom,
	type ImpactFinding,
	type ImplementationFinding,
	type Proposal
} from './draft';
import { ALLOW, firstRefusal, guard, refuse, type Guarded, type Refused } from './guard';
import { specificationGate, type SpecificationHold } from './specification-hold';
import { canDelegateToAi, withDelegation } from './ai-delegation';
import {
	DATA_DRAFT_PREFIX,
	DATA_FIELD_TYPES,
	isDataFieldType,
	type DataDraft,
	type DataDraftKind,
	type DataFieldChange,
	type DataFieldDraft,
	type DataModelLike
} from './data-drafts';
import {
	SECTION_DRAFT_PREFIX,
	SPEC_PAGES,
	isSpecPage,
	liveSectionDrafts,
	notDraftablePageReason,
	pageEditsRefusal,
	sectionEditsIssue,
	type SectionDraft,
	type SectionEdit,
	type SpecPage
} from './section-drafts';
import { RULE_DRAFT_PREFIX, RULES_PAGE_NAME, liveRuleDrafts, ruleOperationsIssue, type RuleDraft } from './rule-drafts';
import {
	FINDINGS_BLOCK_NAME,
	FINDING_DRAFT_PREFIX,
	descriptionNaming,
	findingLineRefusal,
	newFindingDraft,
	type FindingDraft,
	type FindingOutcome,
	type ListedFinding
} from './finding-drafts';
import {
	ALL_BLOCK_FIELDS,
	blockFieldByPath,
	canonicalPathsFor,
	fieldKey,
	holdsValue,
	isLeafScoped,
	NEED_FIELDS,
	NEED_KEYS,
	needKeyOf,
	ORIGIN_ANSWER_KEYS,
	ORIGIN_FIELDS,
	isOriginField,
	type NeedKey
} from './blocks';
import {
	requiredTextsEmpty,
	isStepValidated,
	isValidatedStep,
	needCriticalEmpty,
	reopenSteps,
	stepLabel,
	unvalidatedSpecSteps,
	validationOf,
	type ValidatedStep
} from './path';
import { createObservation, findingHoldsGate, isDescribedStep, isMarkableStep, isSkippableStep, skippedQuestionOf, STEP_QUESTIONS, stepQuestionOf, type FieldThreadMessage, type ProposalLineDecision, type SkippableStep, type SuggestedWrite } from './draft';
import { fieldValidationOf, isActionReviewKey, latestVersion, stepAnswerKey, stepDescriptionKey, withFieldVersion } from './field-versions';
import { linesOf, listDelta } from './list-delta';
import { personKey, stepOfTarget, withNamed } from './named-validators';
import { MAX_OPEN_CUSTOM_QUESTIONS, openCustomQuestions } from './custom-questions';
import { FUNCTIONAL_DIAGRAM_KEY, functionalDiagramWords, isEmptyDiagram, readFunctionalDiagram } from './functional-diagram';
import {
	diagramBehindTexts,
	diagramFieldOf,
	diagramPartOfTexts,
	functionalTexts,
	isPairedStep,
	pairedTextField,
	pairedTextFields,
	pairedTextOf,
	textAlignmentAfterEdit,
	textAlignmentWithout,
	textsBehindDiagram,
	type PairedStep
} from './functional-sync';
import { isEmptyTechnicalDiagram, readTechnicalDiagram, technicalDiagramWords } from './technical-diagram';
import type { ObservationType, WalkthroughTarget } from './enums';
import {
	acceptanceDebt,
	canAdvance,
	canCancelRequest,
	canCloseRequest,
	canDeleteRequest,
	canReopenRequest,
	canOpenRequest,
	canRebrief,
	nextStage,
	openRequest
} from './lifecycle';
import { canCrossToImplementation, canLeaveCoherence, canLeaveSpecification, canLiftWaiver, canWaive, nothingToArbitrate, openWaiver } from './gate';
import { amend, canReceiveReport, freeze } from './freeze';
import { canAdopt, canBuildReport, canCloseReport, canDecide, canRemove } from './implementation';
import {
	canAcceptProposal,
	canAnswerOpenQuestion,
	canMarkOpenQuestion,
	canRefuseProposal,
	canRewordProposal,
	pendingProposals
} from './proposals';
import { canPostOnField, latestThread, openThread, post, setTopicRuling, topicOpener } from './field-thread';
import { publishExchange, readableBy, topicOf } from './live-exchange';
import { canDecideSuggestion, requirementCandidates, requirementKey, suggestionAllowed, suggestionPlaceOf } from './thread-suggestion';
import { productToChange } from './product-to-change';
import { askAllowed, askOf, choicesAllowed, cleanChoices, dialogueAfter, replaceableBy, threadQuestionAllowed } from './suggestion-ask';
import { canFoldBack, canInvalidate, canLogObservation, canRule } from './acceptance';
import { record } from './history';
import { canComputePropagation } from './impact';
import { canRunCheck } from './coherence';
import { withImpactReading } from './impact-propagation';
import { withCoherenceReading, type CoherenceMapping } from './coherence-mapping';
import { withDerivedReport } from './report-derivation';
import { withoutQuotations } from './quotations';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/**
 * The acts of the lifecycle as pure functions: one request in, one request
 * out, or the refusal the specification wrote.
 *
 * The dossier page runs the same guards in the browser. These are the SERVER's
 * copy, the one an AI client goes through (ac-evo-llm-9): a client cannot do
 * through the API what a person cannot do on the page, and the refusal it reads
 * is the sentence the spec chose.
 *
 * Who is acting travels in the context. A decision belongs to a person; an AI
 * client acting on its own account is refused, and a client relaying the
 * signed-in person's decision acts AS that person, with the channel stamped on
 * the timeline (ac-evo-llm-10).
 */
export interface ActContext {
	readonly actor: Actor;
	readonly at: string;
	readonly newId: () => string;
	/**
	 * True when the workspace holds one member (ac-evo-req-13).
	 *
	 * Who signs follows the roster, never the size of the change. Alone, there is
	 * nobody to sign FOR: the person talking to the client IS the workspace, so
	 * the client carries the request through on their behalf and the timeline says
	 * it acted through a client. From two members up, a decision is a thing one
	 * person takes and the others can read, so it is theirs to take.
	 */
	readonly soloWorkspace?: boolean;
	/**
	 * The caller is an AI client whose person delegated validation to it, on this
	 * request or on every evolution of the project (ac-evo-llm-delegation): it
	 * validates and accepts its own suggestions in the person's name, and never
	 * crosses a gate (ac-evo-llm-delegation-powers).
	 */
	readonly aiDelegated?: boolean;
	/**
	 * The members who validate, by email (a viewer excepted), where the roster
	 * is known: the only people who can be named to validate
	 * (ac-evo-req-named-validators). Null where it is not.
	 */
	readonly validators?: ReadonlySet<string> | null;
	/**
	 * The language of the spec. The timeline is stored in the dossier, so what it
	 * says is written in it; a summary already stored keeps its language. The
	 * refusals stay in English: they are the product talking, not the model.
	 */
	readonly lang?: SpecLanguage;
	/**
	 * The words the glossary keeps for another sense, each with the term to
	 * prefer. Text a person types is read against them like a proposal, and a
	 * flag is said in the answer, never a refusal (ac-evo-form-glossary).
	 */
	readonly bannedWords?: ProposeChecks['bannedWords'];
}

/** What the glossary says of a typed text, as a clause to append to a summary; empty when it says nothing. */
export function glossaryNote(value: string, bannedWords: ProposeChecks['bannedWords'] | undefined): string {
	const flags = bannedWords ? flaggedWordsIn(value, bannedWords) : [];
	if (flags.length === 0) return '';
	return `. Glossary: ${flags
		.map((f) => `"${f.word}" is kept for another sense${f.prefer ? `, here it says "${f.prefer}"` : ''}`)
		.join('; ')}. The text is kept as written`;
}

export type ActOutcome =
	| { readonly ok: true; readonly request: EvolutionRequest; readonly summary: string }
	| Refused;

const done = (request: EvolutionRequest, summary: string): ActOutcome => ({
	ok: true,
	request,
	summary
});

const stamp = (
	ctx: ActContext,
	request: EvolutionRequest,
	type: Parameters<typeof record>[1]['type'],
	summary: string,
	extra: { proposalId?: string | null; acceptedByPersonId?: string | null } = {}
): EvolutionRequest =>
	record(request, { id: ctx.newId(), type, summary, actor: ctx.actor, at: ctx.at, ...extra });

/** A stage as the French timeline names it. */
const STAGE_FR: Readonly<Record<string, string>> = {
	draft: 'brouillon',
	specification: 'spécification',
	coherence: 'cohérence',
	implementation: 'implémentation',
	acceptance: 'recette',
	delivered: 'livraison'
};

const DECISION_FR: Readonly<Record<string, readonly [string, string]>> = {
	undecided: ['non décidée', 'non décidées'],
	validated: ['validée', 'validées'],
	invalidated: ['invalidée', 'invalidées'],
	adopted: ['adoptée', 'adoptées'],
	removed: ['retirée', 'retirées']
};

const VERDICT_LINES_FR: Readonly<Record<string, string>> = {
	conform: 'conformes',
	non_conform: 'non conformes',
	missing: 'manquantes',
	out_of_scope: 'hors périmètre',
	regression: 'en régression'
};

const RULING_FR: Readonly<Record<string, string>> = {
	validated: 'validée',
	invalidated: 'invalidée',
	deferred: 'reportée',
	requalified: 'requalifiée'
};

/**
 * What the timeline says, in the language of the spec. Field paths, ids and
 * the names of the model are quoted as they are, never translated.
 */
const HISTORY_TEXTS = {
	en: {
		opened: 'Request opened in specification',
		deferredNeed: (key: string, statement: string) => `Deferred from ${key} at its Verification. ${statement}`,
		drafted: (kind: DraftLeafKind, name: string) => `Drafted: ${kind} "${name}"`,
		redrafted: (name: string) => `Draft "${name}" reworked`,
		undrafted: (name: string) => `Draft "${name}" taken out of the change`,
		modelSet: (label: string, count: number) => `Behaviour model of "${label}": ${count} operations`,
		modelCleared: (label: string) => `Behaviour model of "${label}" cleared`,
		validated: (field: string, given: number, of: number) =>
			`Validated the proposed ${field} (${given} of ${of} reviewers)`,
		accepted: (field: string, kept: string) => `Accepted the proposed ${field}${kept}`,
		keptWord: (word: string, prefer: string | null) =>
			prefer ? `"${word}" (the glossary says "${prefer}")` : `"${word}"`,
		keptFallback: 'a flagged word',
		kept: (what: string, sense: string) => (sense ? `, keeping ${what}: ${sense}` : `, keeping ${what} as written`),
		invalidated: (field: string) => `Invalidated the proposed ${field}`,
		withdrew: (field: string) => `Withdrew the proposed ${field}; the field is free for another proposal`,
		waived: (reason: string) => `Gate waived: ${reason}`,
		crossed: (stage: string) => `Crossed into ${stage}`,
		frozen: (version: string) => `Specification frozen as version ${version}`,
		waiverLifted: 'Waiver lifted',
		rebrief: 'Sent back to specification for rebrief',
		amended: (version: string) => `Specification amended after version ${version}`,
		line: (decision: string) => `Line ${decision}`,
		bucket: (verdict: string, decision: string) => `Bucket ${verdict} ${decision}`,
		ruled: (ruling: string) => `Observation ${ruling}`,
		foldedBack: (leafId: string) => `Observation folded back into ${leafId} as an acceptance criterion`,
		closed: 'Request closed',
		cancelled: (reason: string) => `Request cancelled: ${reason}`,
		reopened: 'Request reopened'
	},
	fr: {
		opened: 'Demande ouverte en spécification',
		deferredNeed: (key: string, statement: string) => `Reporté depuis ${key} à sa vérification. ${statement}`,
		drafted: (kind: DraftLeafKind, name: string) =>
			`Brouillon${NBSP}: ${kind === 'add' ? 'ajout' : kind === 'amend' ? 'modification' : 'retrait'} de ${quoteName('fr', name)}`,
		redrafted: (name: string) => `Brouillon ${quoteName('fr', name)} retravaillé`,
		undrafted: (name: string) => `Brouillon ${quoteName('fr', name)} retiré de l'évolution`,
		modelSet: (label: string, count: number) =>
			`Modèle de comportement de ${quoteName('fr', label)}${NBSP}: ${count} ${count === 1 ? 'opération' : 'opérations'}`,
		modelCleared: (label: string) => `Modèle de comportement de ${quoteName('fr', label)} effacé`,
		validated: (field: string, given: number, of: number) =>
			`Valeur proposée pour ${field} validée (${given} sur ${of} ${of === 1 ? 'relecteur' : 'relecteurs'})`,
		accepted: (field: string, kept: string) => `Valeur proposée pour ${field} acceptée${kept}`,
		keptWord: (word: string, prefer: string | null) =>
			prefer ? `${quoteName('fr', word)} (le glossaire dit ${quoteName('fr', prefer)})` : quoteName('fr', word),
		keptFallback: 'un mot signalé',
		kept: (what: string, sense: string) => (sense ? `, sans changer ${what}${NBSP}: ${sense}` : `, sans changer ${what}`),
		invalidated: (field: string) => `Valeur proposée pour ${field} invalidée`,
		withdrew: (field: string) =>
			`Valeur proposée pour ${field} retirée${NBSP}; le champ est libre pour une autre proposition`,
		waived: (reason: string) => `Porte franchie par dérogation${NBSP}: ${reason}`,
		crossed: (stage: string) => `Passage à l'étape ${STAGE_FR[stage] ?? stage}`,
		frozen: (version: string) => `Spécification figée en version ${version}`,
		waiverLifted: 'Dérogation levée',
		rebrief: 'Renvoyée en spécification pour un nouveau brief',
		amended: (version: string) => `Spécification amendée après la version ${version}`,
		line: (decision: string) => `Ligne ${DECISION_FR[decision]?.[0] ?? decision}`,
		bucket: (verdict: string, decision: string) =>
			`Lignes ${VERDICT_LINES_FR[verdict] ?? verdict} ${DECISION_FR[decision]?.[1] ?? decision}`,
		ruled: (ruling: string) => `Observation ${RULING_FR[ruling] ?? ruling}`,
		foldedBack: (leafId: string) => `Observation réintégrée dans ${leafId} comme critère d'acceptation`,
		closed: 'Demande clôturée',
		cancelled: (reason: string) => `Demande annulée${NBSP}: ${reason}`,
		reopened: 'Demande rouverte'
	}
} as const;

/** The timeline's words for this act, in the language the context carries. */
const said = (ctx: ActContext) => HISTORY_TEXTS[ctx.lang ?? 'en'];

/** A decision is a person's. A client acting on its own account is refused here. */
const personOnly = (actor: Actor, what: string): Guarded =>
	guard(
		actor.kind === 'ai_client',
		`An AI client cannot ${what}.`,
		'A decision belongs to a person. Relay it as the signed-in person who took it, or take it on the dossier page.'
	);

/**
 * The same rule, read against the roster (ac-evo-req-13).
 *
 * These are the acts that carry a request forward. In a workspace of one they
 * are open to the client, because asking a lone person to counter-sign what they
 * just asked for is blocking for nothing. In a workspace of several they stay a
 * person's, because there the decision is what the others read.
 *
 * Deliberately NOT extended to a waiver, to lifting one or to deleting a
 * request: a waiver says "the gate is unmet and I am going anyway", and that
 * sentence has to have somebody's name on it however many people are around.
 */
const carriesForward = (ctx: ActContext, what: string): Guarded =>
	ctx.soloWorkspace ? ALLOW : personOnly(ctx.actor, what);
/**
 * A text of a step written as a version (ac-evo-live-shared-writes): a person
 * writes it anywhere, an AI client only in a workspace of one. In a workspace
 * of several members the AI suggests it in its message, which a person accepts.
 */
const writesStepText = (ctx: ActContext): Guarded =>
	guard(
		!ctx.soloWorkspace && ctx.actor.kind === 'ai_client',
		'In a workspace of several members your text on a step is a suggestion the person accepts: post it with post_on_field and writes [{ fieldPath, value }].',
		'The person accepts it in one click and it is written at its place, waiting for its validation like any write.'
	);
/** A validation an AI client gives under the person's delegation is theirs to give; any other decision is not (ac-evo-llm-delegation-powers). */
const validates = (ctx: ActContext, what: string): Guarded => (ctx.aiDelegated ? ALLOW : carriesForward(ctx, what));
/** Whether this act is the person's AI acting under their delegation, stamped on what it validates (ac-evo-llm-delegation-marks). */
const underDelegation = (ctx: ActContext): boolean => !!ctx.aiDelegated && ctx.actor.kind === 'ai_client';

const canEdit = (actor: Actor): boolean => actor.role !== 'viewer';

const notFinished = (request: EvolutionRequest): Guarded =>
	firstRefusal(
		guard(
			request.status === 'deleted',
			'This request is deleted.',
			'A deleted dossier is out of the run; nothing moves it.'
		),
		guard(
			request.status === 'closed',
			'This request is closed.',
			'A closed request has finished its run; open a new request for further changes.'
		),
		guard(
			request.status === 'cancelled',
			'This request is cancelled: reopen it first.',
			'A cancelled request is read, not written; Reopen in its settings menu takes it back up where it stood.'
		)
	);

/**
 * A touched feature is either a leaf of the tree or a draft this request
 * carries. Anything else is a typo, and the refusal names both doors rather
 * than only the id that missed them.
 */
const unknownLeaves = (
	leafIds: readonly string[],
	known: ReadonlySet<string>,
	drafts: readonly DraftLeaf[] = []
): Guarded => {
	const draftIds = new Set(drafts.map((d) => d.id));
	const missing = leafIds.filter((id) => !known.has(id) && !draftIds.has(id));
	return guard(
		missing.length > 0,
		`Unknown feature${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`,
		'A request touches leaf features that EXIST, or drafts it carries itself. The features section lists the first; add_draft_leaf creates the second. Nothing is written into the tree before the freeze.'
	);
};

/* ───────────────────────── The request itself ───────────────────────── */

export interface OpenRequestInput {
	readonly id?: string;
	readonly title: string;
	readonly origin: RequestOrigin | null;
	readonly requester: string;
	readonly leafIds: readonly string[];
	readonly knownLeafIds: ReadonlySet<string>;
	/** The deferred omission it is started from: the request keeps the link and its Need names it (criterion 03b7eacf). */
	readonly deferred?: { readonly from: RequestDeferredFrom; readonly fromKey: string | null; readonly statement: string };
}

/** Create the dossier and open it in Specify, in one act. */
export function openRequestAct(ctx: ActContext, input: OpenRequestInput): ActOutcome {
	const leafIds = [...new Set(input.leafIds)];
	// An evolution changes a product its specification describes (criterion 40bef6da).
	const refused = firstRefusal(productToChange(input.knownLeafIds.size), unknownLeaves(leafIds, input.knownLeafIds));
	if (!refused.ok) return refused;
	const request = createEvolutionRequest({
		id: input.id && input.id.trim() !== '' ? input.id : ctx.newId(),
		title: input.title.trim(),
		origin: input.origin,
		requester: input.requester.trim() || ctx.actor.id,
		leafIds,
		createdAt: ctx.at
	});
	const allowed = canOpenRequest(request);
	if (!allowed.ok) return allowed;
	const carried: EvolutionRequest = input.deferred
		? { ...request, deferredFrom: input.deferred.from, need: { ...request.need, description: said(ctx).deferredNeed(input.deferred.fromKey ?? input.deferred.from.requestId, input.deferred.statement) } }
		: request;
	return done(
		stamp(ctx, openRequest(carried, ctx.at), 'stage_crossing', said(ctx).opened),
		`Opened "${request.title}" in specification`
	);
}

/** The requester or the source written on the request, as an accepted suggestion leaves it (ac-evo-live-prefill). */
function withOriginAnswer(request: EvolutionRequest, path: string, value: string): EvolutionRequest {
	if (path === ORIGIN_ANSWER_KEYS.requester) return { ...request, requester: value.trim() };
	return { ...request, origin: originCodeOf(value) ?? request.origin };
}

export function updateRequestAct(
	ctx: ActContext,
	request: EvolutionRequest,
	patch: {
		readonly title?: string;
		readonly origin?: RequestOrigin;
		readonly requester?: string;
		/** How many people each answer needs (ac-evo-req-validations-per-answer). */
		readonly validationsPerAnswer?: number;
	},
	/** The members of the workspace who could validate: no answer asks for more. */
	memberCount = 1
): ActOutcome {
	const wanted = patch.validationsPerAnswer;
	// Who asked and where it comes from are answers of the Briefing; renaming the request is not.
	const movesBriefing =
		(patch.origin !== undefined && patch.origin !== request.origin) ||
		(patch.requester !== undefined && patch.requester.trim() !== request.requester);
	const allowed = firstRefusal(
		notFinished(request),
		movesBriefing ? briefingIsOpen(request) : ALLOW,
		guard(
			patch.title !== undefined && patch.title.trim() === '',
			'A request needs a title before it can be opened.',
			'Without a title the request cannot be found again on Thursday, which is the whole point of giving it an identity.'
		),
		guard(wanted !== undefined && !canEdit(ctx.actor), 'A viewer reads and comments, but does not change how a request is validated.', 'The number decides when answers stand validated.'),
		guard(wanted !== undefined && (!Number.isInteger(wanted) || wanted < 1), 'An answer needs at least one validation.', 'Zero validations would let an answer stand on nobody.'),
		guard(
			wanted !== undefined && wanted > Math.max(1, memberCount),
			`No more validations than members who can give them: this workspace holds ${Math.max(1, memberCount)}.`,
			'A number the workspace cannot reach would hold every answer forever.'
		)
	);
	if (!allowed.ok) return allowed;
	const origin = patch.origin ?? request.origin;
	const requester = patch.requester !== undefined ? patch.requester.trim() : request.requester;
	// A new requester or source is a new version of that answer of 1.1, waiting for its validation (ac-evo-form-origin-validated).
	let versioned = request;
	if (origin !== request.origin) versioned = withFieldVersion(versioned, { id: ctx.newId(), key: ORIGIN_ANSWER_KEYS.origin, value: origin ?? '', actor: ctx.actor, at: ctx.at });
	if (requester !== request.requester) versioned = withFieldVersion(versioned, { id: ctx.newId(), key: ORIGIN_ANSWER_KEYS.requester, value: requester ?? '', actor: ctx.actor, at: ctx.at });
	return done(
		{
			...versioned,
			title: patch.title !== undefined ? patch.title.trim() : request.title,
			origin,
			requester,
			validationsPerAnswer: wanted ?? request.validationsPerAnswer
		},
		wanted !== undefined && wanted !== request.validationsPerAnswer
			? `Each answer now needs ${wanted} ${wanted === 1 ? 'validation' : 'validations'}`
			: 'Request updated'
	);
}

function setLeavesActCore(
	ctx: ActContext,
	request: EvolutionRequest,
	leafIds: readonly string[],
	knownLeafIds: ReadonlySet<string>
): ActOutcome {
	// Naming the touched features is about the features that ALREADY exist. What
	// the request proposes is never something this act can drop: a draft stays
	// among the touched features, and so does the leaf an amendment stands for,
	// because what rests on that leaf is what the walk has to reach. Without
	// this, picking a feature on the page silently takes the change itself out
	// of both readings, which is the failure the invariant forbids.
	const carried = request.drafts.flatMap((d) => (d.baseLeafId ? [d.id, d.baseLeafId] : [d.id]));
	const unique = [...new Set([...leafIds, ...carried])];
	const allowed = firstRefusal(
		notFinished(request),
		unknownLeaves(unique, knownLeafIds, request.drafts),
		guard(
			request.frozen,
			`The specification is frozen as version ${request.specVersion}. Rebrief the request before changing what it touches.`,
			'What a frozen version touches is part of what was frozen.'
		)
	);
	if (!allowed.ok) return allowed;
	return done({ ...request, leafIds: unique }, `Touches ${unique.length} feature${unique.length === 1 ? '' : 's'}`);
}

/* ───────────────────────── The change, as a draft ───────────────────────── */

/**
 * The dossier carries what the change proposes, and carries it alone. These
 * three acts are the whole of it: nothing here reaches a section, and a request
 * deleted with drafts on it leaves the specification exactly as it was
 * (ac-evo-draft-4). What writes them is the freeze, once (ac-evo-draft-5).
 */

const draftsAreOpen = (request: EvolutionRequest): Guarded =>
	guard(
		request.frozen,
		`The specification is frozen as version ${request.specVersion}. Rebrief the request before changing what it proposes.`,
		'What a frozen version proposes is part of what was frozen; the code is being written against it.'
	);

/** The Briefing reads locked from the freeze on, and the server keeps it so: the build is compared to the version frozen (issue 45). */
const briefingIsOpen = (request: EvolutionRequest): Guarded =>
	guard(
		request.frozen,
		`The specification is frozen as version ${request.specVersion}. Rebrief the request before changing its Briefing.`,
		'The Briefing is part of the version frozen; the code is being written against it.'
	);

export interface DraftLeafInput {
	readonly kind?: DraftLeafKind;
	readonly baseLeafId?: string | null;
	readonly name?: string;
	readonly description?: string;
	readonly coreId?: string | null;
	readonly parentFamilyId?: string | null;
	readonly objective?: string;
	readonly problem?: string;
	readonly expectedEffect?: string;
	readonly value?: string;
	/** A text, or {id, text} to reword the criterion of that id (ac-evo-draft-criteria-ids). */
	readonly acceptanceCriteria?: readonly CriterionInput[];
	readonly dependsOn?: readonly string[];
	readonly sourceIds?: readonly string[];
	readonly behaviour?: readonly { kind: DraftBehaviourNote['kind']; name: string; detail?: string }[];
	/** amend only: ids of the base feature's criteria to retire. */
	readonly retireCriteria?: readonly string[];
	/** amend only: base criteria reworded, by id. */
	readonly changeCriteria?: readonly { id: string; text: string }[];
	/** amend only: exact passages of the base description to replace. */
	readonly descriptionPatch?: readonly { find: string; replace: string }[];
	/** amend only: text added after the base description. */
	readonly descriptionAppend?: string;
	/** What the subject changes, read on the subject and never written into the feature. */
	readonly changeSummary?: string;
}

/** What an amendment is measured against: the feature as the tree holds it. */
export type BaseLeafLookup = (
	leafId: string
) => { readonly description: string; readonly criteria: readonly { readonly id: string; readonly text: string }[] } | null;

type DeltaFields = Pick<DraftLeaf, 'retireCriteria' | 'changeCriteria' | 'descriptionPatch' | 'descriptionAppend'>;

/** A draft with its delta cleared, so the delta just checked replaces it whole. */
function withoutDelta(draft: DraftLeaf): DraftLeaf {
	const out = { ...draft };
	delete out.retireCriteria;
	delete out.changeCriteria;
	delete out.descriptionPatch;
	delete out.descriptionAppend;
	return out;
}

/**
 * The delta half of an amendment, checked against the base feature: every id
 * it names must be one of the feature's criteria, and every passage it
 * replaces must occur in the description exactly once, so an edit can never
 * land somewhere nobody pointed at. Fields not sent keep what the draft had.
 */
function draftDelta(
	input: DraftLeafInput,
	kind: DraftLeafKind,
	baseLeafId: string | null,
	current: DeltaFields,
	base: BaseLeafLookup | undefined
): { ok: true; fields: DeltaFields } | Refused {
	const sent =
		input.retireCriteria !== undefined ||
		input.changeCriteria !== undefined ||
		input.descriptionPatch !== undefined ||
		input.descriptionAppend !== undefined;
	if (!sent) return { ok: true, fields: current };
	if (kind !== 'amend')
		return refuse(
			'retireCriteria, changeCriteria, descriptionPatch and descriptionAppend amend an existing feature.',
			'An addition has nothing to retire or patch, and a removal takes the whole feature: send the delta on a draft of kind "amend".'
		);
	const leaf = baseLeafId && base ? base(baseLeafId) : null;
	const known = new Set((leaf?.criteria ?? []).map((c) => c.id));
	const retire = input.retireCriteria === undefined ? current.retireCriteria : [...new Set(input.retireCriteria)];
	const change =
		input.changeCriteria === undefined
			? current.changeCriteria
			: input.changeCriteria
					.map((c) => ({ id: c.id.trim(), text: c.text.trim() }))
					.filter((c) => c.id !== '' && c.text !== '');
	const unknown = [...(retire ?? []), ...(change ?? []).map((c) => c.id)].filter((id) => !known.has(id));
	if (leaf && unknown.length > 0)
		return refuse(
			`"${baseLeafId}" carries no acceptance criterion ${unknown.map((id) => `"${id}"`).join(', ')}.`,
			'A retired or reworded criterion is named by the id the feature gave it; get_section(features) or get_knowledge_graph with the feature id lists them.'
		);
	const patch =
		input.descriptionPatch === undefined
			? current.descriptionPatch
			: input.descriptionPatch.filter((p) => p.find !== '').map((p) => ({ find: p.find, replace: p.replace }));
	for (const p of patch ?? []) {
		const occurrences = leaf ? leaf.description.split(p.find).length - 1 : 1;
		if (occurrences !== 1)
			return refuse(
				occurrences === 0
					? `The description of "${baseLeafId}" does not contain: "${p.find.slice(0, 80)}".`
					: `"${p.find.slice(0, 80)}" occurs ${occurrences} times in the description of "${baseLeafId}".`,
				'A patch replaces one exact passage of the description as the feature holds it now; quote a passage that occurs exactly once.'
			);
	}
	const append =
		input.descriptionAppend === undefined ? current.descriptionAppend : input.descriptionAppend.trim() || undefined;
	return {
		ok: true,
		fields: {
			...(retire && retire.length > 0 ? { retireCriteria: retire } : {}),
			...(change && change.length > 0 ? { changeCriteria: change } : {}),
			...(patch && patch.length > 0 ? { descriptionPatch: patch } : {}),
			...(append ? { descriptionAppend: append } : {})
		}
	};
}

const BEHAVIOUR_KINDS: ReadonlySet<DraftBehaviourNote['kind']> = new Set([
	'surface',
	'state',
	'action',
	'rule',
	'scenario'
]);

/** The shape checks shared by creating a draft and amending one. */
function draftShape(
	kind: DraftLeafKind,
	name: string,
	baseLeafId: string | null,
	knownLeafIds: ReadonlySet<string>
): Guarded {
	return firstRefusal(
		guard(
			kind === 'add' && name.trim() === '',
			'A drafted feature needs a name.',
			'The name is what the impact report, the coherence check and the freeze all call it; without one the draft cannot be read back.'
		),
		guard(
			kind !== 'add' && (baseLeafId === null || baseLeafId.trim() === ''),
			`A draft of kind "${kind}" stands for an existing feature: name it with baseLeafId.`,
			'Amending or removing is done TO something. Without the feature it stands for, the draft says what the product would become without saying from what.'
		),
		guard(
			kind !== 'add' &&
				baseLeafId !== null &&
				baseLeafId.trim() !== '' &&
				!knownLeafIds.has(baseLeafId),
			`Unknown feature "${baseLeafId}".`,
			'A draft amends or removes a leaf that exists; the features section lists them.'
		)
	);
}

function behaviourRows(
	ctx: ActContext,
	rows: DraftLeafInput['behaviour']
): { ok: true; rows: DraftBehaviourNote[] } | Refused {
	const out: DraftBehaviourNote[] = [];
	for (const row of rows ?? []) {
		if (!BEHAVIOUR_KINDS.has(row.kind))
			return refuse(
				`"${row.kind}" is not something a behaviour row can be.`,
				`A drafted behaviour row is one of: ${[...BEHAVIOUR_KINDS].join(', ')}.`
			);
		if (row.name.trim() === '')
			return refuse(
				'A behaviour row needs a name.',
				'An unnamed surface, action or rule cannot be pointed at, so it cannot be discussed or built.'
			);
		out.push({
			id: ctx.newId(),
			kind: row.kind,
			name: row.name.trim(),
			detail: (row.detail ?? '').trim()
		});
	}
	return { ok: true, rows: out };
}

/**
 * Put what the change proposes on the dossier, and touch it: a draft counts as
 * touched the moment it exists, because a change nobody counts as touched is a
 * change no report computes from (ac-evo-draft-3).
 */
function addDraftLeafActCore(
	ctx: ActContext,
	request: EvolutionRequest,
	input: DraftLeafInput,
	knownLeafIds: ReadonlySet<string>,
	base?: BaseLeafLookup
): ActOutcome {
	const kind: DraftLeafKind = input.kind ?? 'add';
	const name = (input.name ?? '').trim();
	const baseLeafId = input.baseLeafId ?? null;
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		guard(
			kind !== 'add' && baseLeafId !== null && request.drafts.some((d) => d.baseLeafId === baseLeafId),
			`This request already carries a draft for "${baseLeafId}".`,
			'One feature moves one way per request. Two drafts for the same feature would leave the freeze with no way to know which to write.'
		),
		draftShape(kind, name, baseLeafId, knownLeafIds),
		unknownLeaves(input.dependsOn ?? [], knownLeafIds, request.drafts)
	);
	if (!allowed.ok) return allowed;
	const behaviour = behaviourRows(ctx, input.behaviour);
	if (!behaviour.ok) return behaviour;
	const delta = draftDelta(input, kind, baseLeafId, {}, base);
	if (!delta.ok) return delta;

	const standsFor = kind === 'add' ? null : baseLeafId;
	const draft = createDraftLeaf({
		id: `${DRAFT_LEAF_PREFIX}${ctx.newId()}`,
		kind,
		baseLeafId: standsFor,
		// Left empty on purpose when the change does not rename: the freeze then
		// keeps the name the leaf already has.
		name,
		description: (input.description ?? '').trim(),
		...((input.changeSummary ?? '').trim() ? { changeSummary: (input.changeSummary ?? '').trim() } : {}),
		coreId: input.coreId ?? null,
		parentFamilyId: input.parentFamilyId ?? null,
		objective: (input.objective ?? '').trim(),
		problem: (input.problem ?? '').trim(),
		expectedEffect: (input.expectedEffect ?? '').trim(),
		value: (input.value ?? '').trim(),
		acceptanceCriteria: keptCriteria(ctx, [], input.acceptanceCriteria ?? []),
		...delta.fields,
		dependsOn: [...new Set(input.dependsOn ?? [])],
		sourceIds: [...new Set(input.sourceIds ?? [])],
		behaviour: behaviour.rows
	});

	// A draft that amends or removes a feature touches that feature too: what
	// rested on it is what the walk has to reach.
	const touched = new Set([...request.leafIds, draft.id]);
	if (draft.baseLeafId) touched.add(draft.baseLeafId);

	return done(
		stamp(
			ctx,
			{ ...request, drafts: [...request.drafts, draft], leafIds: [...touched] },
			'draft_change',
			said(ctx).drafted(kind, String(draft.name || draft.baseLeafId))
		),
		`Drafted ${kind} "${draft.name || draft.baseLeafId}" as ${draft.id}`
	);
}

export type CriterionInput = string | { readonly id?: string; readonly text: string };

/**
 * A draft's criteria as sent, keeping identity (ac-evo-draft-criteria-ids): a
 * criterion sent with an id it already holds is that criterion reworded, one
 * whose text did not change keeps its id, and only a new text gets a new id.
 * Minting a new id for every line on every update made a version comparison
 * read each untouched criterion as removed then added.
 */
function keptCriteria(ctx: ActContext, current: readonly DraftCriterion[], input: readonly CriterionInput[]): DraftCriterion[] {
	const byId = new Map(current.map((c) => [c.id, c]));
	const byText = new Map(current.map((c) => [c.text.trim(), c]));
	const used = new Set<string>();
	const out: DraftCriterion[] = [];
	for (const item of input) {
		const text = (typeof item === 'string' ? item : item.text).trim();
		if (text === '') continue;
		const given = typeof item === 'string' ? undefined : item.id;
		let id = given && byId.has(given) && !used.has(given) ? given : undefined;
		const same = byText.get(text);
		if (!id && same && !used.has(same.id)) id = same.id;
		id ??= ctx.newId();
		used.add(id);
		out.push({ id, text });
	}
	return out;
}

function updateDraftLeafActCore(
	ctx: ActContext,
	request: EvolutionRequest,
	draftId: string,
	input: DraftLeafInput,
	knownLeafIds: ReadonlySet<string>,
	base?: BaseLeafLookup
): ActOutcome {
	const current = request.drafts.find((d) => d.id === draftId);
	if (!current)
		return refuse(
			`This request carries no draft "${draftId}".`,
			'get_evolution lists the drafts of a request with their ids; add_draft_leaf creates one.'
		);
	const kind = input.kind ?? current.kind;
	const name = input.name !== undefined ? input.name.trim() : current.name;
	const baseLeafId = input.baseLeafId !== undefined ? input.baseLeafId : current.baseLeafId;
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		draftShape(kind, name, baseLeafId, knownLeafIds),
		unknownLeaves(input.dependsOn ?? [], knownLeafIds, request.drafts)
	);
	if (!allowed.ok) return allowed;
	// The behaviour model is operations over what the draft stands for: an empty
	// feature for an addition, the base feature otherwise. Moving the draft under
	// it would replay the same operations over something else.
	if (current.behaviourModel && (kind !== current.kind || baseLeafId !== current.baseLeafId))
		return refuse(
			`Draft "${current.name || draftId}" carries a behaviour model written over ${
				current.kind === 'add' ? 'an empty feature' : `feature ${current.baseLeafId}`
			}; its kind or base feature cannot change under it.`,
			'Clear the model first (set_draft_behaviour with operations:[]), then change the draft and author its behaviour again.'
		);
	const behaviour = input.behaviour === undefined ? null : behaviourRows(ctx, input.behaviour);
	if (behaviour && !behaviour.ok) return behaviour;
	const delta = draftDelta(input, kind, baseLeafId, current, base);
	if (!delta.ok) return delta;

	const next: DraftLeaf = {
		...withoutDelta(current),
		...delta.fields,
		kind,
		baseLeafId: kind === 'add' ? null : baseLeafId,
		name,
		description: input.description !== undefined ? input.description.trim() : current.description,
		...(input.changeSummary !== undefined
			? { changeSummary: input.changeSummary.trim() }
			: current.changeSummary !== undefined
				? { changeSummary: current.changeSummary }
				: {}),
		coreId: input.coreId !== undefined ? input.coreId : current.coreId,
		parentFamilyId:
			input.parentFamilyId !== undefined ? input.parentFamilyId : current.parentFamilyId,
		objective: input.objective !== undefined ? input.objective.trim() : current.objective,
		problem: input.problem !== undefined ? input.problem.trim() : current.problem,
		expectedEffect:
			input.expectedEffect !== undefined ? input.expectedEffect.trim() : current.expectedEffect,
		value: input.value !== undefined ? input.value.trim() : current.value,
		acceptanceCriteria:
			input.acceptanceCriteria === undefined
				? current.acceptanceCriteria
				: keptCriteria(ctx, current.acceptanceCriteria, input.acceptanceCriteria),
		dependsOn: input.dependsOn === undefined ? current.dependsOn : [...new Set(input.dependsOn)],
		sourceIds: input.sourceIds === undefined ? current.sourceIds : [...new Set(input.sourceIds)],
		behaviour: behaviour ? behaviour.rows : current.behaviour
	};

	const touched = new Set(request.leafIds);
	if (next.baseLeafId) touched.add(next.baseLeafId);

	// A rework is a draft change like the others: the readings of the Impact analysis run again on it (issue 63).
	return done(
		stamp(
			ctx,
			{
				...request,
				drafts: request.drafts.map((d) => (d.id === draftId ? next : d)),
				leafIds: [...touched]
			},
			'draft_change',
			said(ctx).redrafted(String(next.name || next.baseLeafId))
		),
		`Draft "${next.name || next.baseLeafId}" updated`
	);
}

/**
 * Set a draft's runnable behaviour: the operations of the change and the ids
 * the engine minted replaying them (see DraftBehaviourModel). The caller has
 * had the engine validate them over the feature the draft stands for; this act
 * only keeps them. `null` clears the model, leaving the prose notes.
 */
function setDraftBehaviourModelActCore(
	ctx: ActContext,
	request: EvolutionRequest,
	draftId: string,
	model: { operations: Record<string, unknown>[]; mintedIds: string[] } | null
): ActOutcome {
	const current = request.drafts.find((d) => d.id === draftId);
	if (!current)
		return refuse(
			`This request carries no draft "${draftId}".`,
			'get_evolution lists the drafts of a request with their ids; add_draft_leaf creates one.'
		);
	const allowed = firstRefusal(notFinished(request), draftsAreOpen(request));
	if (!allowed.ok) return allowed;
	const { behaviourModel: previous, ...rest } = current;
	// What an earlier freeze wrote stays written: only what is still to write is replaced.
	const landed = previous?.landed;
	const next: DraftLeaf =
		(model && model.operations.length > 0) || landed
			? {
					...rest,
					behaviourModel: {
						operations: model?.operations ?? [],
						mintedIds: model?.mintedIds ?? [],
						updatedAt: ctx.at,
						...(landed ? { landed } : {})
					}
				}
			: rest;
	const label = current.name || current.baseLeafId || draftId;
	const summary = next.behaviourModel
		? said(ctx).modelSet(label, next.behaviourModel.operations.length)
		: said(ctx).modelCleared(label);
	return done(
		stamp(
			ctx,
			{ ...request, drafts: request.drafts.map((d) => (d.id === draftId ? next : d)) },
			'draft_change',
			summary
		),
		summary
	);
}

function removeDraftLeafActCore(
	ctx: ActContext,
	request: EvolutionRequest,
	draftId: string
): ActOutcome {
	const current = request.drafts.find((d) => d.id === draftId);
	if (!current)
		return refuse(
			`This request carries no draft "${draftId}".`,
			'get_evolution lists the drafts of a request with their ids.'
		);
	const allowed = firstRefusal(notFinished(request), draftsAreOpen(request));
	if (!allowed.ok) return allowed;
	// Taking a feature out is a draft change too: the readings must stop describing it (issue 63).
	const without: EvolutionRequest = {
		...request,
		drafts: request.drafts.filter((d) => d.id !== draftId),
		leafIds: request.leafIds.filter((id) => id !== draftId),
		// Dropping the draft drops what was proposed on it. The sections were
		// never touched, so there is nothing else to undo.
		proposals: request.proposals.filter(
			(proposal) => !proposal.targetField.endsWith(`@${draftId}`)
		)
	};
	return done(
		stamp(ctx, without, 'draft_change', said(ctx).undrafted(String(current.name || current.baseLeafId))),
		`Draft "${current.name || current.baseLeafId}" dropped; the specification is untouched`
	);
}

/* ───────────────────────── Proposals ───────────────────────── */

export interface ProposeInput {
	readonly fieldPath: string;
	readonly leafId: string | null;
	readonly value: string;
	readonly reasoning: string;
	readonly citedSourceIds: readonly string[];
	/**
	 * The two halves of the reasoning, named rather than looked for in the prose:
	 * what was READ in the sources, and what was INFERRED from it.
	 *
	 * They exist because the separation used to be guessed by searching the free
	 * text for the English words "read" and "infer". A reasoning written in the
	 * project's own language said exactly what had been read and what had been
	 * inferred, and was told that it did not, which no rewording could fix.
	 */
	readonly whatWasRead?: string;
	readonly whatWasInferred?: string;
	/** Asserted by the caller when it fills the single free-text reasoning instead. */
	readonly readVsInferred?: boolean;
	/** The one fact the AI is missing, asked with the suggestion, and the answers a click gives (ac-evo-live-card-ask). */
	readonly question?: string;
	readonly choices?: readonly string[];
	/** The question takes several answers, ticked (ac-evo-live-choices). */
	readonly multiple?: boolean;
}

export interface ProposeChecks {
	readonly sourceExists: (id: string) => boolean;
	/**
	 * Words the glossary bans, with the agreed term each stands in for; a proposal
	 * using one is flagged before it is offered. A bare string is a word whose
	 * agreed term is not known.
	 */
	readonly bannedWords: readonly (string | { readonly avoid: string; readonly prefer: string })[];
}

const escapeWord = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The paths a proposal can fill, listed in the refusal that rejects one.
 *
 * A refusal naming neither what it received nor what it accepts costs a round
 * trip, and pointing at another tool costs a second one when the caller is
 * holding a reading that already lists them.
 */
/** The source a value names, by its code or its label; null when it names none of the six. */
export function originCodeOf(value: string): RequestOrigin | null {
	const wanted = value.trim().toLowerCase();
	return REQUEST_ORIGINS.find((o) => o.code === wanted || o.label.toLowerCase() === wanted)?.code ?? null;
}

export function proposableFieldPaths(): string {
	return [...ORIGIN_FIELDS, ...NEED_FIELDS, ...ALL_BLOCK_FIELDS.filter((f) => f.editor === 'inline')]
		.map((f) => f.path)
		.join(', ');
}

/** Every banned word the prose uses, each with the agreed term it stands in for. */
export function flaggedWordsIn(
	value: string,
	bannedWords: ProposeChecks['bannedWords']
): { word: string; prefer: string }[] {
	const prose = withoutQuotations(value);
	const found: { word: string; prefer: string }[] = [];
	for (const entry of bannedWords) {
		const word = (typeof entry === 'string' ? entry : entry.avoid).trim();
		if (word.length < 2 || found.some((f) => f.word.toLowerCase() === word.toLowerCase())) continue;
		if (new RegExp(`\\b${escapeWord(word)}\\b`, 'i').test(prose))
			found.push({ word, prefer: typeof entry === 'string' ? '' : entry.prefer });
	}
	return found;
}

export function usesBannedWord(value: string, bannedWords: ProposeChecks['bannedWords']): boolean {
	return flaggedWordsIn(value, bannedWords).length > 0;
}

/** One proposal for one empty field, offered to a person (ac-evo-llm-1..3, -7). */
export function proposeAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: ProposeInput,
	checks: ProposeChecks
): ActOutcome {
	const field = blockFieldByPath(input.fieldPath);
	const leafScoped = field ? isLeafScoped(field) : false;
	const missingSources = input.citedSourceIds.filter((id) => !checks.sourceExists(id));
	const key = fieldKey(input.fieldPath, leafScoped ? input.leafId : null);
	// Structural, never linguistic: the two halves are either named or they are
	// not. No language is privileged, because a check that only passes in English
	// switches the sourcing discipline off wherever the product is actually used.
	const read = input.whatWasRead?.trim() ?? '';
	const inferred = input.whatWasInferred?.trim() ?? '';
	const waiting = pendingProposals(request).filter((p) => fieldKey(p.targetField, leafOf(p)) === key);
	const allowed = firstRefusal(
		notFinished(request),
		guard(
			!field,
			`No field is named "${input.fieldPath}". The fields a proposal can fill are ${proposableFieldPaths()}.`,
			'The same list comes back as `fieldsAvailable` on the reading you already have, so the accepted paths never have to be looked up elsewhere.'
		),
		guard(
			field?.editor === 'capability',
			'This block is a reading, not a field: author it in the section that owns it.',
			'Its home has an editor of its own (apply_behavior_batch, users, data...), and the reading fills itself from what is written there.'
		),
		guard(
			leafScoped && (!input.leafId || !request.leafIds.includes(input.leafId)),
			request.leafIds.length === 0
				? 'Name the features this request touches first (set_leaves).'
				: `Name the feature this value belongs to: one of ${request.leafIds.join(', ')}.`,
			'A leaf-scoped value is written on one touched feature; the dossier keeps no copy.'
		),
		guard(
			input.value.trim() === '',
			'A proposal needs a value.',
			'An empty proposal offers nothing to sign.'
		),
		guard(
			input.fieldPath === ORIGIN_ANSWER_KEYS.origin && input.value.trim() !== '' && !originCodeOf(input.value),
			`The source is one of ${REQUEST_ORIGINS.map((o) => o.code).join(', ')}.`,
			'The source of a request is read later to say how much of the work customers drive, so it takes one of the six.'
		),
		guard(
			input.citedSourceIds.length === 0,
			'A proposal cites at least one source of the evidence register.',
			'A value nobody can trace back to a source cannot be signed for; register the source in documents first.'
		),
		guard(
			missingSources.length > 0,
			`Unknown source${missingSources.length === 1 ? '' : 's'}: ${missingSources.join(', ')}.`,
			'Sources are cited by the id of their row in the documents register.'
		),
		// Refused HERE, not at the signature. A proposal that can never be accepted
		// used to be stored, counted as blocked with no reason, and refused only
		// when someone tried to accept it; in an atomic batch that refusal also
		// rolled back the valid decisions taken before it.
		guard(
			(read === '' || inferred === '') && input.readVsInferred !== true,
			'Say what was read and what was inferred in their own fields: whatWasRead and whatWasInferred.',
			'A proposal without both halves can never be accepted, so it is refused when it is made rather than when someone tries to sign it. The two are named fields, in any language: nothing is looked for in the wording, and the free-text reasoning alone does not stand for them.'
		),
		askAllowed({ question: input.question ?? '', choices: input.choices ?? [], multiple: input.multiple }),
		// The AI's own suggestion whose question the person answered is the one this one replaces (ac-evo-live-card-ask).
		guard(
			waiting.some((p) => !replaceableBy(p, ctx.actor.id)),
			'A proposal is already waiting on this field. The person decides it first (accept, refuse or reword).',
			'One proposal per empty field, so the reader judges rather than compares.'
		)
	);
	if (!allowed.ok || !field) return allowed as Refused;

	const path = canonicalPathsFor(field, input.leafId ? [input.leafId] : [])[0]?.path ?? '';
	const flagged = flaggedWordsIn(input.value, checks.bannedWords);
	const proposal: Proposal = createProposal({
		id: ctx.newId(),
		targetField: input.fieldPath,
		canonicalSection: field.section,
		canonicalPath: path,
		value: input.fieldPath === ORIGIN_ANSWER_KEYS.origin ? (originCodeOf(input.value) ?? input.value.trim()) : input.value.trim(),
		// The free text stays what a reader reads. When only the two halves were
		// given, it is composed from them rather than left blank, so the dossier
		// never shows a proposal with no reasoning at all.
		reasoning: input.reasoning.trim() || [read, inferred].filter((part) => part !== '').join('\n\n'),
		whatWasRead: read,
		whatWasInferred: inferred,
		reasoningSeparatesReadFromInferred: input.readVsInferred ?? true,
		citedSourceIds: [...new Set(input.citedSourceIds)],
		bannedSynonymDetected: flagged.length > 0,
		flaggedWords: flagged,
		proposedBy: ctx.actor.id
	});
	const ask = askOf({ question: input.question ?? '', choices: input.choices ?? [], multiple: input.multiple });
	// The suggestion it rewrites in place goes, and what was asked and answered on it stays with the new one.
	const replaced = waiting.find((p) => replaceableBy(p, ctx.actor.id));
	const dialogue = replaced ? dialogueAfter(replaced) : [];
	// The ids it rewrote stay with it, so a link handed out to one of them lands on this one (ac-evo-link-arrival-only).
	const replaces = replaced ? [...(replaced.replaces ?? []), replaced.id] : [];
	const offered: Proposal = {
		...proposal,
		...(ask ? { ask } : {}),
		...(dialogue.length > 0 ? { dialogue } : {}),
		...(replaces.length > 0 ? { replaces } : {})
	};
	return done(
		{ ...request, proposals: [...request.proposals.filter((p) => p.id !== replaced?.id), offered] },
		`${replaced ? 'Rewrote' : 'Proposed'} ${field.label}${input.leafId ? ` for ${input.leafId}` : ''}${ask ? ', with one question' : ''}${offered.bannedSynonymDetected ? ' (flagged: banned word)' : ''}`
	);
}

/** The leaf a proposal writes on, read off its canonical path. */
export function leafOf(proposal: Proposal): string | null {
	const field = blockFieldByPath(proposal.targetField);
	if (!field || !isLeafScoped(field)) return null;
	const [prefix, suffix] = field.canonicalPath.split('{leaf}');
	if (!proposal.canonicalPath.startsWith(prefix) || !proposal.canonicalPath.endsWith(suffix)) return null;
	return proposal.canonicalPath.slice(prefix.length, proposal.canonicalPath.length - suffix.length) || null;
}

export type ProposalDecisionInput =
	/**
	 * `sense`: when the value carries a flagged word, the person may say it was
	 * used in another sense than the one the glossary guards; it is recorded
	 * beside the value (a3960bf7).
	 */
	| { readonly decision: 'accept'; readonly sense?: string }
	| { readonly decision: 'refuse'; readonly comment: string }
	| { readonly decision: 'reword'; readonly value: string };

/** Whether every tagged reviewer stands behind the proposal. */
const withVerdict = (proposal: Proposal, verdict: Proposal['verdicts'][number]): Proposal => ({
	...proposal,
	verdicts: [...proposal.verdicts.filter((v) => v.by !== verdict.by), verdict]
});

/**
 * Hand a proposal to named reviewers (ac-evo-llm-11). Only where a roster of
 * more than one member exists: the Community operator is alone, and one
 * acceptance writes the value there.
 */
export function tagReviewersAct(
	ctx: ActContext,
	request: EvolutionRequest,
	proposalId: string,
	reviewerIds: readonly string[],
	roster: ReadonlySet<string> | null
): ActOutcome {
	const proposal = request.proposals.find((p) => p.id === proposalId);
	if (!proposal)
		return refuse('This proposal does not exist on the request.', 'get_evolution lists the pending proposals with their ids.');
	const unique = [...new Set(reviewerIds.map((id) => id.trim()).filter((id) => id !== ''))];
	const unknown = roster ? unique.filter((id) => !roster.has(id)) : [];
	const allowed = firstRefusal(
		notFinished(request),
		personOnly(ctx.actor, 'tag reviewers'),
		guard(
			roster === null,
			'Reviewers can be tagged only where the workspace holds more than one member.',
			'With one member, that member is the reviewer: one acceptance writes the value.'
		),
		guard(
			proposal.decision !== 'pending' && proposal.decision !== 'reworded',
			'This proposal has already been decided.',
			'Reviewers are tagged on a proposal still waiting for a decision.'
		),
		guard(
			unknown.length > 0,
			`Not ${unknown.length === 1 ? 'a member' : 'members'} of the workspace: ${unknown.join(', ')}.`,
			'A reviewer is picked from the roster of the workspace.'
		)
	);
	if (!allowed.ok) return allowed;
	return done(
		{
			...request,
			proposals: request.proposals.map((p) =>
				p.id === proposalId
					? { ...p, reviewerIds: unique, verdicts: p.verdicts.filter((v) => unique.includes(v.by)) }
					: p
			)
		},
		unique.length === 0
			? `Nobody is asked to look at the proposed ${proposal.targetField} any more`
			: `Asked ${unique.join(', ')} to look at the proposed ${proposal.targetField}; anyone with access decides it`
	);
}

/**
 * Decide a proposal (ac-evo-llm-4..6). Accepting writes the value through to
 * its section: `writeThrough` is that write, run by the caller who holds the
 * section, and its refusal is the section's own. A proposal with tagged
 * reviewers is written once every reviewer validated (ac-evo-llm-11).
 */
export function decideProposalAct(
	ctx: ActContext,
	request: EvolutionRequest,
	proposalId: string,
	input: ProposalDecisionInput,
	writeThrough: (proposal: Proposal, leafId: string | null) => Guarded
): ActOutcome {
	let proposal = request.proposals.find((p) => p.id === proposalId);
	if (!proposal)
		return refuse('This proposal does not exist on the request.', 'get_evolution lists the pending proposals with their ids.');
	const finished = notFinished(request);
	if (!finished.ok) return finished;

	// Members asked for their eye leave a verdict when they decide, but nobody's
	// verdict is required: anyone with access decides (ac-evo-llm-11).
	const reviewed = proposal.reviewerIds.includes(ctx.actor.id);
	const notAViewer = guard(
		!canEdit(ctx.actor),
		'A viewer reads and comments, but does not decide a proposal.',
		'Deciding a proposal writes the specification.'
	);

	if (input.decision === 'accept') {
		// A question of the need, and who asked and where it comes from, belong to
		// the request: there is no section to write through to, the value lands on the request itself.
		const needKey = needKeyOf(proposal.targetField);
		const ownedByRequest = !!needKey || isOriginField(proposal.targetField);
		const allowed = firstRefusal(
			canAcceptProposal(ctx.actor, proposal, { soloWorkspace: ctx.soloWorkspace || ctx.aiDelegated }),
			guard(
				proposal.decision !== 'pending' && proposal.decision !== 'reworded',
				'This proposal has already been decided.',
				'A decided proposal is a signed decision; propose again for a new value.'
			),
			notAViewer,
			// Accepting a Briefing value writes the Briefing: frozen, it refuses as update_need and update_request do.
			ownedByRequest ? briefingIsOpen(request) : ALLOW
		);
		if (!allowed.ok) return allowed;
		if (reviewed) proposal = withVerdict(proposal, { by: ctx.actor.id, verdict: 'validated', comment: '', at: ctx.at });
		const leafId = leafOf(proposal);
		const written = ownedByRequest ? ALLOW : writeThrough(proposal, leafId);
		if (!written.ok) return written;
		const key = fieldKey(proposal.targetField, leafId);
		const field = blockFieldByPath(proposal.targetField);
		const holds = field ? holdsValue(field, proposal.value) : proposal.value.trim() !== '';
		const signed = proposal;
		const sense = proposal.bannedSynonymDetected ? (input.sense ?? '').trim() : '';
		const versioned = withFieldVersion(request, {
			id: ctx.newId(),
			key,
			value: proposal.value,
			actor: ctx.actor,
			at: ctx.at,
			proposalId
		});
		// A question of a touched feature is read at the Impact analysis and reopens no step of prose (ac-evo-req-21).
		const written_ = needKey
			? reopenSteps(withNeed(versioned, needKey, proposal.value), ['need'])
			: isOriginField(proposal.targetField)
				? withOriginAnswer(versioned, proposal.targetField, proposal.value)
				: versioned;
		// Accepting writes a new version and validates nothing: it waits for its validation like a typed answer (ac-evo-hist-accept-awaits-validation).
		const accepted: EvolutionRequest = {
			...written_,
			proposals: request.proposals.map((p) =>
				p.id === proposalId
					? { ...signed, decision: 'accepted', acceptedBy: ctx.actor.id, acceptedAt: ctx.at, keptWordingSense: sense }
					: p
			),
			openQuestionKeys: holds ? request.openQuestionKeys.filter((k) => k !== key) : request.openQuestionKeys,
			answeredKeys: request.answeredKeys.includes(key) ? request.answeredKeys : [...request.answeredKeys, key]
		};
		return done(
			stamp(ctx, accepted, 'accepted_proposal', said(ctx).accepted(proposal.targetField, keptWording(ctx, proposal, sense)), {
				proposalId,
				acceptedByPersonId: ctx.actor.id
			}),
			`Accepted and wrote ${proposal.targetField}${leafId ? ` for ${leafId}` : ''}`
		);
	}

	if (input.decision === 'refuse') {
		const allowed = firstRefusal(
			canRefuseProposal(ctx.actor, { soloWorkspace: ctx.soloWorkspace }),
			guard(
				proposal.decision !== 'pending' && proposal.decision !== 'reworded',
				'This proposal has already been decided.',
				'A decided proposal is a signed decision.'
			),
			notAViewer
		);
		if (!allowed.ok) return allowed;
		const refusedProposal: Proposal = {
			...(reviewed
				? withVerdict(proposal, { by: ctx.actor.id, verdict: 'invalidated', comment: input.comment.trim(), at: ctx.at })
				: proposal),
			decision: 'refused',
			comment: input.comment.trim()
		};
		const next = { ...request, proposals: request.proposals.map((p) => (p.id === proposalId ? refusedProposal : p)) };
		return done(
			reviewed
				? stamp(ctx, next, 'proposal_verdict', said(ctx).invalidated(proposal.targetField), { proposalId })
				: next,
			`Refused the proposed ${proposal.targetField}`
		);
	}

	const allowed = firstRefusal(
		carriesForward(ctx, 'reword a proposal'),
		canRewordProposal(proposal),
		guard(input.value.trim() === '', 'A rewording needs a value.', 'An empty rewording offers nothing to sign.')
	);
	if (!allowed.ok) return allowed;
	return done(
		{
			...request,
			// A new wording is a new thing to stand behind: the verdicts given so far go.
			proposals: request.proposals.map((p) =>
				p.id === proposalId
					? { ...p, value: input.value.trim(), decision: 'reworded', bannedSynonymDetected: false, flaggedWords: [], verdicts: [] }
					: p
			)
		},
		`Reworded the proposed ${proposal.targetField}`
	);
}

/**
 * Decide one line of a suggestion made of statements (ac-evo-llm-line-decision),
 * judged against the answer as it stands (`current`): a line it would add, or
 * one it would take away. Accepting writes the answer with that one line
 * changed, a new version waiting for its validation like a whole acceptance;
 * rejecting takes the line out of the suggestion. The suggestion stays open
 * while it still changes a line, then is settled: accepted when one of its
 * lines was, refused otherwise.
 */
export function decideProposalLineAct(
	ctx: ActContext,
	request: EvolutionRequest,
	proposalId: string,
	input: { readonly line: string; readonly decision: 'accept' | 'refuse'; readonly current: string },
	writeThrough: (proposal: Proposal, leafId: string | null) => Guarded
): ActOutcome {
	const proposal = request.proposals.find((p) => p.id === proposalId);
	if (!proposal)
		return refuse('This proposal does not exist on the request.', 'get_evolution lists the pending proposals with their ids.');
	const line = input.line.trim();
	const delta = listDelta(input.current, proposal.value);
	const side = delta.added.includes(line) ? 'added' : delta.removed.includes(line) ? 'removed' : null;
	const allowed = firstRefusal(
		notFinished(request),
		input.decision === 'accept'
			? canAcceptProposal(ctx.actor, proposal, { soloWorkspace: ctx.soloWorkspace || ctx.aiDelegated })
			: canRefuseProposal(ctx.actor, { soloWorkspace: ctx.soloWorkspace }),
		guard(
			proposal.decision !== 'pending' && proposal.decision !== 'reworded',
			'This proposal has already been decided.',
			'A decided proposal is a signed decision; propose again for a new value.'
		),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not decide a proposal.', 'Deciding a proposal writes the specification.'),
		// Accepting a line of the need writes the Briefing: frozen, it refuses as update_need does.
		input.decision === 'accept' && (!!needKeyOf(proposal.targetField) || isOriginField(proposal.targetField)) ? briefingIsOpen(request) : ALLOW
	);
	if (!allowed.ok) return allowed;
	if (side === null)
		return refuse(
			'This line is not one the suggestion changes any more: read it again.',
			'A line is decided against the answer as it stands now; get_evolution reads what the suggestion still adds and takes away.'
		);

	const lines = linesOf(input.current);
	let next = request;
	let current = input.current;
	let value = proposal.value;
	if (input.decision === 'accept') {
		current = (side === 'added' ? [...lines, line] : lines.filter((l) => l !== line)).join('\n');
		const leafId = leafOf(proposal);
		const needKey = needKeyOf(proposal.targetField);
		const written = needKey ? ALLOW : writeThrough({ ...proposal, value: current }, leafId);
		if (!written.ok) return written;
		const key = fieldKey(proposal.targetField, leafId);
		const versioned = withFieldVersion(request, { id: ctx.newId(), key, value: current, actor: ctx.actor, at: ctx.at, proposalId });
		const field = blockFieldByPath(proposal.targetField);
		const holds = field ? holdsValue(field, current) : current.trim() !== '';
		next = needKey ? reopenSteps(withNeed(versioned, needKey, current), ['need']) : versioned;
		next = {
			...next,
			openQuestionKeys: holds ? next.openQuestionKeys.filter((k) => k !== key) : next.openQuestionKeys,
			answeredKeys: next.answeredKeys.includes(key) ? next.answeredKeys : [...next.answeredKeys, key]
		};
	} else {
		// Rejecting a line it adds drops it; rejecting a line it takes away keeps that line, so it no longer takes it away.
		const proposed = linesOf(proposal.value);
		value = (side === 'added' ? proposed.filter((l) => l !== line) : [...proposed, line]).join('\n');
	}
	const lineDecisions: ProposalLineDecision[] = [
		...(proposal.lineDecisions ?? []),
		{ line, side, decision: input.decision === 'accept' ? ('accepted' as const) : ('refused' as const), by: ctx.actor.id, at: ctx.at }
	];
	const settled = listDelta(current, value).identical;
	const accepted = lineDecisions.some((d) => d.decision === 'accepted');
	const updated: Proposal = {
		...proposal,
		value,
		lineDecisions,
		...(settled ? (accepted ? { decision: 'accepted' as const, acceptedBy: ctx.actor.id, acceptedAt: ctx.at } : { decision: 'refused' as const }) : {})
	};
	next = { ...next, proposals: next.proposals.map((p) => (p.id === proposalId ? updated : p)) };
	const summary = `${input.decision === 'accept' ? 'Accepted' : 'Rejected'} one line of the proposed ${proposal.targetField}${settled ? '; the suggestion is settled' : ''}`;
	return done(
		input.decision === 'accept'
			? stamp(ctx, next, 'accepted_proposal', said(ctx).accepted(proposal.targetField, ''), { proposalId, acceptedByPersonId: ctx.actor.id })
			: next,
		summary
	);
}

/**
 * What the timeline says when a flagged wording is kept: the word, the term it
 * stands in for, and the person's reason when they gave one. Accepting with a
 * flag is a person's judgement, recorded as such.
 */
function keptWording(ctx: ActContext, proposal: Proposal, sense: string): string {
	if (!proposal.bannedSynonymDetected) return '';
	const say = said(ctx);
	const words = proposal.flaggedWords.map((f) => say.keptWord(f.word, f.prefer || null)).join(', ');
	return say.kept(words || say.keptFallback, sense);
}

/**
 * Take back a proposal nobody has decided (54d6ab98). Only the caller that made
 * it, and only while it waits: a flagged wording must never leave a field held
 * by a value nobody can sign. A person turns one down with refuse instead, which
 * is a decision and stays on the record as one.
 */
export function withdrawProposalAct(ctx: ActContext, request: EvolutionRequest, proposalId: string): ActOutcome {
	const proposal = request.proposals.find((p) => p.id === proposalId);
	if (!proposal)
		return refuse('This proposal does not exist on the request.', 'get_evolution lists the pending proposals with their ids.');
	const allowed = firstRefusal(
		notFinished(request),
		guard(
			proposal.decision !== 'pending' && proposal.decision !== 'reworded',
			'This proposal has already been decided.',
			'A decided proposal is a signed decision; only one still waiting can be taken back.'
		),
		guard(
			proposal.verdicts.length > 0,
			'A reviewer has already given a verdict on this proposal.',
			'Once somebody has stood behind it or against it, taking it back would erase their act; a person refuses it instead.'
		),
		guard(
			proposal.proposedBy !== '' ? proposal.proposedBy !== ctx.actor.id : ctx.actor.kind !== 'ai_client',
			'Only the caller that made this proposal can withdraw it.',
			'A person turns a proposal down with refuse, which is a decision and stays on the record as one.'
		)
	);
	if (!allowed.ok) return allowed;
	return done(
		stamp(
			ctx,
			{ ...request, proposals: request.proposals.filter((p) => p.id !== proposalId) },
			'withdrawn_proposal',
			said(ctx).withdrew(proposal.targetField),
			{ proposalId }
		),
		`Withdrew the proposed ${proposal.targetField}`
	);
}

/* ───────────────────────── Open questions and threads ───────────────────────── */

/**
 * A question of the dossier a person can postpone or discuss: a field of a
 * block, or a text a step of prose asks, its description or one of its
 * questions (ac-evo-form-question-acts).
 */
export function isDossierQuestion(fieldPath: string): boolean {
	// An action of the specification is discussed like an answer (spec-actions.ts).
	if (blockFieldByPath(fieldPath) || isElementPath(fieldPath)) return true;
	const prose = /^step\.([a-z_]+)\.([a-z_]+)$/.exec(fieldPath);
	return !!prose && ((prose[2] === 'description' && isDescribedStep(prose[1])) || stepQuestionOf(prose[1], prose[2]) !== null);
}

export function markOpenQuestionAct(
	ctx: ActContext,
	request: EvolutionRequest,
	fieldPath: string,
	leafId: string | null
): ActOutcome {
	const key = fieldKey(fieldPath, leafId);
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'declare an open question'),
		guard(
			!isDossierQuestion(fieldPath),
			`No field is named "${fieldPath}". The fields that can be declared open are ${proposableFieldPaths()}, and the texts of a step of prose (step.<step>.description, step.<step>.<question>).`,
			'The same list comes back as `fieldsAvailable` on the reading you already have.'
		),
		canMarkOpenQuestion({
			canEdit: canEdit(ctx.actor),
			fieldSelected: fieldPath !== '',
			alreadyOpen: request.openQuestionKeys.includes(key),
			blockState: ''
		}),
		// Postponing is offered until members validate the answer (ac-evo-form-question-acts).
		guard(fieldValidationOf(request, key).status === 'validated', 'This answer is validated: rewrite it to reopen it.', 'A validated answer is not postponed.')
	);
	if (!allowed.ok) return allowed;
	return done(
		{
			...request,
			openQuestionKeys: [...new Set([...request.openQuestionKeys, key])],
			// Postponing takes back a skip (ac-evo-form-question-skip).
			skippedQuestions: (request.skippedQuestions ?? []).filter((q) => q.key !== key)
		},
		`Declared ${fieldPath} an open question`
	);
}

/**
 * Leave a question unanswered on purpose, saying why (ac-evo-form-question-skip):
 * it is no longer owed, required or not, and holds neither its step nor the
 * freeze. Only an empty question is skipped, and skipping takes back a postponing.
 */
export function skipQuestionAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly fieldPath: string; readonly leafId: string | null; readonly reason: string; readonly liveValue: string }
): ActOutcome {
	const key = fieldKey(input.fieldPath, input.leafId);
	const reason = input.reason.trim();
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'skip a question'),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not skip a question.', 'A skip is a write on the request.'),
		guard(
			!isDossierQuestion(input.fieldPath),
			`No question is named "${input.fieldPath}".`,
			'A question of a block, or a text of a step of prose (step.<step>.description, step.<step>.<question>).'
		),
		guard(input.liveValue.trim() !== '', 'This question holds an answer: clear it to skip it.', 'Only an empty question is skipped.'),
		guard(skippedQuestionOf(request, key) !== null, 'This question is already skipped.', 'Answer it after all to take the skip back.'),
		guard(reason === '', 'Say why the question is skipped.', 'Whoever reads the request later knows it was deliberate.')
	);
	if (!allowed.ok) return allowed;
	const summary = `Skipped ${input.fieldPath}${input.leafId ? ` for ${input.leafId}` : ''} on purpose: ${reason}`;
	return done(
		stamp(
			ctx,
			{
				...request,
				openQuestionKeys: request.openQuestionKeys.filter((k) => k !== key),
				skippedQuestions: [...(request.skippedQuestions ?? []), { key, reason, by: ctx.actor.id, byKind: ctx.actor.kind, at: ctx.at }]
			},
			'draft_change',
			summary
		),
		summary
	);
}

/** Take a skip back: the question is owed again as it was asked (ac-evo-form-question-skip). */
export function unskipQuestionAct(ctx: ActContext, request: EvolutionRequest, input: { readonly fieldPath: string; readonly leafId: string | null }): ActOutcome {
	const key = fieldKey(input.fieldPath, input.leafId);
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'take a skip back'),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not write.', 'Taking a skip back is a write on the request.'),
		guard(skippedQuestionOf(request, key) === null, 'This question is not skipped.', 'Only a skipped question is taken back.')
	);
	if (!allowed.ok) return allowed;
	const summary = `${input.fieldPath}${input.leafId ? ` for ${input.leafId}` : ''}: skip taken back`;
	return done(stamp(ctx, { ...request, skippedQuestions: request.skippedQuestions.filter((q) => q.key !== key) }, 'draft_change', summary), summary);
}

export function answerOpenQuestionAct(
	ctx: ActContext,
	request: EvolutionRequest,
	fieldPath: string,
	leafId: string | null
): ActOutcome {
	const key = fieldKey(fieldPath, leafId);
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'take back an open question'),
		canAnswerOpenQuestion({ canEdit: canEdit(ctx.actor), isOpen: request.openQuestionKeys.includes(key) })
	);
	if (!allowed.ok) return allowed;
	return done(
		{ ...request, openQuestionKeys: request.openQuestionKeys.filter((k) => k !== key) },
		`Took back the open question on ${fieldPath}`
	);
}

/** Post on a field, under the actor's name; a client may post, never rule. */
export function postOnFieldAct(
	ctx: ActContext,
	request: EvolutionRequest,
	fieldPath: string,
	leafId: string | null,
	body: string,
	replyTo: string | null = null,
	exchange: {
		readonly privateTo?: string;
		readonly asks?: boolean;
		readonly choices?: readonly string[];
		readonly multiple?: boolean;
		/** The texts the AI offers in its message, each at its place (ac-evo-live-comment-suggests). */
		readonly writes?: readonly SuggestedWrite[];
	} = {}
): ActOutcome {
	const key = fieldKey(fieldPath, leafId);
	const writes = exchange.writes ?? [];
	const current = latestThread(request, key);
	const startsNew = current === undefined || current.state === 'turned_into_change';
	// A reply answers a message the thread holds; a message of its own answers none (ac-evo-fthread-reply).
	// A private message is answered only by who may read it (ac-evo-live-ask).
	const answers =
		replyTo && current && !startsNew ? current.messages.find((m) => m.id === replyTo && readableBy(m, ctx.actor.id)) : undefined;
	// The exchange with one's AI stays private down its replies until it is published.
	const privateTo = exchange.privateTo ?? answers?.privateTo;
	const asksPerson = !!exchange.asks && ctx.actor.kind === 'ai_client';
	const ownSuggestionWaits = pendingProposals(request).some(
		(p) => fieldKey(p.targetField, leafOf(p)) === key && personKey(p.proposedBy) === personKey(ctx.actor.id)
	);
	const allowed = firstRefusal(
		notFinished(request),
		asksPerson ? threadQuestionAllowed(body, !replyTo, ownSuggestionWaits) : ALLOW,
		asksPerson ? choicesAllowed(exchange.choices ?? [], exchange.multiple) : ALLOW,
		guard(
			!isDossierQuestion(fieldPath),
			`No field is named "${fieldPath}". The fields that carry a thread are ${proposableFieldPaths()}, and the texts of a step of prose (step.<step>.description, step.<step>.<question>).`,
			'The same list comes back as `fieldsAvailable` on the reading you already have.'
		),
		guard(body.trim() === '', 'A message needs a body.', 'An empty message says nothing.'),
		guard(!!replyTo && !answers, 'The message you answer is not in this thread.', 'replyTo names a message of the thread on this field; leave it out for a message of its own.'),
		canPostOnField(ctx.actor, { canComment: true, thread: startsNew ? undefined : current }),
		exchange.writes === undefined
			? ALLOW
			: firstRefusal(
					guard(ctx.actor.kind !== 'ai_client', 'Only an AI offers its text as a suggestion: write it at its place.', 'A person writes the step itself, from its editor.'),
					suggestionAllowed(writes)
				)
	);
	if (!allowed.ok) return allowed;
	const known = new Set(requirementCandidates(request.fieldThreads.flatMap((t) => t.messages).filter((m) => readableBy(m, ctx.actor.id))).map((c) => c.key));
	const freshWrites = writes.flatMap((w) => {
		const fresh = pointsOf(w.value).filter((line) => !known.has(requirementKey(w.fieldPath, line)));
		return fresh.length ? [{ fieldPath: w.fieldPath, value: textOfPoints(fresh) }] : [];
	});
	if (writes.length > 0 && freshWrites.length === 0 && !asksPerson)
		return done(request, 'These requirements are already offered or decided; no duplicate message was added.');

	const message = {
		id: ctx.newId(),
		author: ctx.actor.id,
		authorKind: ctx.actor.kind,
		body: body.trim(),
		postedAt: ctx.at,
		...(answers ? { replyTo: answers.id } : {}),
		...(privateTo ? { privateTo } : {}),
		// Only the AI marks a reply as waiting for the person's answer (ac-evo-live-scope).
		...(asksPerson ? { awaitsAnswer: true as const } : {}),
		// The answers its question offers as buttons, one to click or several to tick (ac-evo-live-choices).
		...(asksPerson && cleanChoices(exchange.choices ?? []).length > 0
			? { choices: cleanChoices(exchange.choices ?? []), ...(exchange.multiple ? { multiple: true as const } : {}) }
			: {}),
		// What it offers to write, decided by a person with Accept or Refuse (ac-evo-live-comment-suggests).
		...(freshWrites.length > 0 ? { suggests: freshWrites } : {})
	};
	return done(
		{
			...request,
			fieldThreads: startsNew
				? [...request.fieldThreads, openThread({ id: ctx.newId(), key, message })]
				: request.fieldThreads.map((t) => (t.id === current.id ? post(t, message) : t))
		},
		`Posted on ${fieldPath}${leafId ? ` for ${leafId}` : ''}${
			writes.length > 0 ? `, suggesting ${writes.length === 1 ? 'one text' : `${writes.length} texts`} the person accepts or refuses there` : ''
		}`
	);
}

/**
 * Decide one requirement in its category (757c9f25). Acceptance appends only
 * that line through the ordinary guarded writer; rejection writes no answer.
 * The source message and per-line decisions survive retries and reloads.
 */
export function decideThreadSuggestionAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly messageId: string; readonly decision: 'accept' | 'refuse'; readonly fieldPath?: string; readonly line?: string }
): ActOutcome {
	const messages = request.fieldThreads.flatMap((t) => t.messages).filter((m) => readableBy(m, ctx.actor.id));
	const message = messages.find((m) => m.id === input.messageId);
	const allowed = firstRefusal(notFinished(request), canDecideSuggestion(ctx.actor, message, input.decision));
	if (!allowed.ok || !message?.suggests) return allowed as Refused;
	const path = input.fieldPath ?? '';
	const line = input.line?.trim() ?? '';
	if (!path || !line) return refuse('Choose one requirement to accept or reject.', 'Each requirement is decided in its category in Solution.');
	const offered = message.suggests.some((w) => w.fieldPath === path && pointsOf(w.value).includes(line));
	if (!offered) return refuse('This requirement is not offered by this message.', 'Read the candidates again; nothing was written.');
	const key = requirementKey(path, line);
	const candidate = requirementCandidates(messages).find((c) => c.key === key);
	if (!candidate || candidate.state !== 'waiting') return refuse('This requirement is already decided.', 'A repeated message does not reopen a decision.');
	const place = suggestionPlaceOf(path);
	if (!place && input.decision === 'accept') return refuse(`No text of a step is named "${path}".`, 'This requirement no longer has a place.');
	let next = request;
	if (input.decision === 'accept' && place) {
		const held = place.kind === 'description'
			? Object.entries(request.stepDescriptions).find(([step]) => step === place.step)?.[1] ?? ''
			: Object.entries(Object.entries(request.stepAnswers).find(([step]) => step === place.step)?.[1] ?? {}).find(([key]) => key === place.key)?.[1] ?? '';
		const value = pointsOf(held).includes(line) ? held : textOfPoints([...pointsOf(held), line]);
		const wrote = place.kind === 'description'
			? updateStepDescriptionAct(ctx, next, { step: place.step, description: value })
			: answerStepAct(ctx, next, { step: place.step, question: place.key, answer: value });
		if (!wrote.ok) return wrote;
		next = wrote.request;
		const thread = next.fieldThreads.find((t) => t.messages.some((m) => m.id === message.id));
		const published = message.privateTo && thread ? publishExchange(next, ctx.actor.id, topicOf(thread.messages, message.id)) : null;
		if (published?.ok) next = published.request;
	}
	const decision = { fieldPath: path, line, state: input.decision === 'accept' ? 'accepted' as const : 'refused' as const, by: ctx.actor.id, at: ctx.at };
	next = { ...next, fieldThreads: next.fieldThreads.map((t) => ({ ...t, messages: t.messages.map((m) => m.id === message.id ? { ...m, requirementDecisions: [...(m.requirementDecisions ?? []), decision] } : m) })) };
	const all = requirementCandidates(next.fieldThreads.flatMap((t) => t.messages).filter((m) => readableBy(m, ctx.actor.id)));
	next = { ...next, fieldThreads: next.fieldThreads.map((t) => ({ ...t, messages: t.messages.map((m) => {
		if (m.id !== message.id) return m;
		const own = (m.suggests ?? []).flatMap((w) => pointsOf(w.value).map((text) => all.find((c) => c.key === requirementKey(w.fieldPath, text))));
		if (own.some((c) => c?.state === 'waiting')) return m;
		return { ...m, suggestion: { state: own.some((c) => c?.state === 'accepted') ? 'accepted' as const : 'refused' as const, by: ctx.actor.id, at: ctx.at } };
	}) })) };
	return done(stamp(ctx, next, 'draft_change', `Requirement ${input.decision === 'accept' ? 'accepted' : 'rejected'}: ${line}`), input.decision === 'accept' ? 'Requirement accepted: written in its place, waiting for validation' : 'Requirement rejected: nothing written');
}

/**
 * Edit a message one sent (ac-evo-fthread-edit): the new text replaces it,
 * marked edited, and the earlier ones stay readable. Only its author edits it,
 * as the same kind of author: a person never edits what their AI client wrote.
 */
export function editMessageAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly messageId: string; readonly body: string }
): ActOutcome {
	const thread = request.fieldThreads.find((t) => t.messages.some((m) => m.id === input.messageId));
	const message = thread?.messages.find((m) => m.id === input.messageId);
	const body = input.body.trim();
	const allowed = firstRefusal(
		notFinished(request),
		guard(!message, 'No message is named so.', 'The ids come back with each thread.'),
		guard(
			!!message && (message.author !== ctx.actor.id || message.authorKind !== ctx.actor.kind),
			'Only its author edits a message.',
			'A person edits what they wrote; an AI client what it wrote.'
		),
		guard(body === '', 'A message needs a body.', 'An empty message says nothing.')
	);
	if (!allowed.ok || !thread || !message) return allowed as Refused;
	if (body === message.body) return done(request, 'The message already says this');
	const edited: FieldThreadMessage = {
		...message,
		body,
		earlier: [...(message.earlier ?? []), { body: message.body, at: message.editedAt ?? message.postedAt }],
		editedAt: ctx.at
	};
	return done(
		{
			...request,
			fieldThreads: request.fieldThreads.map((t) =>
				t.id === thread.id ? { ...t, messages: t.messages.map((m) => (m.id === message.id ? edited : m)) } : t
			)
		},
		`Edited a message on ${thread.key}`
	);
}

/**
 * Validate, resolve or reopen one conversation of a thread, named by any of
 * its messages. A ruling is a person's: the model replies, it never settles a
 * conversation; anyone who may comment rules on it.
 */
export function ruleTopicAct(ctx: ActContext, request: EvolutionRequest, input: { readonly messageId: string; readonly ruling: 'validated' | 'resolved' | 'open' }): ActOutcome {
	const thread = request.fieldThreads.find((t) => t.messages.some((m) => m.id === input.messageId));
	const opener = thread ? topicOpener(thread, input.messageId) : undefined;
	const allowed = firstRefusal(
		notFinished(request),
		guard(!thread || !opener, 'No message is named so.', 'The ids come back with each thread.'),
		guard(ctx.actor.kind === 'ai_client', 'The model replies in a thread; it never rules on it.', "Settling a conversation is a person's act."),
		guard(thread?.state === 'turned_into_change', 'This thread already produced a change.', 'A change is a stronger ending than a ruling.')
	);
	if (!allowed.ok || !thread || !opener) return allowed as Refused;
	if ((opener.ruling?.state ?? 'open') === input.ruling) return done(request, `The conversation is already ${input.ruling}`);
	const next = setTopicRuling(thread, opener.id, input.ruling === 'open' ? null : { state: input.ruling, by: ctx.actor.id, at: ctx.at });
	const said = { validated: 'Validated', resolved: 'Resolved', open: 'Reopened' }[input.ruling];
	return done({ ...request, fieldThreads: request.fieldThreads.map((t) => (t.id === thread.id ? next : t)) }, `${said} a conversation on ${thread.key}`);
}

/* ───────────────────────── Reports (computed, never deposited) ───────────────────────── */

/** The section changes and changes to the rules the walk started from as well, said in the run's answer (ac-evo-draft-section-impact). */
function walkedChanges(request: Pick<EvolutionRequest, 'sectionDrafts' | 'ruleDrafts'>): string {
	const n = liveSectionDrafts(request.sectionDrafts).length + liveRuleDrafts(request.ruleDrafts).length;
	return n > 0 ? `; walked from ${n} change${n === 1 ? '' : 's'} to the other pages of the spec and the rules` : '';
}

export function runImpactAct(
	ctx: ActContext,
	request: EvolutionRequest,
	hypothesis: ImpactHypothesis,
	depth: number,
	findings: readonly ImpactFinding[],
	/** What each draft with a behaviour model does to the solver's proofs. */
	proofImpact?: readonly DraftProofImpact[]
): ActOutcome {
	const allowed = firstRefusal(notFinished(request), canComputePropagation(depth));
	if (!allowed.ok) return allowed;
	const read = withImpactReading(request, hypothesis, Math.min(MAX_IMPACT_DEPTH, depth), findings, ctx.at);
	return done(
		proofImpact ? { ...read, proofImpact: [...proofImpact] } : read,
		`Impact under "${hypothesis}" at depth ${depth}: ${findings.length} node${findings.length === 1 ? '' : 's'} move` +
			(proofImpact?.length ? `; proofs compared for ${proofImpact.length} draft${proofImpact.length === 1 ? '' : 's'}` : '') +
			walkedChanges(request)
	);
}

/** What a partial check says (ac-evo-coh-same-reading). */
export const PARTIAL_READING_KEPT =
	'Coherence not read again: the behaviour verification is still running, so the reading this request holds is kept as it was. Run the check again in a moment.';
export const PARTIAL_READING_FIRST = ' Partial: the behaviour verification is still running, so what the product already carried is taken at the next complete reading.';

/**
 * A fresh coherence reading. `partial` says the behaviour verification the
 * analysis folds in had not answered in time: a request that already holds a
 * reading keeps it unchanged, so a cold cache never moves its score, its delta
 * or what the product already carried (ac-evo-coh-same-reading).
 */
export function runCoherenceAct(
	ctx: ActContext,
	request: EvolutionRequest,
	mapping: CoherenceMapping,
	options: { readonly partial?: boolean } = {}
): ActOutcome {
	const allowed = firstRefusal(notFinished(request), canRunCheck(request, 'whole_project', 'engine'));
	if (!allowed.ok) return allowed;
	if (options.partial && request.coherenceReport.status === 'ready') return done(request, PARTIAL_READING_KEPT);
	const next = withCoherenceReading(request, mapping);
	const published = next.coherenceFindings.filter((f) => f.published);
	const blocking = published.filter(findingHoldsGate).length;
	const inherited = published.filter((f) => f.scope === 'inherited').length;
	const informative = published.length - blocking - inherited;
	return done(
		next,
		`Coherence ${mapping.report.projectScore}/100 (${mapping.report.requestDelta >= 0 ? '+' : ''}${mapping.report.requestDelta}): ${blocking} blocking, ${informative} informative, ${inherited} already in the product before this request${healthLine(mapping.report.health)}${options.partial ? `.${PARTIAL_READING_FIRST}` : ''}`
	);
}

/** Project health now and after the change, in one sentence of the MCP reading (ac-evo-coh-after). */
function healthLine(health: EvolutionRequest['coherenceReport']['health']): string {
	if (!health) return '';
	const { now, after } = health;
	const expected = health.expectedToLeave.length > 0 ? `, ${health.expectedToLeave.length} more expected to leave once the engine reads the landed spec` : '';
	return `. Project health ${now.score} (${now.verdict}, ${now.total} findings) now, ${after.score} (${after.verdict}, ${after.total} findings) after this change: ${health.leaving.length} leave${expected}, ${health.coming.length} come`;
}

export function buildReportAct(
	ctx: ActContext,
	request: EvolutionRequest,
	lines: readonly ImplementationFinding[]
): ActOutcome {
	const allowed = firstRefusal(
		notFinished(request),
		canBuildReport('requirement_crossing'),
		canReceiveReport(request, request.specVersion),
		guard(
			request.stage !== 'implementation',
			'The report is built in Verify.',
			'A report judges what was built against the frozen version; before Verify there is nothing built yet.'
		)
	);
	if (!allowed.ok) return allowed;
	const count = (verdict: ImplementationFinding['verdict']) => lines.filter((l) => l.verdict === verdict).length;
	const summary = `Report for version ${request.specVersion}: ${count('conform')} conform, ${count('non_conform')} non-conform, ${count('missing')} missing, ${count('out_of_scope')} out of scope, ${count('regression')} regression`;
	const derived = withDerivedReport(request, lines, ctx.at);
	// What the Build step's log reads: each reading of the code that moved a line of this request, never a rebuild that moved nothing.
	const read = codeReadSummary(
		request.implementationFindings.filter((l) => l.iteration === request.iteration),
		lines
	);
	return done(read ? stamp(ctx, derived, 'code_read', read) : derived, summary);
}

/**
 * One reading of the code, said the way the Build step counts it: the lines of
 * this request tested, found but not tested yet, and not found, each with how
 * it moved since the reading before. Null when nothing moved.
 */
export function codeReadSummary(before: readonly ImplementationFinding[], after: readonly ImplementationFinding[]): string | null {
	const counts = (lines: readonly ImplementationFinding[]) => {
		const own = lines.filter((l) => l.scope !== 'inherited' && (l.verdict === 'conform' || l.verdict === 'non_conform' || l.verdict === 'missing'));
		return { tested: own.filter((l) => l.verdict === 'conform').length, found: own.filter((l) => l.verdict === 'non_conform').length, missing: own.filter((l) => l.verdict === 'missing').length };
	};
	const was = counts(before);
	const now = counts(after);
	const first = before.length === 0;
	if (!first && was.tested === now.tested && was.found === now.found && was.missing === now.missing) return null;
	const part = (n: number, delta: number, words: string) => `${n} ${words}${first || delta === 0 ? '' : ` (${delta > 0 ? '+' : '−'}${Math.abs(delta)})`}`;
	return `Code read: ${part(now.tested, now.tested - was.tested, 'tested')} · ${part(now.found, now.found - was.found, 'found, not tested yet')} · ${part(now.missing, now.missing - was.missing, 'not found')}`;
}

/* ───────────────────────── Gates ───────────────────────── */

/**
 * The gate a request must pass to enter `target`. `specification` is how much
 * of the Specification a person stands behind, read by the caller (its actions
 * come from the engine's graph): the freeze waits for all of it.
 */
export function gateFor(
	request: EvolutionRequest,
	target: RequestStage,
	criticalEmptyCount: number,
	specification?: SpecificationHold
): Guarded {
	switch (target) {
		case 'coherence':
			// Validating is optional until the build: no step holds the Impact analysis.
			return canLeaveSpecification(request);
		case 'implementation':
			return firstRefusal(
				canCrossToImplementation(request, criticalEmptyCount),
				canLeaveCoherence(request),
				solutionValidated(request),
				specificationGate(specification)
			);
		case 'acceptance':
			return canCloseReport(request);
		case 'delivered':
			return firstRefusal(
				guard(
					acceptanceDebt(request) > 0,
					'An accepted observation has not been written back into the spec yet.',
					'Delivering here would leave the specification describing something other than the product that was accepted.'
				),
				guard(
					!isStepValidated(request, 'approval'),
					'Approval still waits for someone to validate it.',
					'A change is approved by its people, never by the passing of a stage (the stakeholders validate the Approval step).'
				)
			);
		default:
			return ALLOW;
	}
}

/**
 * Cross into the next stage through its gate, or past it with a named waiver.
 * Crossing into Verify freezes the specification under the next version.
 */
export function crossStageAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly criticalEmptyCount: number; readonly waiverReason?: string; readonly specification?: SpecificationHold }
): ActOutcome {
	const target = nextStage(request.stage);
	const allowed = firstRefusal(
		carriesForward(ctx, 'move a request between stages'),
		guard(
			target === null,
			'This request has reached the end of its run.',
			'Delivered is the last stage; closing is a separate act.'
		),
		target ? canAdvance(request, target) : ALLOW
	);
	if (!allowed.ok || !target) return allowed as Refused;
	const gate = gateFor(request, target, input.criticalEmptyCount, input.specification);
	let crossed: EvolutionRequest;
	if (input.waiverReason !== undefined) {
		const waivable = canWaive(ctx.actor, input.waiverReason, gate.ok);
		if (!waivable.ok) return waivable;
		crossed = stamp(
			ctx,
			{
				...request,
				stage: target,
				waivers: [
					...request.waivers,
					{
						id: ctx.newId(),
						stage: target,
						reason: input.waiverReason.trim(),
						grantedBy: ctx.actor.id,
						grantedAt: ctx.at,
						liftedBy: null,
						liftedAt: null
					}
				]
			},
			'waiver',
			said(ctx).waived(input.waiverReason.trim())
		);
	} else {
		if (!gate.ok) return gate;
		crossed = stamp(ctx, { ...request, stage: target }, 'stage_crossing', said(ctx).crossed(target));
	}
	if (target === 'implementation') {
		const frozen = freeze(crossed, ctx.actor, ctx.at);
		crossed = stamp(ctx, frozen, 'spec_frozen', said(ctx).frozen(String(frozen.specVersion)));
	}
	if (target === 'acceptance') {
		crossed = {
			...crossed,
			iterations: crossed.iterations.map((i) =>
				i.number === crossed.iteration ? { ...i, reportStatus: 'closed' } : i
			)
		};
	}
	return done(
		crossed,
		`Crossed into ${target}${target === 'implementation' ? ` (spec frozen as version ${crossed.specVersion})` : ''}`
	);
}

export function liftWaiverAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	const allowed = firstRefusal(notFinished(request), canLiftWaiver(ctx.actor, request));
	if (!allowed.ok) return allowed;
	const standing = openWaiver(request);
	if (!standing) return refuse('This request carries no waiver.', 'Nothing to lift; the card is not marked.');
	return done(
		stamp(
			ctx,
			{
				...request,
				waivers: request.waivers.map((w) =>
					w.id === standing.id ? { ...w, liftedBy: ctx.actor.id, liftedAt: ctx.at } : w
				)
			},
			'waiver',
			said(ctx).waiverLifted
		),
		'Waiver lifted'
	);
}

/** Back to Specify on purpose; a frozen spec is amended and the gate re-closes. */
function rebriefActCore(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	const allowed = firstRefusal(carriesForward(ctx, 'rebrief a request'), canRebrief(request));
	if (!allowed.ok) return allowed;
	const back = stamp(
		ctx,
		{ ...amend(request), stage: 'specification', coherenceGateClosed: true },
		'stage_crossing',
		said(ctx).rebrief
	);
	return done(
		request.frozen
			? stamp(ctx, back, 'spec_amended', said(ctx).amended(String(request.specVersion)))
			: back,
		'Sent back to specification'
	);
}

/* ───────────────────────── Verdicts ───────────────────────── */

export function decideLineAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly lineId?: string; readonly verdict?: ImplementationFinding['verdict']; readonly decision: LineDecision }
): ActOutcome {
	const line = input.lineId ? request.implementationFindings.find((l) => l.id === input.lineId) : undefined;
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'decide a report line'),
		canDecide(request, ctx.actor),
		// Taking a decision back is one line at a time; an adoption already wrote
		// into the spec, so it is undone there, not here.
		guard(
			input.decision === 'undecided' && (!line || line.decision === 'adopted'),
			line ? 'An adoption is undone in the feature it was written into, not on the report.' : 'Undecided is not a decision.',
			'A line is validated, invalidated, adopted or removed; one line can be taken back to undecided.'
		),
		guard(
			input.lineId !== undefined && !line,
			'This line does not exist on the report.',
			'get_evolution lists the lines of the current iteration with their ids.'
		),
		guard(
			input.lineId === undefined && input.verdict === undefined,
			'Name a line or a verdict bucket.',
			'A decision applies to one line, or to every undecided line of one bucket.'
		),
		line && input.decision === 'adopted' ? canAdopt(request, ctx.actor, line) : ALLOW,
		line && input.decision === 'removed' ? canRemove(request, ctx.actor, line) : ALLOW
	);
	if (!allowed.ok) return allowed;
	const decide = (l: ImplementationFinding): ImplementationFinding => ({
		...l,
		decision: input.decision,
		decidedBy: input.decision === 'undecided' ? null : ctx.actor.id,
		decidedAt: input.decision === 'undecided' ? null : ctx.at,
		// Adoption writes the missing criterion into its canonical section, and
		// the line is then re-evaluated as conform.
		verdict: input.decision === 'adopted' ? 'conform' : l.verdict
	});
	const targeted = line
		? request.implementationFindings.map((l) => (l.id === line.id ? decide(l) : l))
		: request.implementationFindings.map((l) =>
				l.iteration === request.iteration && l.verdict === input.verdict && l.decision === 'undecided'
					? decide(l)
					: l
			);
	const summary = line ? `Line ${input.decision}` : `Bucket ${input.verdict} ${input.decision}`;
	const recorded = line ? said(ctx).line(input.decision) : said(ctx).bucket(String(input.verdict), input.decision);
	return done(
		stamp(ctx, { ...request, implementationFindings: targeted }, 'verdict_decision', recorded),
		summary
	);
}

/* ───────────────────────── Acceptance ───────────────────────── */

export function ruleObservationAct(
	ctx: ActContext,
	request: EvolutionRequest,
	observationId: string,
	ruling: Exclude<ObservationRuling, 'open'>,
	reason: string
): ActOutcome {
	const observation = request.observations.find((o) => o.id === observationId);
	if (!observation)
		return refuse('This observation does not exist on the request.', 'get_evolution lists the observations with their ids.');
	const allowed = firstRefusal(
		notFinished(request),
		ruling === 'invalidated' ? canInvalidate(ctx.actor, observation, reason) : canRule(ctx.actor, observation)
	);
	if (!allowed.ok) return allowed;
	return done(
		stamp(
			ctx,
			{
				...request,
				observations: request.observations.map((o) =>
					o.id === observationId ? { ...o, ruling, rulingReason: reason.trim() } : o
				)
			},
			'acceptance_ruling',
			said(ctx).ruled(ruling)
		),
		`Observation ${ruling}`
	);
}

/** Fold a validated observation back into the spec; `write` is the canonical write. */
export function foldBackAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly observationId: string; readonly leafId: string; readonly kind: InjectionKind; readonly text: string },
	write: () => Guarded
): ActOutcome {
	const observation = request.observations.find((o) => o.id === input.observationId);
	if (!observation)
		return refuse('This observation does not exist on the request.', 'get_evolution lists the observations with their ids.');
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'fold an observation back into the spec'),
		canFoldBack(ctx.actor, observation, input.leafId),
		guard(
			observation.foldedBackAt !== null,
			'This observation has already been folded back.',
			'Folding back twice would write the same criterion twice.'
		),
		guard(
			!request.leafIds.includes(input.leafId),
			`The criterion is written on a touched feature: one of ${request.leafIds.join(', ')}.`,
			'A fold-back lands on the feature the observation concerns.'
		),
		guard(
			input.kind !== 'acceptance_criterion',
			'Only an acceptance criterion can be folded back through the API for now; a behaviour rule is authored with apply_behavior_batch, then the observation is folded back as a criterion naming it.',
			'The rule editor lives in the behaviour model.'
		),
		guard(input.text.trim() === '', 'The criterion needs a sentence.', 'An empty criterion tests nothing.')
	);
	if (!allowed.ok) return allowed;
	const written = write();
	if (!written.ok) return written;
	return done(
		stamp(
			ctx,
			{
				...request,
				observations: request.observations.map((o) =>
					o.id === input.observationId
						? {
								...o,
								foldedBackAt: ctx.at,
								foldedBackBy: ctx.actor.id,
								foldedBackKind: input.kind,
								foldedBackLeafId: input.leafId
							}
						: o
				)
			},
			'acceptance_ruling',
			said(ctx).foldedBack(input.leafId)
		),
		`Folded back into ${input.leafId}`
	);
}

export function closeRequestAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	const allowed = firstRefusal(
		carriesForward(ctx, 'close a request'),
		guard(!canEdit(ctx.actor), 'A viewer cannot close an evolution request.', 'Closing is a write on the request.'),
		canCloseRequest(request)
	);
	if (!allowed.ok) return allowed;
	return done(stamp(ctx, { ...request, status: 'closed' }, 'stage_crossing', said(ctx).closed), 'Request closed');
}

/**
 * Cancel a request along the way (ac-evo-req-cancel): a person's decision, with
 * a reason. It leaves the board's columns, stays readable, keeps its stage for a
 * reopening, and what it wrote into the specification stays.
 */
export function cancelRequestAct(ctx: ActContext, request: EvolutionRequest, reason: string): ActOutcome {
	const allowed = firstRefusal(
		personOnly(ctx.actor, 'cancel a request'),
		guard(!canEdit(ctx.actor), 'A viewer cannot cancel an evolution request.', 'Cancelling is a write on the request.'),
		canCancelRequest(request, reason)
	);
	if (!allowed.ok) return allowed;
	const cancellation = { reason: reason.trim(), by: ctx.actor.id, at: ctx.at };
	return done(stamp(ctx, { ...request, status: 'cancelled', cancellation }, 'stage_crossing', said(ctx).cancelled(cancellation.reason)), 'Request cancelled; what it wrote into the specification stays');
}

/** Reopen a cancelled request where it stood; the reason goes to its history. */
export function reopenRequestAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	const allowed = firstRefusal(
		personOnly(ctx.actor, 'reopen a request'),
		guard(!canEdit(ctx.actor), 'A viewer cannot reopen an evolution request.', 'Reopening is a write on the request.'),
		canReopenRequest(request)
	);
	if (!allowed.ok) return allowed;
	const reopened: EvolutionRequest = { ...request, status: 'open' };
	delete reopened.cancellation;
	return done(stamp(ctx, reopened, 'stage_crossing', said(ctx).reopened), `Request reopened at ${request.stage}`);
}

export function deleteRequestAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	const allowed = firstRefusal(
		personOnly(ctx.actor, 'delete a request'),
		guard(!canEdit(ctx.actor), 'A viewer cannot delete an evolution request.', 'Deleting is a write on the request.'),
		canDeleteRequest(request)
	);
	if (!allowed.ok) return allowed;
	return done({ ...request, status: 'deleted' }, 'Request deleted; every field it wrote stays in its section');
}

/** The stage a request is shown in, and the next gate with its verdict. */
export function gateReading(
	request: EvolutionRequest,
	criticalEmptyCount: number,
	specification?: SpecificationHold
): { readonly next: RequestStage | null; readonly verdict: Guarded } {
	const next = nextStage(request.stage);
	return { next, verdict: next ? firstRefusal(canAdvance(request, next), gateFor(request, next, criticalEmptyCount, specification)) : ALLOW };
}

export const stageIndex = (stage: RequestStage): number => STAGE_ORDER.indexOf(stage);

export type { CoherenceFinding };

/*
 * What a request touches (its subjects, their behaviour, its data changes) is
 * read at the Impact analysis, which reads it again on its own: none of it
 * reopens a step of prose, whose validations stand behind its text (ac-evo-req-21).
 */
export function setLeavesAct(...args: Parameters<typeof setLeavesActCore>): ActOutcome {
	return setLeavesActCore(...args);
}
export function addDraftLeafAct(...args: Parameters<typeof addDraftLeafActCore>): ActOutcome {
	return addDraftLeafActCore(...args);
}
export function updateDraftLeafAct(...args: Parameters<typeof updateDraftLeafActCore>): ActOutcome {
	return updateDraftLeafActCore(...args);
}
export function removeDraftLeafAct(...args: Parameters<typeof removeDraftLeafActCore>): ActOutcome {
	return removeDraftLeafActCore(...args);
}
export function setDraftBehaviourModelAct(...args: Parameters<typeof setDraftBehaviourModelActCore>): ActOutcome {
	return setDraftBehaviourModelActCore(...args);
}

/** Rebrief, reopening what the freeze and the approval stood behind (ac-evo-req-21). */
export function rebriefAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	return reopening(rebriefActCore(ctx, request), ['technical_spec', 'approval']);
}

/* ───────────────────────── The path: need, steps, validations, deployment ───────────────────────── */

/** An outcome with the validations of the steps it changed withdrawn. */
function reopening(outcome: ActOutcome, steps: readonly ValidatedStep[]): ActOutcome {
	return outcome.ok ? { ...outcome, request: reopenSteps(outcome.request, steps) } : outcome;
}

const withNeed = (request: EvolutionRequest, key: NeedKey, value: string): EvolutionRequest => ({
	...request,
	need: { ...request.need, [key]: value.trim() }
});

/**
 * The freeze reads that a person stood behind the Solution: validating is
 * optional until the build, and the Solution is the one validation the build
 * waits for (ac-evo-gate-steps). A request with nothing to arbitrate closes
 * itself rather than freezing, and is not held here.
 */
function solutionValidated(request: EvolutionRequest): Guarded {
	if (nothingToArbitrate(request)) return ALLOW;
	return guard(
		!isStepValidated(request, 'solution'),
		'The Solution is not validated yet: a person validates it before the build.',
		'The Need, the Functional spec and the Technical spec may be validated too, but the build waits for the Solution only. The waiver remains the named way through.'
	);
}

/**
 * Answer questions of the need (ac-evo-need-1..3). Typed answers are the
 * author's own; a value an AI client suggests goes through `propose` and is
 * signed like any other (ac-evo-need-4). Any change reopens the Need step.
 */
export function updateNeedAct(
	ctx: ActContext,
	request: EvolutionRequest,
	patch: Partial<Record<NeedKey, string>>
): ActOutcome {
	const keys = NEED_KEYS.filter((key) => typeof patch[key] === 'string');
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'write the need of a request'),
		guard(!canEdit(ctx.actor), 'A viewer cannot write the need of a request.', 'The need is a write on the request.'),
		briefingIsOpen(request),
		guard(
			keys.length === 0,
			`Name at least one question of the need: ${NEED_KEYS.join(', ')}.`,
			'The need holds one answer per question; a value without its question has nowhere to go.'
		)
	);
	if (!allowed.ok) return allowed;
	const changed = keys.filter((key) => (patch[key] ?? '').trim() !== request.need[key]);
	if (changed.length === 0) return done(request, 'The need already says this');
	let next = request;
	for (const key of changed) {
		next = withNeed(next, key, patch[key] ?? '');
		next = withFieldVersion(next, { id: ctx.newId(), key: fieldKey(`00-need.${key}`), value: patch[key] ?? '', actor: ctx.actor, at: ctx.at });
	}
	const answered = changed
		.filter((key) => next.need[key] !== '')
		.map((key) => fieldKey(`00-need.${key}`));
	next = {
		...next,
		openQuestionKeys: next.openQuestionKeys.filter((k) => !answered.includes(k)),
		answeredKeys: [...new Set([...next.answeredKeys, ...answered])]
	};
	const summary = `Need: ${changed.join(', ')} written`;
	const note = glossaryNote(changed.map((key) => next.need[key]).join('\n'), ctx.bannedWords);
	return done(stamp(ctx, reopenSteps(next, ['need']), 'draft_change', summary), `${summary}${note}`);
}

/** Mark a step of specification not applicable, with its reason, or lift the mark (ac-evo-req-16). */
export function markStepNotApplicableAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly step: string; readonly notApplicable: boolean; readonly reason: string }
): ActOutcome {
	const step = input.step;
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'mark a step not applicable'),
		guard(!canEdit(ctx.actor), 'A viewer cannot mark a step not applicable.', 'The mark is a write on the request.'),
		guard(
			!isSkippableStep(step) || (input.notApplicable && !isMarkableStep(step)),
			'Only Functional spec and Technical spec can be marked not applicable.',
			'The Need skips its questions one by one; Solution is what the request changes; Build, Approval and Deployment are the gates it passes.'
		),
		guard(
			input.notApplicable && input.reason.trim() === '',
			'Say why this step does not apply.',
			'The reason is what everyone downstream reads until the mark is lifted.'
		)
	);
	if (!allowed.ok || !isSkippableStep(step)) return allowed as Refused;
	const others = request.skippedSteps.filter((s) => s.step !== step);
	const label = stepLabel(step as SkippableStep);
	if (!input.notApplicable) {
		if (others.length === request.skippedSteps.length) return done(request, `${label} was not marked not applicable`);
		const summary = `${label} applies again`;
		return done(stamp(ctx, { ...request, skippedSteps: others }, 'draft_change', summary), summary);
	}
	const summary = `${label} marked not applicable: ${input.reason.trim()}`;
	return done(
		stamp(
			ctx,
			{ ...request, skippedSteps: [...others, { step, reason: input.reason.trim(), by: ctx.actor.id, at: ctx.at }] },
			'draft_change',
			summary
		),
		summary
	);
}

const isValidatedStepCode = (v: string): v is ValidatedStep =>
	['need', 'solution', 'functional_spec', 'technical_spec', 'approval'].includes(v);

/**
 * Validate a step (ac-evo-req-19, ac-evo-req-20). Anyone with access to the
 * project validates, a viewer excepted, and one validation is enough. Only an
 * AI client reads the roster: alone, it may carry the validation for the single
 * member; from two members up, a person validates.
 */
export function validateStepAct(ctx: ActContext, request: EvolutionRequest, stepInput: string): ActOutcome {
	const current = isValidatedStepCode(stepInput) ? validationOf(request, stepInput) : null;
	const allowed = firstRefusal(
		notFinished(request),
		validates(ctx, 'validate a step'),
		// Approving the delivery is a gate: it stays a person's, delegation or not (ac-evo-llm-delegation-powers).
		guard(stepInput === 'approval' && underDelegation(ctx), 'Approving the delivery stays a person\'s decision.', 'A delegated AI validates what is written; it never crosses a gate.'),
		guard(!canEdit(ctx.actor), 'A viewer cannot validate a step.', 'A validation is a decision on the request.'),
		guard(
			!current,
			'Need, Solution, Functional spec, Technical spec and Approval are validated.',
			'The Impact analysis is read by the platform and leaving it is the decision; Build is judged line by line, and Deployment is declared.'
		),
		guard(
			!!current && current.validations.some((v) => v.by === ctx.actor.id),
			'You already validated this step.',
			'One validation per person; changing what the step holds asks for it again.'
		),
		// A need is validated once it says why: its current situation and its
		// objectives are what the freeze reads, so validating it without them
		// would stand behind a hole.
		guard(
			current?.step === 'need' && needCriticalEmpty(request).length > 0,
			'The need still owes its current situation or its objectives.',
			'Answer them, park them as open questions to discuss, or mark the Need step not applicable with a reason.'
		),
		// A step of prose holds its required texts before anyone stands behind it (ac-evo-sol-prose, ac-evo-func-prose).
		guard(
			current?.step === 'solution' && requiredTextsEmpty(request, 'solution').length > 0,
			'The Solution still owes its description or how we will know it works.',
			'Write them in your own words; the features it touches are read at the Impact analysis.'
		),
		guard(
			current?.step === 'functional_spec' && requiredTextsEmpty(request, 'functional_spec').length > 0,
			'The Functional spec still owes its description or what the product refuses.',
			'Answer them, or mark the Functional spec not applicable with a reason.'
		),
		// Nobody stands behind texts and a drawing that say two things (ac-evo-func-uml-sync).
		guard(!!current && isPairedStep(current.step) && diagramBehindTexts(request, current.step), diagramBehind(current?.step), DIAGRAM_BEHIND_HINT),
		guard(!!current && isPairedStep(current.step) && textsBehindDiagram(request, current.step).length > 0, textBehind(current?.step), TEXT_BEHIND_HINT)
	);
	if (!allowed.ok || !current) return allowed as Refused;
	const next = {
		...current,
		validations: [...current.validations, { by: ctx.actor.id, kind: ctx.actor.kind, at: ctx.at }]
	};
	const after: EvolutionRequest = {
		...request,
		stepValidations: [...request.stepValidations.filter((v) => v.step !== current.step), next]
	};
	const summary = `${stepLabel(current.step)} validated by ${ctx.actor.id}`;
	return done(stamp(ctx, after, 'field_signature', summary), summary);
}

/**
 * Name who validates an answer of the Need or the Solution, or a step validated
 * as a whole (ac-evo-req-named-validators). Once someone is named, every person
 * named is expected, and only them; naming nobody goes back to the default
 * rule. Names change while the answer or the step can still be validated.
 */
export function nameValidatorsAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly target: string; readonly people: readonly string[] }
): ActOutcome {
	const step = stepOfTarget(input.target);
	const people = [...new Set(input.people.map(personKey).filter((p) => p !== ''))];
	const specification = request.stage === 'draft' || request.stage === 'specification';
	const open = step === 'approval' ? request.stage !== 'delivered' : specification;
	const ineligible = people.filter((p) => !ctx.validators?.has(p));
	const allowed = firstRefusal(
		notFinished(request),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not name who validates.', 'Naming decides when an answer stands validated: it belongs to those who validate.'),
		guard(
			step === null,
			'The Impact analysis, the Build and the Deployment are not validated by people: nobody is named on them.',
			'People are named on an answer of the Need or the Solution, or on the Functional spec, the Technical spec or the Approval.'
		),
		guard(!open, 'This can no longer be validated: its version is frozen, or the change is approved.', 'Changing who validates a version already frozen or decided would rewrite a decision taken.'),
		guard(people.length > 0 && ctx.soloWorkspace === true, 'You are alone in the workspace: there is nobody to name.', 'Names left from a larger team can still be cleared.'),
		guard(
			people.length > 0 && ineligible.length > 0,
			'Only members who validate are named: never a viewer, an AI client, nor someone outside the workspace.',
			`Not a member who validates: ${ineligible.join(', ')}.`
		)
	);
	if (!allowed.ok) return allowed;
	const summary =
		people.length > 0
			? `${input.target}: ${people.join(', ')} expected to validate`
			: `${input.target}: nobody named, anyone with access validates`;
	return done(stamp(ctx, withNamed(request, input.target, people), 'field_signature', summary), summary);
}

/**
 * Delegate validation to one's own AI on this request, or take it back
 * (ac-evo-llm-delegation): the person's decision, on the page; what the AI
 * already validated stays.
 */
export function delegateToAiAct(ctx: ActContext, request: EvolutionRequest, on: boolean): ActOutcome {
	const allowed = firstRefusal(notFinished(request), canDelegateToAi(ctx.actor, 'request'));
	if (!allowed.ok) return allowed;
	const summary = on ? `${ctx.actor.id} delegated validation to their AI on this request` : `${ctx.actor.id} took back the validation delegated to their AI`;
	return done(stamp(ctx, { ...request, aiDelegations: withDelegation(request.aiDelegations, ctx.actor.id, on, ctx.at) }, 'draft_change', summary), summary);
}

/** Withdraw one's own validation of a step. */
export function withdrawStepValidationAct(ctx: ActContext, request: EvolutionRequest, stepInput: string): ActOutcome {
	const current = isValidatedStepCode(stepInput) ? validationOf(request, stepInput) : null;
	const allowed = firstRefusal(
		notFinished(request),
		// The client and the person share one id: in a team, only the person takes back their word.
		validates(ctx, 'withdraw a validation'),
		guard(!current || !current.validations.some((v) => v.by === ctx.actor.id), 'You have not validated this step.', 'Only a validation you gave can be withdrawn.'),
		// Under delegation the AI takes back only what it validated itself (ac-evo-llm-delegation-powers).
		guard(
			underDelegation(ctx) && !!current && current.validations.some((v) => v.by === ctx.actor.id && v.kind !== 'ai_client'),
			'Only the person takes back a validation they gave themselves.',
			'A delegated AI takes back the validations it gave, never the person\'s own.'
		)
	);
	if (!allowed.ok || !current) return allowed as Refused;
	const summary = `${stepLabel(current.step)}: validation withdrawn by ${ctx.actor.id}`;
	return done(
		stamp(
			ctx,
			{
				...request,
				stepValidations: request.stepValidations.map((v) =>
					v.step === current.step ? { ...v, validations: v.validations.filter((x) => x.by !== ctx.actor.id) } : v
				)
			},
			'field_signature',
			summary
		),
		summary
	);
}

/**
 * Declare the change live (ac-evo-req-18): the end of the path, which closes
 * the request under the same conditions as closing it.
 */
export function declareDeploymentAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly releaseId?: string | null; readonly note?: string }
): ActOutcome {
	const closed = closeRequestAct(ctx, request);
	if (!closed.ok) {
		return closed.reason === 'Only a delivered request can be closed.'
			? refuse('Only an approved request can be declared deployed.', 'Approval is crossed before the change is declared live.')
			: closed;
	}
	const releaseId = (input.releaseId ?? '').trim() || null;
	const summary = `Declared live${releaseId ? ` in ${releaseId}` : ''}`;
	return done(
		stamp(
			ctx,
			{
				...closed.request,
				deployment: { releaseId, note: (input.note ?? '').trim(), declaredBy: ctx.actor.id, declaredAt: ctx.at }
			},
			'stage_crossing',
			summary
		),
		summary
	);
}


/**
 * Accept a blocking finding as a known risk, or take that acceptance back. The
 * finding stays on the dossier with the reason and the name; it no longer holds
 * the gate. This is the third way the gate names besides fixing and waiving, and
 * the narrow one: it covers ONE finding, where a waiver crosses the whole gate.
 */
export function decideFindingAct(
	ctx: ActContext,
	request: EvolutionRequest,
	findingId: string,
	decision: 'accept_risk' | 'reopen',
	reason: string
): ActOutcome {
	const finding = request.coherenceFindings.find((f) => f.id === findingId || (findingId.length >= 4 && f.id.startsWith(findingId)));
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'accept a risk on behalf of the team'),
		guard(!canEdit(ctx.actor), 'A viewer cannot decide a finding.', 'Deciding a finding changes what holds the request.'),
		guard(!finding, 'This finding does not exist on the request.', 'get_evolution lists the coherence findings with their ids.'),
		guard(
			decision === 'accept_risk' && reason.trim() === '',
			'Accepting a risk needs a stated reason.',
			'An accepted risk without a reason is indistinguishable from an oversight.'
		)
	);
	if (!allowed.ok || !finding) return allowed as ActOutcome;
	const risk = decision === 'accept_risk' ? { by: ctx.actor.id, at: ctx.at, reason: reason.trim() } : null;
	const summary =
		decision === 'accept_risk'
			? `Accepted as a risk: ${finding.title} (${reason.trim()})`
			: `Risk taken back: ${finding.title}`;
	return done(
		stamp(
			ctx,
			{
				...request,
				coherenceFindings: request.coherenceFindings.map((f) => (f.id === finding.id ? { ...f, risk } : f))
			},
			'risk_decision',
			summary
		),
		summary
	);
}

/**
 * Log what a person saw walking the change (Approval). It is a person's
 * remark: a client relays one only as that person (`as_person`). It is ruled
 * next, and a validated one is written back into the spec.
 */
export function logObservationAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { body: string; type?: ObservationType; target?: WalkthroughTarget }
): ActOutcome {
	const observation = createObservation({
		id: ctx.newId(),
		body: input.body.trim(),
		type: input.type ?? 'defect',
		target: input.target ?? 'prototype',
		status: 'logged'
	});
	const allowed = firstRefusal(
		notFinished(request),
		personOnly(ctx.actor, 'log an observation: it is what a person saw'),
		guard(!canEdit(ctx.actor), 'A viewer cannot log an observation.', 'Logging a remark asks for a ruling.'),
		guard(
			request.stage !== 'acceptance',
			'Observations are logged at Approval, once the build is accepted.',
			'Before Approval there is no built change to walk.'
		),
		canLogObservation(observation)
	);
	if (!allowed.ok) return allowed as Refused;
	const summary = `Observation logged: ${observation.body.slice(0, 80)}`;
	return done(stamp(ctx, { ...request, observations: [...request.observations, observation] }, 'acceptance_ruling', summary), summary);
}

/**
 * Write the free description a step opens on (ac-evo-form-step-description).
 * The Need keeps its own, written through `update_need`. Like any write on a
 * step, it withdraws the step's validations and keeps a version.
 */
export function updateStepDescriptionAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly step: string; readonly description: string }
): ActOutcome {
	const step = input.step;
	const allowed = firstRefusal(
		notFinished(request),
		writesStepText(ctx),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not write.', 'A description is a write on the request.'),
		guard(
			!isDescribedStep(step),
			'Solution, Functional spec and Technical spec open on a description; the Need keeps its own (update_need).',
			'Build, Approval and Deployment have none: the code, the remarks and the release stand for it.'
		),
		draftsAreOpen(request),
		guard(isPairedStep(step) && textsBehindDiagram(request, step).includes('description'), textBehind(step), TEXT_BEHIND_HINT)
	);
	if (!allowed.ok || !isDescribedStep(step)) return allowed as Refused;
	const description = input.description.trim();
	if (description === request.stepDescriptions[step]) return done(request, `${stepLabel(step)} already says this`);
	const next = withFieldVersion(
		{ ...request, stepDescriptions: { ...request.stepDescriptions, [step]: description } },
		{ id: ctx.newId(), key: stepDescriptionKey(step), value: description, actor: ctx.actor, at: ctx.at }
	);
	const summary = `${stepLabel(step)}: description written`;
	return done(
		stamp(ctx, reopenSteps(next, [step]), 'draft_change', summary),
		`${summary}${glossaryNote(description, ctx.bannedWords)}`
	);
}

/**
 * Take back the verdict one gave on an answer, a validation (an accepted
 * proposal included) or a refusal (ac-evo-hist-verdict-withdraw): the answer
 * keeps its value and reads as it did before; the Need or the Solution no
 * longer stands validated if it stood on it. The history keeps both acts.
 */
export function withdrawFieldVerdictAct(ctx: ActContext, request: EvolutionRequest, input: { readonly key: string }): ActOutcome {
	const latest = latestVersion(request, input.key);
	const actionVerdicts = isActionReviewKey(input.key) ? request.fieldValidations.filter((v) => v.key === input.key).reverse() : [];
	// Approvals given under the earlier contract settled preceding refusals.
	// Keep that history; a new refusal epoch ends only with explicit Restore.
	const settledAt = actionVerdicts.findIndex((v) => v.verdict !== 'refused');
	const standingRefusals = settledAt < 0 ? actionVerdicts : actionVerdicts.slice(0, settledAt);
	const mine = standingRefusals.find((v) => v.by === ctx.actor.id)
		?? (latest ? [...request.fieldValidations].reverse().find((v) => v.key === input.key && v.versionId === latest.id && v.by === ctx.actor.id) : undefined);
	const allowed = firstRefusal(
		notFinished(request),
		validates(ctx, 'take back a verdict'),
		guard(!mine, 'You gave no verdict on this answer.', 'One takes back one\'s own validation or refusal, never someone else\'s.'),
		// The AI and its person share one id: under delegation it takes back only what it validated itself.
		guard(underDelegation(ctx) && !!mine && !mine.delegated, 'Only the person takes back a verdict they gave themselves.', 'A delegated AI takes back the validations it gave, never the person\'s own.')
	);
	if (!allowed.ok || !mine) return allowed as Refused;
	const step: ValidatedStep | null = input.key.startsWith('00-need.') ? 'need' : input.key.startsWith('step.solution.') ? 'solution' : null;
	const without = { ...request, fieldValidations: request.fieldValidations.filter((v) => v !== mine) };
	const summary = `${input.key}: ${mine.verdict === 'refused' ? 'refusal' : 'validation'} taken back by ${ctx.actor.id}`;
	return done(stamp(ctx, step ? reopenSteps(without, [step]) : without, 'field_signature', summary), summary);
}

/**
 * Refuse the answer a field holds now, with a reason (ac-evo-form-question-acts,
 * ac-evo-hist-field-validation). The refusal stands on this version: the field
 * reads refused and owed until it is rewritten, or until someone validates it
 * after the refusal. A validated answer is rewritten, never refused.
 */
export function refuseFieldAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly key: string; readonly liveValue: string; readonly reason: string }
): ActOutcome {
	const latest = latestVersion(request, input.key);
	const live = input.liveValue.trim();
	const reason = input.reason.trim();
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'refuse an answer'),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not refuse.', 'A refusal is a decision on the request.'),
		guard(!latest && live === '', 'This field holds no value yet.', 'There is nothing to refuse before a first value.'),
		guard(fieldValidationOf(request, input.key).status === 'validated', 'This answer is validated: rewrite it to reopen it.', 'Members already stand behind this version.'),
		guard(reason === '', 'Say why the answer is refused.', 'The reason is what lets it be rewritten.')
	);
	if (!allowed.ok) return allowed;
	// Changed outside the dossier, or never versioned: the value found is the one refused.
	const versioned =
		!latest || (live !== '' && live !== latest.value)
			? withFieldVersion(request, { id: ctx.newId(), key: input.key, value: live, actor: ctx.actor, at: ctx.at, earlier: true })
			: request;
	const version = latestVersion(versioned, input.key);
	if (!version) return refuse('This field holds no value yet.', 'There is nothing to refuse before a first value.');
	const summary = `${input.key}: version ${fieldValidationOf(versioned, input.key).versionCount} refused by ${ctx.actor.id}: ${reason}`;
	return done(
		stamp(
			ctx,
			{
				...versioned,
				fieldValidations: [
					...versioned.fieldValidations,
					{ key: input.key, versionId: version.id, by: ctx.actor.id, byKind: ctx.actor.kind, at: ctx.at, verdict: 'refused', reason }
				]
			},
			'field_signature',
			summary
		),
		summary
	);
}

/**
 * Answer a question a step asks after its description (ac-evo-func-prose): the
 * person's words, verbatim, versioned like the description. Like any change to
 * what the step holds, it withdraws the step's validations.
 */
export function answerStepAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly step: string; readonly question: string; readonly answer: string }
): ActOutcome {
	const asked = stepQuestionOf(input.step, input.question);
	const allowed = firstRefusal(
		notFinished(request),
		writesStepText(ctx),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not write.', 'An answer is a write on the request.'),
		guard(
			!asked,
			`"${input.step}" asks no question "${input.question}".`,
			`The questions are: ${STEP_QUESTIONS.map((q) => `${q.step} ${q.key} (${q.question}${q.required ? ', required' : ''})`).join('; ')}.`
		),
		draftsAreOpen(request),
		guard(!!asked && isPairedStep(asked.step) && textsBehindDiagram(request, asked.step).includes(asked.key), textBehind(asked?.step), TEXT_BEHIND_HINT)
	);
	if (!allowed.ok || !asked) return allowed as Refused;
	const answer = input.answer.trim();
	if (answer === (request.stepAnswers[asked.step][asked.key] ?? '')) return done(request, `${asked.label} already says this`);
	const answered = withFieldVersion(
		{ ...request, stepAnswers: { ...request.stepAnswers, [asked.step]: { ...request.stepAnswers[asked.step], [asked.key]: answer } } },
		{ id: ctx.newId(), key: stepAnswerKey(asked.step, asked.key), value: answer, actor: ctx.actor, at: ctx.at }
	);
	// The diagram edited is the source: it writes no text, and the texts it changed fall behind it (ac-evo-func-uml-sync, ac-evo-tech-uml-sync).
	const isDiagram = asked.key === FUNCTIONAL_DIAGRAM_KEY && isPairedStep(asked.step);
	const next = isDiagram ? withDiagramAsSource(ctx, request, answered, asked.step as PairedStep, answer) : null;
	const behind = next ? textsBehindDiagram(next, asked.step as PairedStep).length : 0;
	const summary = next
		? `${stepLabel(asked.step)}: diagram saved${behind > 0 ? `, ${behind === 1 ? 'one text' : `${behind} texts`} to update from it` : ''}`
		: `${stepLabel(asked.step)}: ${asked.label.toLowerCase()} answered`;
	// The glossary reads the diagram's words, never its keywords (ac-evo-func-uml-text).
	const words = isDiagram ? diagramWordsOf(asked.step as PairedStep, answer) : answer;
	return done(stamp(ctx, reopenSteps(next ?? answered, [asked.step]), 'draft_change', summary), `${summary}${glossaryNote(words, ctx.bannedWords)}`);
}

const diagramBehind = (step: string | undefined) =>
	`The diagram is behind the texts of the ${step === 'technical_spec' ? 'Technical' : 'Functional'} spec: it is being redrawn from them.`;
/** The step of a text the diagram moved past, as a list of one, or none. */
function textBehindOf(request: EvolutionRequest, field: string): readonly PairedStep[] {
	const text = pairedTextOf(field);
	return text && textsBehindDiagram(request, text.step).includes(text.key) ? [text.step] : [];
}
const DIAGRAM_STEPS_FIELDS: readonly (readonly [PairedStep, string])[] = [
	['functional_spec', diagramFieldOf('functional_spec')],
	['technical_spec', diagramFieldOf('technical_spec')]
];
const diagramWordsOf = (step: PairedStep, notation: string) =>
	step === 'technical_spec' ? technicalDiagramWords(notation) : functionalDiagramWords(notation);
const DIAGRAM_BEHIND_HINT =
	'Wait for the AI assistant to redraw it (redraw_diagram), or edit the diagram (answer_step, question diagram), which leaves the texts it changes behind it.';
const textBehind = (step: string | undefined) =>
	`A text of the ${step === 'technical_spec' ? 'Technical' : 'Functional'} spec is behind its diagram: it is being updated from it.`;
const TEXT_BEHIND_HINT =
	'The diagram changed what it says: it is rewritten from the diagram (write_text_from_diagram {step, question, answer}), by the built-in assistant or your own AI, never by hand. get_evolution lists them under textsBehind.';

/**
 * The diagram edited is the source (ac-evo-func-uml-sync, ac-evo-tech-uml-sync):
 * it writes no text and follows the texts as they stand, and each text whose
 * part of it changed falls behind it, to be rewritten from it. A notation that
 * draws nothing leaves the texts as they are.
 */
function withDiagramAsSource(ctx: ActContext, before: EvolutionRequest, edited: EvolutionRequest, step: PairedStep, notation: string): EvolutionRequest {
	const drawsNothing = step === 'technical_spec' ? isEmptyTechnicalDiagram(readTechnicalDiagram(notation).diagram) : isEmptyDiagram(readFunctionalDiagram(notation).diagram);
	if (drawsNothing) return edited;
	const aligned =
		step === 'functional_spec'
			? { diagramAlignment: { ...functionalTexts(edited), at: ctx.at } }
			: { technicalAlignment: { description: edited.stepDescriptions.technical_spec, at: ctx.at } };
	return { ...edited, ...aligned, textAlignment: textAlignmentAfterEdit(before, step, notation, ctx.at) };
}

/**
 * Redraw the diagram from the texts as they stand (ac-evo-func-uml-sync): the
 * AI assistant's act, since reading free prose takes a language model the
 * platform does not have. It catches the diagram up and rewrites no text.
 */
export function redrawDiagramAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly diagram: string; readonly step?: string }
): ActOutcome {
	const diagram = input.diagram.trim();
	const step: PairedStep = input.step === 'technical_spec' ? 'technical_spec' : 'functional_spec';
	// A translation of the texts, nobody's decision: open to the AI client in any workspace, validated by people after.
	const allowed = firstRefusal(
		notFinished(request),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not write.', 'A redraw is a write on the request.'),
		draftsAreOpen(request),
		guard(
			input.step !== undefined && input.step !== '' && !isPairedStep(input.step),
			`"${input.step}" holds no diagram.`,
			'The Functional spec (functional_spec) and the Technical spec (technical_spec) hold one.'
		),
		guard(
			!diagramBehindTexts(request, step),
			'The diagram already follows the texts: edit it instead.',
			`answer_step {step: "${step}", question: "diagram", answer} edits it, and the texts it changes fall behind it.`
		),
		// A redraw from a text the diagram moved past would undo what the diagram said of it.
		guard(textsBehindDiagram(request, step).length > 0, textBehind(step), 'Update it from the diagram first (write_text_from_diagram), then redraw the diagram from the texts.'),
		guard(diagram === '', 'A redraw needs the diagram, in its notation.', 'Send the whole notation of the step.')
	);
	if (!allowed.ok) return allowed;
	const aligned = {
		...(step === 'functional_spec'
			? { diagramAlignment: { ...functionalTexts(request), at: ctx.at } }
			: { technicalAlignment: { description: request.stepDescriptions.technical_spec, at: ctx.at } }),
		textAlignment: textAlignmentWithout(request, pairedTextFields(step))
	};
	const redrawn = withFieldVersion(
		{ ...request, stepAnswers: { ...request.stepAnswers, [step]: { ...request.stepAnswers[step], [FUNCTIONAL_DIAGRAM_KEY]: diagram } }, ...aligned },
		{ id: ctx.newId(), key: diagramFieldOf(step), value: diagram, actor: ctx.actor, at: ctx.at }
	);
	const summary = `${stepLabel(step)}: diagram redrawn from its texts`;
	return done(stamp(ctx, reopenSteps(redrawn, [step]), 'draft_change', summary), `${summary}${glossaryNote(diagramWordsOf(step, diagram), ctx.bannedWords)}`);
}

const TEXT_NAMES: Readonly<Record<string, string>> = { description: 'description', refusals: 'what the product refuses', failures: 'what goes wrong' };

/**
 * Rewrite a text the diagram moved past, from the diagram (ac-evo-func-uml-sync,
 * ac-evo-diagram-assistant): the act of the person's AI client, or of the
 * built-in assistant at the person's request, since writing prose takes a
 * language model the platform does not have. The text is a new version said to
 * be written from the diagram, back in step with it, and the diagram stays in
 * step with the texts.
 */
export function writeTextFromDiagramAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly step?: string; readonly question: string; readonly answer: string }
): ActOutcome {
	const step: PairedStep = input.step === 'technical_spec' ? 'technical_spec' : 'functional_spec';
	const key = input.question.trim();
	const field = pairedTextField(step, key);
	const answer = input.answer.trim();
	const said = field ? (diagramPartOfTexts(step, request.stepAnswers[step][FUNCTIONAL_DIAGRAM_KEY] ?? '')[key] ?? '') : '';
	const allowed = firstRefusal(
		notFinished(request),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not write.', 'A text is a write on the request.'),
		draftsAreOpen(request),
		guard(
			input.step !== undefined && input.step !== '' && !isPairedStep(input.step),
			`"${input.step}" holds no diagram.`,
			'The Functional spec (functional_spec) and the Technical spec (technical_spec) hold one.'
		),
		guard(
			!field,
			`"${key}" is not a text the diagram is paired with.`,
			step === 'technical_spec' ? 'The Technical spec pairs its diagram with its description.' : 'The Functional spec pairs its diagram with description, refusals and failures.'
		),
		guard(
			!!field && !textsBehindDiagram(request, step).includes(key),
			'This text already says what the diagram says: there is nothing to update.',
			'Only a text the diagram changed is rewritten from it; get_evolution lists them under textsBehind.'
		),
		guard(
			answer === '' && said.trim() !== '',
			'The text is empty.',
			"Write it in prose from the diagram, in the spec's language, keeping the person's words wherever the diagram still says them."
		)
	);
	if (!allowed.ok || !field) return allowed as Refused;
	const written: EvolutionRequest =
		key === 'description'
			? { ...request, stepDescriptions: { ...request.stepDescriptions, [step]: answer } }
			: { ...request, stepAnswers: { ...request.stepAnswers, [step]: { ...request.stepAnswers[step], [key]: answer } } };
	const aligned =
		step === 'functional_spec'
			? { diagramAlignment: { ...(request.diagramAlignment ?? { ...functionalTexts(request), at: ctx.at }), [key]: answer, at: ctx.at } }
			: { technicalAlignment: { description: answer, at: ctx.at } };
	const next = withFieldVersion(
		{ ...written, ...aligned, textAlignment: textAlignmentWithout(request, [field]) },
		{ id: ctx.newId(), key: field, value: answer, actor: ctx.actor, at: ctx.at, fromDiagram: true }
	);
	const summary = `${stepLabel(step)}: ${TEXT_NAMES[key] ?? key} written from the diagram`;
	return done(stamp(ctx, reopenSteps(next, [step]), 'draft_change', summary), `${summary}${glossaryNote(answer, ctx.bannedWords)}`);
}

/**
 * Stand behind the value a field holds now (ac-evo-hist-field-validation).
 * `liveValue` is what the owning section holds: a value the dossier never
 * versioned is recorded first, as found there, so the validation names what it
 * stood behind.
 */
export function validateFieldAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly key: string; readonly liveValue: string }
): ActOutcome {
	const latest = latestVersion(request, input.key);
	const live = input.liveValue.trim();
	const allowed = firstRefusal(
		notFinished(request),
		validates(ctx, 'validate a field'),
		guard(isActionReviewKey(input.key) && fieldValidationOf(request, input.key).refusal !== null, 'Restore this rejected action before validating it.', 'An action exclusion survives a rewrite until its author explicitly restores it.'),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not validate.', 'A validation is a decision on the request.'),
		guard(!latest && live === '', 'This field holds no value yet.', 'There is nothing to stand behind before a first value.'),
		// A diagram behind its texts says something else than them (ac-evo-func-uml-sync).
		...DIAGRAM_STEPS_FIELDS.filter(([step, field]) => input.key === field && diagramBehindTexts(request, step)).map(([step]) =>
			guard(true, diagramBehind(step), DIAGRAM_BEHIND_HINT)
		),
		...textBehindOf(request, input.key).map((step) => guard(true, textBehind(step), TEXT_BEHIND_HINT))
	);
	if (!allowed.ok) return allowed;
	// Changed outside the dossier, or never versioned: the value found is the one validated.
	const versioned =
		!latest || (live !== '' && live !== latest.value)
			? withFieldVersion(request, { id: ctx.newId(), key: input.key, value: live, actor: ctx.actor, at: ctx.at, earlier: true })
			: request;
	const version = latestVersion(versioned, input.key);
	if (!version) return refuse('This field holds no value yet.', 'There is nothing to stand behind before a first value.');
	const reading = fieldValidationOf(versioned, input.key);
	if (reading.validations.some((v) => v.by === ctx.actor.id)) return done(versioned, 'You already validated this version');
	const summary = `${input.key}: version ${reading.versionCount} validated by ${ctx.actor.id}`;
	return done(
		stamp(
			ctx,
			{
				...versioned,
				fieldValidations: [
					...versioned.fieldValidations,
					{ key: input.key, versionId: version.id, by: ctx.actor.id, byKind: ctx.actor.kind, at: ctx.at, ...(underDelegation(ctx) ? { delegated: true as const } : {}) }
				]
			},
			'field_signature',
			summary
		),
		summary
	);
}

/**
 * Ask a question of this request in particular (ac-evo-coach-custom-1, -2):
 * the AI client, or a person, after reading it. Five may be open per step.
 */
export function askQuestionAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly step: string; readonly question: string; readonly why: string; readonly fieldKey: string | null }
): ActOutcome {
	const question = input.question.trim();
	const allowed = firstRefusal(
		notFinished(request),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not ask the questions a request owes.', 'Comment on the field instead: a thread is open to everyone.'),
		guard(
			!isValidatedStep(input.step),
			'A question is asked on Need, Solution, Functional spec, Technical spec or Approval.',
			'Build is judged line by line, and Deployment is declared.'
		),
		guard(question === '', 'A question needs its text.', 'Ask it the way the person will read it, in the project language.'),
		guard(input.why.trim() === '', 'Say why the request needs it answered.', 'The reason is what makes a person answer rather than skip.'),
		guard(
			openCustomQuestions(request, input.step).length >= MAX_OPEN_CUSTOM_QUESTIONS,
			`This step already holds ${MAX_OPEN_CUSTOM_QUESTIONS} open questions: answer or set one aside first.`,
			'Five open questions is a conversation; more is an interrogation.'
		)
	);
	if (!allowed.ok) return allowed;
	const id = ctx.newId();
	const summary = `Asked on ${stepLabel(input.step as ValidatedStep)}: ${question}`;
	return done(
		stamp(
			ctx,
			{
				...request,
				customQuestions: [
					...request.customQuestions,
					{
						id,
						step: input.step,
						fieldKey: input.fieldKey && input.fieldKey.trim() !== '' ? input.fieldKey.trim() : null,
						question,
						why: input.why.trim(),
						askedBy: ctx.actor.id,
						askedByKind: ctx.actor.kind,
						askedAt: ctx.at,
						status: 'open',
						resolution: '',
						resolvedBy: null,
						resolvedAt: null
					}
				]
			},
			'draft_change',
			summary
		),
		`${summary} (question ${id})`
	);
}

/**
 * Answer a custom question, or set it aside with a reason
 * (ac-evo-coach-custom-1, -3). An answer is a fact, never a value of the
 * specification: the client turns it into a proposal.
 */
export function resolveQuestionAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly questionId: string; readonly resolution: 'answered' | 'set_aside'; readonly text: string }
): ActOutcome {
	const question = request.customQuestions.find((q) => q.id === input.questionId);
	const text = input.text.trim();
	const answering = input.resolution === 'answered';
	const allowed = firstRefusal(
		notFinished(request),
		guard(!question, 'This question does not exist on the request.', 'get_evolution lists the questions asked of it with their ids.'),
		carriesForward(ctx, answering ? 'answer a question in a person\'s place' : 'set a question aside'),
		guard(!canEdit(ctx.actor), `A viewer reads and comments, but does not ${answering ? 'answer' : 'set a question aside'}.`, 'Comment on the field instead.'),
		guard(!!question && question.status !== 'open', 'This question is already answered or set aside.', 'Ask a new one if something is still unclear.'),
		guard(text === '', answering ? 'An answer needs its text.' : 'Say why the question does not apply.', 'The text is what the next reader relies on.')
	);
	if (!allowed.ok || !question) return allowed as Refused;
	const summary = answering ? `Answered: ${question.question}` : `Set aside: ${question.question} (${text})`;
	return done(
		stamp(
			ctx,
			{
				...request,
				customQuestions: request.customQuestions.map((q) =>
					q.id === question.id
						? { ...q, status: input.resolution, resolution: text, resolvedBy: ctx.actor.id, resolvedAt: ctx.at }
						: q
				)
			},
			'draft_change',
			summary
		),
		`${summary}${answering ? glossaryNote(text, ctx.bannedWords) : ''}`
	);
}

/**
 * A value typed on a field of the dossier (ac-evo-req-26: the page writes
 * through the same operations as an AI client). The value itself is written by
 * the caller who holds the features section, on the feature's amendment while
 * the change is not official; the request keeps the version, counts the
 * answer as its own and asks Solution again.
 */
export function answerFieldAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: { readonly fieldPath: string; readonly leafId: string | null; readonly value: string }
): ActOutcome {
	const field = blockFieldByPath(input.fieldPath);
	const allowed = firstRefusal(
		notFinished(request),
		carriesForward(ctx, 'answer a field in a person\'s place'),
		guard(!canEdit(ctx.actor), 'A viewer reads and comments, but does not write.', 'An answer is a write on the request.'),
		guard(
			!field || field.editor !== 'inline' || !input.leafId,
			`"${input.fieldPath}" is not a field answered on a touched feature.`,
			`The fields a request asks of its features are: ${proposableFieldPaths()}. The need is written with update_need.`
		)
	);
	if (!allowed.ok || !field) return allowed as Refused;
	const key = fieldKey(input.fieldPath, input.leafId);
	const next = withFieldVersion(request, { id: ctx.newId(), key, value: input.value, actor: ctx.actor, at: ctx.at });
	const answered = holdsValue(field, input.value);
	const summary = `${field.label} answered${input.leafId ? ` for ${input.leafId}` : ''}`;
	return done(
		reopenSteps(
			{
				...next,
				openQuestionKeys: answered ? next.openQuestionKeys.filter((k) => k !== key) : next.openQuestionKeys,
				answeredKeys: next.answeredKeys.includes(key) ? next.answeredKeys : [...next.answeredKeys, key]
			},
			['solution']
		),
		`${summary}${glossaryNote(input.value, ctx.bannedWords)}`
	);
}

/* ───────────────────────── Data changes (ac-evo-draft-data) ───────────────────────── */

export interface DataFieldInput {
	readonly name: string;
	readonly type?: string;
	readonly required?: boolean;
	readonly list?: boolean;
	readonly relationTo?: string | null;
}

export interface DataDraftInput {
	readonly kind?: DataDraftKind;
	readonly entityId?: string | null;
	readonly name?: string;
	readonly description?: string;
	readonly addFields?: readonly DataFieldInput[];
	readonly changeFields?: readonly DataFieldChange[];
	readonly removeFields?: readonly string[];
}

/** Every field a data change sends, checked against the model and the request's own new tables. */
function dataFieldsAllowed(
	request: EvolutionRequest,
	model: DataModelLike,
	entityId: string | null,
	input: DataDraftInput,
	selfId: string | null
): Guarded {
	const tables = new Set([...model.entities.map((e) => e.id), ...request.dataDrafts.filter((d) => d.kind === 'add').map((d) => d.id), ...(selfId ? [selfId] : [])]);
	const own = new Set(entityId ? model.fields.filter((f) => f.entityId === entityId).map((f) => f.id) : []);
	const added = input.addFields ?? [];
	const badType = added.find((f) => f.type !== undefined && !isDataFieldType(f.type));
	const unnamed = added.find((f) => f.name.trim() === '');
	const badTarget = [...added, ...(input.changeFields ?? [])].find(
		(f) => 'relationTo' in f && f.relationTo && !tables.has(f.relationTo)
	);
	const foreign = [...(input.removeFields ?? []), ...(input.changeFields ?? []).map((c) => c.fieldId)].find((id) => !own.has(id));
	return firstRefusal(
		guard(!!unnamed, 'A field needs a name.', 'Name every field the change adds.'),
		guard(!!badType, `"${badType?.type}" is not a field type.`, `The types are: ${DATA_FIELD_TYPES.join(', ')}.`),
		guard(!!badTarget, `"${badTarget && 'relationTo' in badTarget ? badTarget.relationTo : ''}" is not a table.`, 'A relation points at an existing table, by its id, or at a table this request adds, by its data draft id.'),
		guard(!!foreign, `Field "${foreign}" does not belong to this table.`, 'A data change removes or changes the fields of the table it amends only.')
	);
}

const fieldsOf = (ctx: ActContext, input: readonly DataFieldInput[]): DataFieldDraft[] =>
	input.map((f) => ({
		id: ctx.newId(),
		name: f.name.trim(),
		type: isDataFieldType(f.type) ? f.type : 'string',
		required: f.required === true,
		list: f.list === true,
		relationTo: f.relationTo ?? null
	}));

function addDataDraftActCore(ctx: ActContext, request: EvolutionRequest, input: DataDraftInput, model: DataModelLike): ActOutcome {
	const kind: DataDraftKind = input.kind ?? 'add';
	const entityId = kind === 'add' ? null : (input.entityId ?? null);
	const name = (input.name ?? '').trim();
	const id = `${DATA_DRAFT_PREFIX}${ctx.newId()}`;
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		guard(kind === 'add' && name === '', 'A new table needs a name.', 'Name the table the change adds.'),
		guard(kind !== 'add' && (!entityId || !model.entities.some((e) => e.id === entityId)), `Table "${entityId ?? ''}" does not exist.`, 'Amend or remove an existing table, by its id; get_section data lists them.'),
		guard(
			kind !== 'add' && request.dataDrafts.some((d) => d.entityId === entityId && d.materialisedAt === null),
			'This request already carries a change for that table.',
			'One table moves one way per request: update that data change instead.'
		),
		kind === 'remove' ? ALLOW : dataFieldsAllowed(request, model, entityId, input, kind === 'add' ? id : null)
	);
	if (!allowed.ok) return allowed;
	const draft: DataDraft = {
		id,
		kind,
		entityId,
		name,
		description: (input.description ?? '').trim(),
		addFields: kind === 'remove' ? [] : fieldsOf(ctx, input.addFields ?? []),
		changeFields: kind === 'amend' ? [...(input.changeFields ?? [])] : [],
		removeFields: kind === 'amend' ? [...new Set(input.removeFields ?? [])] : [],
		materialisedAs: null,
		materialisedAt: null
	};
	const label = kind === 'add' ? `add table "${name}"` : `${kind} table "${model.entities.find((e) => e.id === entityId)?.name ?? entityId}"`;
	return done(stamp(ctx, { ...request, dataDrafts: [...request.dataDrafts, draft] }, 'draft_change', `Data change drafted: ${label}`), `Data change drafted: ${label} (${id})`);
}

function updateDataDraftActCore(ctx: ActContext, request: EvolutionRequest, dataDraftId: string, input: DataDraftInput, model: DataModelLike): ActOutcome {
	const current = request.dataDrafts.find((d) => d.id === dataDraftId);
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		guard(!current, `No data change "${dataDraftId}" on this request.`, 'get_evolution lists the data changes of a request.'),
		current && current.kind !== 'remove' ? dataFieldsAllowed(request, model, current.entityId, input, current.kind === 'add' ? current.id : null) : ALLOW
	);
	if (!allowed.ok || !current) return allowed as Refused;
	const next: DataDraft = {
		...current,
		name: input.name !== undefined ? input.name.trim() : current.name,
		description: input.description !== undefined ? input.description.trim() : current.description,
		addFields: input.addFields !== undefined && current.kind !== 'remove' ? fieldsOf(ctx, input.addFields) : current.addFields,
		changeFields: input.changeFields !== undefined && current.kind === 'amend' ? [...input.changeFields] : current.changeFields,
		removeFields: input.removeFields !== undefined && current.kind === 'amend' ? [...new Set(input.removeFields)] : current.removeFields
	};
	return done(
		stamp(ctx, { ...request, dataDrafts: request.dataDrafts.map((d) => (d.id === dataDraftId ? next : d)) }, 'draft_change', `Data change updated: ${dataDraftId}`),
		`Data change updated: ${dataDraftId}`
	);
}

function removeDataDraftActCore(ctx: ActContext, request: EvolutionRequest, dataDraftId: string): ActOutcome {
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		guard(!request.dataDrafts.some((d) => d.id === dataDraftId), `No data change "${dataDraftId}" on this request.`, 'get_evolution lists the data changes of a request.'),
		guard(
			request.dataDrafts.some((d) => d.id !== dataDraftId && d.addFields.some((f) => f.relationTo === dataDraftId)),
			'Another data change of this request points at this new table.',
			'Take that relation out first, or keep the table.'
		)
	);
	if (!allowed.ok) return allowed;
	return done(
		stamp(ctx, { ...request, dataDrafts: request.dataDrafts.filter((d) => d.id !== dataDraftId) }, 'draft_change', `Data change taken out: ${dataDraftId}`),
		`Data change taken out: ${dataDraftId}`
	);
}

/** A data change is read at the Impact analysis and reopens no step of prose (ac-evo-draft-data, ac-evo-req-21). */
export function addDataDraftAct(...args: Parameters<typeof addDataDraftActCore>): ActOutcome {
	return addDataDraftActCore(...args);
}
export function updateDataDraftAct(...args: Parameters<typeof updateDataDraftActCore>): ActOutcome {
	return updateDataDraftActCore(...args);
}
export function removeDataDraftAct(...args: Parameters<typeof removeDataDraftActCore>): ActOutcome {
	return removeDataDraftActCore(...args);
}

/* ------------------------------------------------- the other pages of the spec */

export interface SectionDraftInput {
	readonly page?: string;
	readonly summary?: string;
	readonly edits?: readonly unknown[];
	readonly sourceIds?: readonly string[];
}

/**
 * What the server found when it laid the edits on the sections behind the page
 * as they stand and ran their own authoring guards: the sentence that refuses
 * them, or null when they apply and the sections would accept them.
 */
export interface SectionDraftCheck {
	readonly refusal: string | null;
}

const editsRefusal = (page: SpecPage, edits: readonly unknown[]): string | null =>
	sectionEditsIssue(edits) ?? pageEditsRefusal(page, edits as SectionEdit[]);

/**
 * A change to a page of the spec besides the features and the Data map (At a
 * glance, Users and permissions, Experience, Requirements, Architecture,
 * Glossary), on what that page shows only (ac-evo-draft-section): held on the
 * request, written into nothing before the landing.
 */
export function addSectionDraftAct(ctx: ActContext, request: EvolutionRequest, input: SectionDraftInput, check: SectionDraftCheck): ActOutcome {
	const page = input.page ?? '';
	const edits = input.edits ?? [];
	const issue = isSpecPage(page) ? editsRefusal(page, edits) : null;
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		guard(!isSpecPage(page), notDraftablePageReason(page), 'Features keep their feature drafts and the Data map its data drafts.'),
		guard((input.summary ?? '').trim() === '', 'A section change says what it changes, in a summary.', "Write the change in the person's words."),
		guard(issue !== null, issue ?? '', 'The edits take the vocabulary of patch_section, on what the page shows.'),
		guard(check.refusal !== null, check.refusal ?? '', 'Read the section again (get_section) and aim the edit at what it holds now.')
	);
	if (!allowed.ok || !isSpecPage(page)) return allowed as Refused;
	const draft: SectionDraft = {
		id: `${SECTION_DRAFT_PREFIX}${ctx.newId()}`,
		page,
		summary: (input.summary ?? '').trim(),
		edits: edits as SectionEdit[],
		sourceIds: [...new Set(input.sourceIds ?? [])],
		materialisedAt: null
	};
	const name = SPEC_PAGES[page].name;
	return done(
		stamp(ctx, { ...request, sectionDrafts: [...(request.sectionDrafts ?? []), draft] }, 'draft_change', `Change drafted on ${name}: ${draft.summary}`),
		`Change drafted on ${name} (${draft.id})`
	);
}

/**
 * An operation on a section change or a change to the rules that names none
 * says which field it needs, never "No change \"\"" (ac-evo-draft-section,
 * ac-evo-draft-rules).
 */
function missingDraftId(op: string, field: string, adder: string, prefix: string, id: string) {
	return guard(id.trim() === '', `${op} needs ${field}: the id ${adder} answered (${prefix}...).`, 'get_evolution lists the changes of a request with their ids.');
}

export function updateSectionDraftAct(ctx: ActContext, request: EvolutionRequest, sectionDraftId: string, input: SectionDraftInput, check: SectionDraftCheck): ActOutcome {
	const current = (request.sectionDrafts ?? []).find((d) => d.id === sectionDraftId);
	const edits = input.edits;
	const issue = current && edits !== undefined ? editsRefusal(current.page, edits) : null;
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		missingDraftId('update_section_draft', 'sectionDraftId', 'add_section_draft', 'section:', sectionDraftId),
		guard(!current, `No section change "${sectionDraftId}" on this request.`, 'get_evolution lists the section changes of a request.'),
		guard(!!current && current.materialisedAt !== null, 'This change has landed already.', 'A landed change is part of the spec: open another request to change it again.'),
		guard(input.page !== undefined && input.page !== current?.page, 'A section change keeps its page.', 'Draft another change for another page.'),
		guard(input.summary !== undefined && input.summary.trim() === '', 'A section change says what it changes, in a summary.', "Write the change in the person's words."),
		guard(issue !== null, issue ?? '', 'The edits take the vocabulary of patch_section, on what the page shows.'),
		guard(edits !== undefined && check.refusal !== null, check.refusal ?? '', 'Read the section again (get_section) and aim the edit at what it holds now.')
	);
	if (!allowed.ok || !current) return allowed as Refused;
	const next: SectionDraft = {
		...current,
		summary: input.summary !== undefined ? input.summary.trim() : current.summary,
		edits: edits !== undefined ? (edits as SectionEdit[]) : current.edits,
		sourceIds: input.sourceIds !== undefined ? [...new Set(input.sourceIds)] : current.sourceIds
	};
	return done(
		stamp(ctx, { ...request, sectionDrafts: (request.sectionDrafts ?? []).map((d) => (d.id === sectionDraftId ? next : d)) }, 'draft_change', `Change updated on ${SPEC_PAGES[current.page].name}: ${sectionDraftId}`),
		`Change updated on ${SPEC_PAGES[current.page].name} (${sectionDraftId})`
	);
}

export function removeSectionDraftAct(ctx: ActContext, request: EvolutionRequest, sectionDraftId: string): ActOutcome {
	const current = (request.sectionDrafts ?? []).find((d) => d.id === sectionDraftId);
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		missingDraftId('remove_section_draft', 'sectionDraftId', 'add_section_draft', 'section:', sectionDraftId),
		guard(!current, `No section change "${sectionDraftId}" on this request.`, 'get_evolution lists the section changes of a request.'),
		guard(!!current && current.materialisedAt !== null, 'This change has landed already.', 'A landed change is part of the spec: open another request to change it again.')
	);
	if (!allowed.ok || !current) return allowed as Refused;
	return done(
		stamp(ctx, { ...request, sectionDrafts: (request.sectionDrafts ?? []).filter((d) => d.id !== sectionDraftId) }, 'draft_change', `Change taken out of ${SPEC_PAGES[current.page].name}: ${sectionDraftId}`),
		`Change taken out of ${SPEC_PAGES[current.page].name} (${sectionDraftId}); the spec is exactly as it was`
	);
}

/* ------------------------------------------- the rules the whole product keeps */

export interface RuleDraftInput {
	readonly summary?: string;
	readonly operations?: readonly unknown[];
	readonly sourceIds?: readonly string[];
}

/**
 * A change to the rules the whole product keeps (ac-evo-draft-rules): the
 * invariant operations of apply_project_behavior_batch, held on the request,
 * checked by the engine as a dry run against the product as it stands (the
 * server's `check`), written into the project's behaviour only at the landing.
 */
export function addRuleDraftAct(ctx: ActContext, request: EvolutionRequest, input: RuleDraftInput, check: SectionDraftCheck): ActOutcome {
	const operations = input.operations ?? [];
	const issue = ruleOperationsIssue(operations);
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		guard((input.summary ?? '').trim() === '', 'A change to the rules says what it changes, in a summary.', "Write the change in the person's words."),
		guard(issue !== null, issue ?? '', 'The operations are those of apply_project_behavior_batch on project invariants.'),
		guard(check.refusal !== null, check.refusal ?? '', 'Read the rules again (get_behavior_project) and aim the operation at what they hold now.')
	);
	if (!allowed.ok) return allowed;
	const draft: RuleDraft = {
		id: `${RULE_DRAFT_PREFIX}${ctx.newId()}`,
		summary: (input.summary ?? '').trim(),
		operations: operations as Record<string, unknown>[],
		sourceIds: [...new Set(input.sourceIds ?? [])],
		materialisedAt: null
	};
	return done(
		stamp(ctx, { ...request, ruleDrafts: [...(request.ruleDrafts ?? []), draft] }, 'draft_change', `Change drafted on ${RULES_PAGE_NAME}: ${draft.summary}`),
		`Change drafted on ${RULES_PAGE_NAME} (${draft.id})`
	);
}

export function updateRuleDraftAct(ctx: ActContext, request: EvolutionRequest, ruleDraftId: string, input: RuleDraftInput, check: SectionDraftCheck): ActOutcome {
	const current = (request.ruleDrafts ?? []).find((d) => d.id === ruleDraftId);
	const operations = input.operations;
	const issue = operations !== undefined ? ruleOperationsIssue(operations) : null;
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		missingDraftId('update_rule_draft', 'ruleDraftId', 'add_rule_draft', 'rules:', ruleDraftId),
		guard(!current, `No change to the rules "${ruleDraftId}" on this request.`, 'get_evolution lists the changes to the rules of a request.'),
		guard(!!current && current.materialisedAt !== null, 'This change has landed already.', 'A landed change is part of the spec: open another request to change it again.'),
		guard(input.summary !== undefined && input.summary.trim() === '', 'A change to the rules says what it changes, in a summary.', "Write the change in the person's words."),
		guard(issue !== null, issue ?? '', 'The operations are those of apply_project_behavior_batch on project invariants.'),
		guard(operations !== undefined && check.refusal !== null, check.refusal ?? '', 'Read the rules again (get_behavior_project) and aim the operation at what they hold now.')
	);
	if (!allowed.ok || !current) return allowed as Refused;
	const next: RuleDraft = {
		...current,
		summary: input.summary !== undefined ? input.summary.trim() : current.summary,
		operations: operations !== undefined ? (operations as Record<string, unknown>[]) : current.operations,
		sourceIds: input.sourceIds !== undefined ? [...new Set(input.sourceIds)] : current.sourceIds
	};
	return done(
		stamp(ctx, { ...request, ruleDrafts: (request.ruleDrafts ?? []).map((d) => (d.id === ruleDraftId ? next : d)) }, 'draft_change', `Change updated on ${RULES_PAGE_NAME}: ${ruleDraftId}`),
		`Change updated on ${RULES_PAGE_NAME} (${ruleDraftId})`
	);
}

export function removeRuleDraftAct(ctx: ActContext, request: EvolutionRequest, ruleDraftId: string): ActOutcome {
	const current = (request.ruleDrafts ?? []).find((d) => d.id === ruleDraftId);
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		missingDraftId('remove_rule_draft', 'ruleDraftId', 'add_rule_draft', 'rules:', ruleDraftId),
		guard(!current, `No change to the rules "${ruleDraftId}" on this request.`, 'get_evolution lists the changes to the rules of a request.'),
		guard(!!current && current.materialisedAt !== null, 'This change has landed already.', 'A landed change is part of the spec: open another request to change it again.')
	);
	if (!allowed.ok) return allowed;
	return done(
		stamp(ctx, { ...request, ruleDrafts: (request.ruleDrafts ?? []).filter((d) => d.id !== ruleDraftId) }, 'draft_change', `Change taken out of ${RULES_PAGE_NAME}: ${ruleDraftId}`),
		`Change taken out of ${RULES_PAGE_NAME} (${ruleDraftId}); the rules are exactly as they were`
	);
}

/* ------------------------------------------- the findings of Project health */

export interface FindingDraftInput {
	readonly findingId: string;
	readonly outcome?: FindingOutcome;
	readonly reason?: string;
	readonly sourceIds?: readonly string[];
}

/** What the server read for a finding line: the finding as Project health lists it now, and the other request settling it. */
export interface FindingLineContext {
	readonly listed: ListedFinding | null;
	/** The key of another live request that already settles the finding, or null. */
	readonly settledBy: string | null;
	readonly knownLeafIds: ReadonlySet<string>;
}

/** The request with the feature a finding names among those it touches (ac-evo-draft-findings). */
function touchingFeatureOf(request: EvolutionRequest, featureRef: string | null, knownLeafIds: ReadonlySet<string>): EvolutionRequest {
	if (!featureRef || !knownLeafIds.has(featureRef) || request.leafIds.includes(featureRef)) return request;
	return { ...request, leafIds: [...request.leafIds, featureRef] };
}

/**
 * Name a finding of Project health the change settles (ac-evo-draft-findings):
 * fixed by the change, kept as it is with the reason, or with no outcome chosen
 * yet. Held on the request; nothing reaches the register before the landing.
 */
export function addFindingDraftAct(ctx: ActContext, request: EvolutionRequest, input: FindingDraftInput, context: FindingLineContext): ActOutcome {
	const outcome = input.outcome ?? 'undecided';
	const reason = input.reason ?? '';
	const already = (request.findingDrafts ?? []).some((d) => d.findingId === input.findingId);
	const refusal = findingLineRefusal({ findingId: input.findingId, listed: context.listed, settledBy: context.settledBy, outcome, reason });
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		guard(already, 'This request already settles this finding: update_finding_draft changes what becomes of it.', 'One line per finding.'),
		guard(refusal !== null, refusal ?? '', 'get_section coherence lists the findings of Project health with their ids.')
	);
	if (!allowed.ok || !context.listed) return allowed as Refused;
	const draft = newFindingDraft(context.listed, { outcome, reason, sourceIds: input.sourceIds ?? [] });
	const next = touchingFeatureOf({ ...request, findingDrafts: [...(request.findingDrafts ?? []), draft] }, draft.featureRef, context.knownLeafIds);
	return done(stamp(ctx, next, 'draft_change', `Finding named on ${FINDINGS_BLOCK_NAME}: ${draft.title}`), `Finding named on ${FINDINGS_BLOCK_NAME} (${draft.id})`);
}

/** Change what becomes of a finding the request settles, and its reason (why it is kept, or where it was fixed). */
export function updateFindingDraftAct(ctx: ActContext, request: EvolutionRequest, findingDraftId: string, input: Omit<FindingDraftInput, 'findingId'>, context: Pick<FindingLineContext, 'listed'>): ActOutcome {
	const current = (request.findingDrafts ?? []).find((d) => d.id === findingDraftId);
	const outcome = input.outcome ?? current?.outcome ?? 'undecided';
	// A reason belongs to the outcome it was written for: changing the outcome without a new one clears it.
	const reason = input.reason !== undefined ? input.reason.trim() : input.outcome !== undefined && input.outcome !== current?.outcome ? '' : (current?.reason ?? '');
	const refusal = current ? findingLineRefusal({ findingId: current.findingId, listed: context.listed, settledBy: null, outcome, reason }) : null;
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		missingDraftId('update_finding_draft', 'findingDraftId', 'add_finding_draft', FINDING_DRAFT_PREFIX, findingDraftId),
		guard(!current, `No finding "${findingDraftId}" on this request.`, 'get_evolution lists the findings a request settles.'),
		guard(!!current && current.materialisedAt !== null, 'This finding was settled when the change landed.', 'A settled finding is part of the spec: open another request to change it again.'),
		guard(refusal !== null, refusal ?? '', 'get_section coherence lists the findings of Project health with their ids.')
	);
	if (!allowed.ok || !current) return allowed as Refused;
	const next: FindingDraft = {
		...current,
		outcome,
		reason: outcome === 'undecided' ? '' : reason,
		sourceIds: input.sourceIds !== undefined ? [...new Set(input.sourceIds)] : current.sourceIds
	};
	return done(
		stamp(ctx, { ...request, findingDrafts: (request.findingDrafts ?? []).map((d) => (d.id === findingDraftId ? next : d)) }, 'draft_change', `Finding updated on ${FINDINGS_BLOCK_NAME}: ${current.title}`),
		`Finding updated on ${FINDINGS_BLOCK_NAME} (${findingDraftId})`
	);
}

export function removeFindingDraftAct(ctx: ActContext, request: EvolutionRequest, findingDraftId: string): ActOutcome {
	const current = (request.findingDrafts ?? []).find((d) => d.id === findingDraftId);
	const allowed = firstRefusal(
		notFinished(request),
		draftsAreOpen(request),
		missingDraftId('remove_finding_draft', 'findingDraftId', 'add_finding_draft', FINDING_DRAFT_PREFIX, findingDraftId),
		guard(!current, `No finding "${findingDraftId}" on this request.`, 'get_evolution lists the findings a request settles.'),
		guard(!!current && current.materialisedAt !== null, 'This finding was settled when the change landed.', 'A settled finding is part of the spec: open another request to change it again.')
	);
	if (!allowed.ok || !current) return allowed as Refused;
	return done(
		stamp(ctx, { ...request, findingDrafts: (request.findingDrafts ?? []).filter((d) => d.id !== findingDraftId) }, 'draft_change', `Finding taken off ${FINDINGS_BLOCK_NAME}: ${current.title}`),
		`Finding taken off ${FINDINGS_BLOCK_NAME} (${findingDraftId}); Project health is exactly as it was`
	);
}

/**
 * A request just opened, given the findings it was opened on (ac-cc-open-request):
 * each a line with no outcome chosen yet, the features they name among the
 * features it touches, and a description naming them when it has none. Every
 * finding is checked like a line added on its own: one refused refuses them all,
 * so a person never gets half of what they picked.
 */
export function withFindingsAct(ctx: ActContext, request: EvolutionRequest, findingIds: readonly string[], contextOf: (findingId: string) => FindingLineContext): ActOutcome {
	const ids = [...new Set(findingIds.map((id) => id.trim()).filter(Boolean))];
	if (ids.length === 0) return refuse('Pick at least one finding to open a request on.', 'findingIds names the findings by the ids Project health gives them.');
	let current = request;
	const listed: ListedFinding[] = [];
	for (const findingId of ids) {
		const outcome = addFindingDraftAct(ctx, current, { findingId }, contextOf(findingId));
		if (!outcome.ok) return outcome;
		current = outcome.request;
		const context = contextOf(findingId);
		if (context.listed) listed.push(context.listed);
	}
	if (current.need.description.trim() === '') current = { ...current, need: { ...current.need, description: descriptionNaming(listed) } };
	return done(current, `${ids.length} finding${ids.length === 1 ? '' : 's'} of Project health named on ${FINDINGS_BLOCK_NAME}`);
}


