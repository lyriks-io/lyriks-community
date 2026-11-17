import type { AppServices } from '$composition/container.server';
import { dropPreparation, settleGap } from '$domain/coherence';
import { healthPointFinder } from './health-points.server';
import { env } from '$env/dynamic/private';
import { settlesWithin } from './settles-within';
import {
	branchNameFor,
	declareByMergeAct,
	answerProjectClick,
	openProjectSessionOf,
	declareByHandRefusal,
	bringsCode,
	deploymentBranchAllowed,
	reportCodeStateAct,
	requestKeyOf,
	verificationCodeRefusal,
	withValidation,
	fieldKey,
	isElementPath,
	attributeTo,
	addDataDraftAct,
	addSectionDraftAct,
	updateSectionDraftAct,
	removeSectionDraftAct,
	isSpecPage,
	liveSectionDrafts,
	sectionDraftCoherence,
	sectionDraftStartNodeIds,
	SECTION_DRAFT_PREFIX,
	SPEC_PAGES,
	sectionDraftOfKey,
	sectionChangeFingerprint,
	addRuleDraftAct,
	updateRuleDraftAct,
	removeRuleDraftAct,
	liveRuleDrafts,
	ruleDraftCoherence,
	ruleDraftStartNodeIds,
	ruleDraftOfKey,
	ruleChangeFingerprint,
	dataDraftOfKey,
	dataChangeFingerprint,
	ruleLandingOperations,
	RULE_DRAFT_PREFIX,
	addFindingDraftAct,
	updateFindingDraftAct,
	removeFindingDraftAct,
	withFindingsAct,
	findingDraftOfKey,
	findingChangeKey,
	findingChangeFingerprint,
	findingValidationRefusal,
	fieldValidationOf,
	liveFindingDrafts,
	requestSettling,
	projectHealthAfter,
	registerWithSettlements,
	settlementOf,
	isFindingOutcome,
	FINDING_DRAFT_PREFIX,
	type FindingDraft,
	type FindingLineContext,
	type RuleDraftInput,
	type SectionDraftInput,
	updateDataDraftAct,
	removeDataDraftAct,
	landingOfData,
	landRows,
	requestSourceId,
	requestSourceRow,
	sourcesCitedByRequest,
	dataReportLines,
	isDataFieldType,
	DATA_DRAFT_PREFIX,
	type DataDraftInput,
	dueReadings,
	needKeyOf,
	ORIGIN_ANSWER_KEYS,
	isDescribedStep,
	stepQuestionOf,
	addDraftLeafAct,
	answerOpenQuestionAct,
	decideFindingAct,
	logObservationAct,
	isObservationType,
	isWalkthroughTarget,
	buildReportAct,
	closeRequestAct,
	crossStageAct,
	gateFor,
	unvalidatedSpecSteps,
	decideLineAct,
	decideProposalAct,
	decideProposalLineAct,
	delegateToAiAct,
	canDelegateToAi,
	delegatedTo,
	withDelegation,
	deleteRequestAct,
	deferredSuggestions,
	cancelRequestAct,
	reopenRequestAct,
	deriveCodeImpact,
	baselineKeysOf,
	leavesOutsideBaseline,
	isDraftLeafId,
	deriveImplementationReport,
	draftCoherence,
	draftNodeIds,
	foldBackAct,
	isImpactHypothesis,
	isImplementationVerdict,
	isLineDecision,
	isObservationRuling,
	isRequestOrigin,
	liftWaiverAct,
	mapCoherenceAnalysis,
	materialiseDrafts,
	landBehaviourModel,
	specElementsOf,
	type SpecElements,
	pruneDraftMeta,
	markOpenQuestionAct,
	nothingToArbitrate,
	openRequestAct,
	overlayGraph,
	postOnFieldAct,
	decideThreadSuggestionAct,
	cleanWrites,
	propagateImpact,
	usedFeatures,
	proposeAct,
	reachedFeatures,
	rebriefAct,
	refuse,
	removeDraftLeafAct,
	setDraftBehaviourModelAct,
	REQUEST_ORIGINS,
	ruleObservationAct,
	runCoherenceAct,
	runImpactAct,
	setLeavesAct,
	STAGE_ORDER,
	tagReviewersAct,
	nameValidatorsAct,
	isWholeValidatedStep,
	stepTarget,
	personKey,
	updateDraftLeafAct,
	updateRequestAct,
	updateNeedAct,
	markStepNotApplicableAct,
	answerFieldAct,
	isStepValidated,
	reopenSteps,
	askQuestionAct,
	draftIndexKeys,
	pendingDraftFor,
	heldStatusOf,
	mergedStatus,
	touchedLeafIds,
	isLanded,
	leafOf,
	resolveQuestionAct,
	updateStepDescriptionAct,
	answerStepAct,
	redrawDiagramAct,
	writeTextFromDiagramAct,
	refuseFieldAct,
	skipQuestionAct,
	withdrawFieldVerdictAct,
	editMessageAct,
	ruleTopicAct,
	unskipQuestionAct,
	validateFieldAct,
	validateStepAct,
	withdrawStepValidationAct,
	declareDeploymentAct,
	NEED_KEYS,
	type NeedKey,
	withdrawProposalAct,
	type ActContext,
	type ActOutcome,
	type Actor,
	type DraftLeafInput,
	type CriterionInput,
	type EvolutionRequest,
	type FeatureStatus,
	type Guarded,
	type Proposal,
	type ProjectEvolutionDraft,
	requestPagePath,
	type PagePlace,
	findRequestByRef,
	unresolvedRequestReason,
	answerOf,
	endSessionAct,
	isAiClickKind,
	isCloseStep,
	followUpClicks,
	recordAnswerAct,
	sendBuildClickAct,
	sendCloseClickAct,
	sendClickAct,
	sendTicketClickAct,
	reportTicketPostAct,
	withdrawClickAct,
	answerSuggestionAct,
	startStepPrefillAct,
	stopStepPrefillAct,
	stopStepPrefillOnClick,
	type StepPrefillSection,
	aiMayAct,
	cancellableClick,
	currentClickOf,
	journalChanges,
	journalOnCurrentClick,
	markCancelled,
	placeOf,
	publishExchange,
	publishExchangeAct,
	undoJournal,
	UNDOABLE_ONLY,
	asksOnThePage,
	openSessionOf,
	sessionFirst,
	type JournalEntry,
	type JournalSection,
	type JournalSegment
} from '$domain/evolution';
import { parseBranchHistory, parseCodeRepository } from '$application/evolution/parse-evolution-draft';
import { readHeldField, readTouchedField, saveDossierField } from '$application/evolution/save-dossier-field';
import { resolveWalkTarget } from '$application/analysis/simulate-behavior';
import { toDraftProofImpact } from '$application/analysis/what-if';
import type { ProjectFeaturesDraft } from '$domain/features';
import { aiAnswerAuthor } from '$domain/discussions';
import { createEntity, createField, type EntityField, type ProjectDataDraft } from '$domain/data';
import {
	createDocumentSource,
	isDocumentKind,
	sourceAccess,
	sourceAccessIssues,
	type ProjectDocumentsDraft
} from '$domain/documents';
import { mapLimit } from '$lib/shared/map-limit';
import { inputValidation, loadEvolutionView, maturityOf, requestCard, specificationHoldOf, type EvolutionView } from './evolution-view.server';
import { specificationActionTrails } from './evolution-spec-actions.server';
import { draftFeature } from './evolution-graph.server';
import { captureClosingBaselines } from './evolution-closing-baseline.server';
import { readCodeBroughtBy } from './spec-code-drift.server';
import { checkSectionEdits, prepareSectionLanding, readSectionDrafts, writeSectionLandings, type SectionLanding } from './evolution-section-drafts.server';
import { checkRuleLanding, checkRuleOperations, landRuleDrafts, proveRuleDrafts } from './evolution-rule-drafts.server';
import { claimSections } from './section-claims.server';
import { proposalErrors, recordChatAnswer } from './ai-conversations.server';
import { proposalShapeRefusal, type AiChatAnswer } from '$domain/ai-conversations';
import type { ProjectClick } from '$domain/evolution';
import { publishSectionChange } from './sync-bus.server';

/**
 * Typed operations on the Evolution section, applied by the server.
 *
 * This is the write half of "everything a user can do", for the MCP: every act
 * of the lifecycle as one operation, guarded here by the same rules the page
 * applies, with the three reports COMPUTED from the platform's own engines
 * (the knowledge graph, the coherence checker, the implementation index) rather
 * than deposited by whoever calls.
 *
 * The batch is atomic: the operations are applied in order on a working copy,
 * and nothing lands unless every one of them is allowed. A refusal names the
 * operation, the reason the specification wrote, and why the rule exists.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** What the AI sends with answer_click on a message of Ask my AI: its answer, a question back, where it belongs, a change. */
function chatAnswerOf(op: Record<string, unknown>): AiChatAnswer {
	const place = op.place && typeof op.place === 'object' ? (op.place as Record<string, unknown>) : null;
	const proposal = op.proposal && typeof op.proposal === 'object' ? (op.proposal as Record<string, unknown>) : null;
	return {
		text: str(op.text),
		...(op.asks === true ? { asks: true } : {}),
		...(place && str(place.anchor) ? { place: { anchor: str(place.anchor), title: str(place.title) } } : {}),
		...(proposal
			? {
					proposal: {
						featureId: str(proposal.featureId),
						summary: str(proposal.summary),
						operations: Array.isArray(proposal.operations)
							? proposal.operations.filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o))
							: []
					}
				}
			: {})
	};
}
/**
 * A value passed as an origin that is none of the six. The refusal carries the
 * list, so a caller never has to find it in the source.
 */
const unknownOrigin = (value: unknown) =>
	refuse(
		`"${typeof value === 'string' ? value : typeof value}" is not one of the origins a change can come from.`,
		`Pick one of: ${REQUEST_ORIGINS.map((o) => o.code).join(', ')}. get_evolution lists them as originsAvailable.`
	);
/**
 * A proposal value: a string as written, or a list of lines. A field the
 * dossier declares as `kind: "list"` is naturally sent as an array, and
 * silently reading that as an empty string wrote an empty proposal.
 */
const text = (v: unknown): string => {
	if (typeof v === 'string') return v;
	if (Array.isArray(v))
		return v
			.filter((line) => typeof line === 'string' || typeof line === 'number' || typeof line === 'boolean')
			.map((line) => String(line))
			.join('\n');
	return typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
};
const strList = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];
const num = (v: unknown, fallback: number): number =>
	typeof v === 'number' && Number.isFinite(v) ? v : fallback;
/** The sections a step prefill walks, as the page sends them; one naming no block or no question is dropped. */
const stepPrefillSections = (v: unknown): StepPrefillSection[] =>
	(Array.isArray(v) ? v : [])
		.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
		.map((s) => ({ id: str(s.id), fieldPath: str(s.fieldPath), leafId: str(s.leafId) || null, section: strList(s.section) }))
		.filter((s) => s.id !== '' && s.fieldPath !== '');

/**
 * A drafted feature as it arrives from a client. Only the keys actually sent are
 * read, so an update touches what it names and leaves the rest of the draft
 * alone.
 */
const draftInput = (op: Record<string, unknown>): DraftLeafInput => {
	const kind = op.kind === 'amend' || op.kind === 'remove' || op.kind === 'add' ? op.kind : undefined;
	const behaviour = Array.isArray(op.behaviour)
		? op.behaviour
				.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
				.map((row) => ({
					kind: str(row.kind) as 'surface' | 'state' | 'action' | 'rule' | 'scenario',
					name: str(row.name),
					detail: str(row.detail)
				}))
		: undefined;
	return {
		// `kind` is also the batch's own discriminator on other operations, so it is
		// only read as a draft kind when it spells one of the three.
		kind,
		baseLeafId: op.baseLeafId === undefined ? undefined : str(op.baseLeafId) || null,
		name: op.name === undefined ? undefined : str(op.name),
		description: op.description === undefined ? undefined : str(op.description),
		coreId: op.coreId === undefined ? undefined : str(op.coreId) || null,
		parentFamilyId:
			op.parentFamilyId === undefined ? undefined : str(op.parentFamilyId) || null,
		objective: op.objective === undefined ? undefined : str(op.objective),
		problem: op.problem === undefined ? undefined : str(op.problem),
		expectedEffect: op.expectedEffect === undefined ? undefined : str(op.expectedEffect),
		value: op.value === undefined ? undefined : text(op.value),
		acceptanceCriteria: op.acceptanceCriteria === undefined ? undefined : (criteriaInput(op.acceptanceCriteria) ?? undefined),
		dependsOn: op.dependsOn === undefined ? undefined : strList(op.dependsOn),
		sourceIds: op.sourceIds === undefined ? undefined : strList(op.sourceIds),
		behaviour,
		retireCriteria: op.retireCriteria === undefined ? undefined : strList(op.retireCriteria),
		changeCriteria:
			op.changeCriteria === undefined
				? undefined
				: records(op.changeCriteria).map((c) => ({ id: str(c.id), text: str(c.text) })),
		// One patch or several: a single `{find, replace}` is the ordinary case.
		descriptionPatch:
			op.descriptionPatch === undefined
				? undefined
				: records(Array.isArray(op.descriptionPatch) ? op.descriptionPatch : [op.descriptionPatch]).map((p) => ({
						find: str(p.find),
						replace: str(p.replace)
					})),
		descriptionAppend: op.descriptionAppend === undefined ? undefined : str(op.descriptionAppend),
		changeSummary: op.changeSummary === undefined ? undefined : str(op.changeSummary)
	};
};

/**
 * A draft's criteria as an operation sends them: texts, or {id, text} rows to
 * reword. Anything else makes the whole list null, so the operation is refused
 * instead of quietly emptying the draft (ac-evo-draft-criteria-ids).
 */
function criteriaInput(v: unknown): CriterionInput[] | null {
	if (!Array.isArray(v)) return null;
	const out: CriterionInput[] = [];
	for (const item of v) {
		if (typeof item === 'string') out.push(item);
		else if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
			const { id, text } = item as { id?: unknown; text: string };
			out.push(typeof id === 'string' && id !== '' ? { id, text } : { text });
		} else return null;
	}
	return out;
}
const badCriteria = (op: Record<string, unknown>) => op.acceptanceCriteria !== undefined && criteriaInput(op.acceptanceCriteria) === null;
const CRITERIA_REFUSAL = refuse(
	'acceptanceCriteria must be a list of texts, or of {id, text} rows to reword a criterion.',
	'Nothing was changed: the draft keeps its criteria.'
);

/** A data change as an operation sends it (ac-evo-draft-data): only what it carries. */
function dataDraftInput(op: Record<string, unknown>): DataDraftInput {
	const fields = (v: unknown) =>
		records(v).map((f) => ({
			name: str(f.name),
			...(typeof f.type === 'string' ? { type: f.type } : {}),
			...(typeof f.required === 'boolean' ? { required: f.required } : {}),
			...(typeof f.list === 'boolean' ? { list: f.list } : {}),
			...(typeof f.relationTo === 'string' ? { relationTo: f.relationTo } : {})
		}));
	return {
		...(op.kind === 'add' || op.kind === 'amend' || op.kind === 'remove' ? { kind: op.kind } : {}),
		...(typeof op.entityId === 'string' ? { entityId: op.entityId } : {}),
		...(typeof op.name === 'string' ? { name: op.name } : {}),
		...(typeof op.description === 'string' ? { description: op.description } : {}),
		...(op.addFields !== undefined ? { addFields: fields(op.addFields) } : {}),
		...(op.changeFields !== undefined
			? {
					changeFields: records(op.changeFields)
						.filter((c) => typeof c.fieldId === 'string')
						.map((c) => ({
							fieldId: c.fieldId as string,
							...(typeof c.name === 'string' ? { name: c.name } : {}),
							...(isDataFieldType(c.type) ? { type: c.type } : {}),
							...(typeof c.required === 'boolean' ? { required: c.required } : {}),
							...(typeof c.list === 'boolean' ? { list: c.list } : {}),
							...(c.relationTo === null || typeof c.relationTo === 'string' ? { relationTo: c.relationTo as string | null } : {})
						}))
				}
			: {}),
		...(op.removeFields !== undefined ? { removeFields: strList(op.removeFields) } : {})
	};
}

/**
 * The change an operation names: its own field, or a draftId carrying the id
 * the add operation answered, since that answer prints it in that form
 * (ac-evo-draft-section, ac-evo-draft-rules).
 */
const draftIdIn = (op: Record<string, unknown>, field: string, prefix: string): string =>
	str(op[field]) || (str(op.draftId).startsWith(prefix) ? str(op.draftId) : '');
const sectionDraftIdOf = (op: Record<string, unknown>) => draftIdIn(op, 'sectionDraftId', 'section:');
const ruleDraftIdOf = (op: Record<string, unknown>) => draftIdIn(op, 'ruleDraftId', 'rules:');
/** A finding line is named by its own id, or by the Project health id of the finding it settles. */
const findingDraftIdOf = (op: Record<string, unknown>) =>
	draftIdIn(op, 'findingDraftId', FINDING_DRAFT_PREFIX) || (str(op.findingId) ? `${FINDING_DRAFT_PREFIX}${str(op.findingId)}` : '');
const records = (v: unknown): Record<string, unknown>[] =>
	Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

/** A change to the rules as an operation sends it; only what it names is touched on an update. */
function ruleDraftInput(op: Record<string, unknown>): RuleDraftInput {
	return {
		...(typeof op.summary === 'string' ? { summary: op.summary } : {}),
		...(op.operations !== undefined ? { operations: Array.isArray(op.operations) ? op.operations : [] } : {}),
		...(op.sourceIds !== undefined ? { sourceIds: strList(op.sourceIds) } : {})
	};
}

/** A section change as an operation sends it; only what it names is touched on an update. */
function sectionDraftInput(op: Record<string, unknown>): SectionDraftInput {
	return {
		...(typeof op.page === 'string' ? { page: op.page } : {}),
		...(typeof op.summary === 'string' ? { summary: op.summary } : {}),
		...(op.edits !== undefined ? { edits: Array.isArray(op.edits) ? op.edits : [] } : {}),
		...(op.sourceIds !== undefined ? { sourceIds: strList(op.sourceIds) } : {})
	};
}

export const EVOLUTION_OPERATIONS = [
	'open_request',
	'register_source',
	'update_request',
	'set_leaves',
	'add_draft_leaf',
	'update_draft_leaf',
	'remove_draft_leaf',
	'add_data_draft',
	'update_data_draft',
	'remove_data_draft',
	'add_section_draft',
	'update_section_draft',
	'remove_section_draft',
	'add_rule_draft',
	'update_rule_draft',
	'remove_rule_draft',
	'add_finding_draft',
	'update_finding_draft',
	'remove_finding_draft',
	'set_draft_behaviour',
	'propose',
	'decide_proposal',
	'decide_proposal_line',
	'delegate_to_ai',
	'withdraw_proposal',
	'tag_reviewers',
	'mark_open_question',
	'answer_open_question',
	'post_on_field',
	'decide_thread_suggestion',
	'run_impact',
	'run_coherence',
	'decide_finding',
	'build_implementation_report',
	'cross_stage',
	'lift_waiver',
	'rebrief',
	'decide_line',
	'log_observation',
	'rule_observation',
	'fold_back',
	'close_request',
	'cancel_request',
	'reopen_request',
	'delete_request',
	'update_need',
	'mark_step_not_applicable',
	'validate_step',
	'update_step_description',
	'answer_step',
	'redraw_diagram',
	'write_text_from_diagram',
	'refuse_field',
	'withdraw_field_verdict',
	'edit_message',
	'validate_topic',
	'resolve_topic',
	'reopen_topic',
	'skip_question',
	'unskip_question',
	'answer_field',
	'validate_field',
	'ask_question',
	'resolve_question',
	'withdraw_step_validation',
	'name_validators',
	'declare_deployment',
	'set_deployment_branch',
	'report_code_state',
	'report_merge',
	'start_session',
	'end_session',
	'send_click',
	'withdraw_click',
	'cancel_click',
	'publish_exchange',
	'answer_suggestion',
	'start_step_prefill',
	'stop_step_prefill',
	'report_ticket_post',
	'answer_click'
] as const;

/** What no cancellation could undo, refused to the AI while it is on a click (ac-evo-live-cancel). */
const NOT_UNDOABLE: ReadonlySet<string> = new Set(['cross_stage', 'close_request', 'delete_request']);

/** The session and its clicks are traffic, not content: a journal never records them, nor itself. */
const isSessionBookkeeping = (path: readonly JournalSegment[]): boolean =>
	path.length === 3 &&
	path[0] === 'requests' &&
	// What the AI did on a ticket happened outside: cancelling the click cannot take a posted comment back.
	(path[2] === 'aiClicks' || path[2] === 'liveSessions' || path[2] === 'stepPrefills' || path[2] === 'ticketPost');

/** A place inside a request's threads: a reply, not a change of the specification. */
const isThreadPlace = (entry: JournalEntry): boolean =>
	entry.section === 'evolution' && entry.path[0] === 'requests' && entry.path[2] === 'fieldThreads';
export type EvolutionOperationName = (typeof EVOLUTION_OPERATIONS)[number];

export interface OperationResult {
	readonly index: number;
	readonly op: string;
	readonly requestId: string | null;
	readonly ok: boolean;
	readonly summary: string;
	readonly detail?: string;
	/** On a refusal a person resolves: where on the page they do it. */
	readonly href?: string;
	/** The fields the operation carried and never read: a misspelt name is said, never dropped in silence. */
	readonly ignored?: readonly string[];
}

/** The fields every operation may carry whatever it reads: its name and the request it is on. */
const ALWAYS_READ = new Set(['op', 'kind', 'requestId']);

/** An operation that remembers which of its fields were read, so the ones nobody read can be named. */
export function readTracked(raw: Record<string, unknown>): { op: Record<string, unknown>; unread: () => string[] } {
	const read = new Set<string>();
	const op = new Proxy(raw, {
		get(target, key, receiver) {
			if (typeof key === 'string') read.add(key);
			return Reflect.get(target, key, receiver);
		}
	});
	return { op, unread: () => Object.keys(raw).filter((k) => !ALWAYS_READ.has(k) && !read.has(k)) };
}

/**
 * Where a person resolves what a refused operation asked for: the proposal it
 * named, the report line, the observation, or the next gate for a crossing.
 * An operation that names none of these opens the request itself.
 */

export function refusalPlace(op: Record<string, unknown>, name: string): PagePlace | undefined {
	const id = (key: string) => (typeof op[key] === 'string' && op[key] ? (op[key] as string) : null);
	if (id('proposalId')) return { kind: 'proposal', id: id('proposalId')! };
	if (id('lineId')) return { kind: 'line', id: id('lineId')! };
	if (id('observationId')) return { kind: 'observation', id: id('observationId')! };
	if (name === 'cross_stage' || name === 'lift_waiver' || name === 'rebrief' || name === 'close_request') return { kind: 'next-step' };
	return undefined;
}

export type ApplyOutcome =
	| {
			readonly ok: true;
			readonly results: OperationResult[];
			readonly revision: number;
			readonly savedAt: string;
			readonly requests: ReturnType<typeof requestCard>[];
	  }
	| { readonly ok: false; readonly status: 409 | 422; readonly results: OperationResult[] };

/** What one landing settles on Project health: the request, its merge commit, and each line with who validated it. */
interface FindingLanding {
	readonly requestId: string;
	readonly requestKey: string;
	readonly mergeCommit: string | null;
	readonly lines: readonly { readonly draft: FindingDraft; readonly validator: { readonly id: string; readonly name: string } }[];
}

/** An act that succeeded without touching a request, and says what it did. */
type Said = { readonly ok: true; readonly summary: string };

interface Working {
	evolution: ProjectEvolutionDraft;
	features: ProjectFeaturesDraft;
	featuresChanged: boolean;
	/** The Data section, written only when a request's data changes land (ac-evo-draft-data-landing). */
	data: ProjectDataDraft;
	dataChanged: boolean;
	/** The other parts of the spec a landing writes, each through its own save (ac-evo-draft-section-landing). */
	sectionLandings: SectionLanding[];
	/** The changes to the rules the whole product keeps a landing writes, as one project batch after the dossier (ac-evo-draft-rules). */
	ruleLandings: { readonly requestId: string; readonly operations: Record<string, unknown>[] }[];
	/** The findings of Project health a landing settles, written after the dossier (ac-evo-draft-findings-landing). */
	findingLandings: FindingLanding[];
	readonly touched: Set<string>;
}

/**
 * How long a coherence reading waits for the behaviour verification it folds
 * in (ac-evo-coh-same-reading, behaviourReadDeadlineSeconds): provisional, to
 * settle once measured; LYRIKS_EVO_BEHAVIOUR_READ_MS overrides it.
 */
const BEHAVIOUR_READ_DEADLINE_MS = ((ms) => (Number.isFinite(ms) && ms > 0 ? ms : 20_000))(Number((env.LYRIKS_EVO_BEHAVIOUR_READ_MS ?? '').trim()));

/** The engine's status of one feature, or null when it holds none. */
async function featureStatus(services: AppServices, leafId: string): Promise<FeatureStatus | null> {
	if (!services.codeAdoption.available) return null;
	const result = await services.codeAdoption.getImplementationStatus(leafId).catch(() => null);
	return result?.ok ? (result.value as FeatureStatus) : null;
}

/**
 * Expand the ids an operation names inside its request (a proposal, a draft, a
 * report line, an observation, a finding) from a unique prefix to the full id,
 * in place. Answers the refusal sentence when a prefix names several.
 */
function expandInnerRefs(op: Record<string, unknown>, request: EvolutionRequest): string | null {
	const pools: Record<string, readonly { readonly id: string }[]> = {
		proposalId: request.proposals,
		draftId: request.drafts,
		lineId: request.implementationFindings,
		observationId: request.observations,
		findingId: request.coherenceFindings,
		sectionDraftId: request.sectionDrafts ?? [],
		ruleDraftId: request.ruleDrafts ?? [],
		findingDraftId: request.findingDrafts ?? []
	};
	for (const [field, pool] of Object.entries(pools)) {
		const ref = str(op[field]);
		if (!ref) continue;
		let found = findRequestByRef(pool, ref);
		// A draft is quoted with or without its `draft:` prefix.
		if (found.kind === 'none' && field === 'draftId' && !isDraftLeafId(ref)) found = findRequestByRef(pool, `draft:${ref}`);
		if (found.kind === 'none' && field === 'sectionDraftId' && !ref.startsWith(SECTION_DRAFT_PREFIX)) found = findRequestByRef(pool, `${SECTION_DRAFT_PREFIX}${ref}`);
		if (found.kind === 'none' && field === 'ruleDraftId' && !ref.startsWith(RULE_DRAFT_PREFIX)) found = findRequestByRef(pool, `${RULE_DRAFT_PREFIX}${ref}`);
		if (found.kind === 'none' && field === 'findingDraftId' && !ref.startsWith(FINDING_DRAFT_PREFIX)) found = findRequestByRef(pool, `${FINDING_DRAFT_PREFIX}${ref}`);
		if (found.kind === 'found') op[field] = found.request.id;
		else if (found.kind === 'ambiguous') return `"${ref}" starts ${found.candidates.length} ${field.replace(/Id$/, '')}s: ${found.candidates.join(', ')}.`;
	}
	return null;
}

/** What the spec declares on a feature; null when the behaviour model cannot be read. */
/**
 * What a dossier field holds now, read where it lives: the request for the need
 * and the step descriptions, the owning section for a feature's field. A field
 * validation stands behind this value, so a change made outside the dossier is
 * what gets validated rather than the last version the dossier kept.
 */
function liveValueOf(request: EvolutionRequest, key: string, features: ProjectFeaturesDraft): string {
	const step = /^step\.([a-z_]+)\.description$/.exec(key)?.[1];
	if (step && isDescribedStep(step)) return request.stepDescriptions[step];
	const answer = /^step\.([a-z_]+)\.([a-z_]+)$/.exec(key);
	const asked = answer ? stepQuestionOf(answer[1], answer[2]) : null;
	if (asked) return request.stepAnswers[asked.step][asked.key] ?? '';
	const [path, leafId] = key.split('@');
	const needKey = needKeyOf(path);
	if (needKey) return request.need[needKey];
	// Who asked and where it comes from, validated in 1.1 like the need (ac-evo-form-origin-validated).
	if (path === ORIGIN_ANSWER_KEYS.requester) return request.requester ?? '';
	if (path === ORIGIN_ANSWER_KEYS.origin) return request.origin ?? '';
	// What the card shows: the section's value, else what the draft carries (d6560483).
	return leafId ? readHeldField(features, request, path, leafId).value : '';
}

/**
 * An action of the specification is validated or refused like an answer, on
 * its synthetic field (spec-actions.ts): its value is the fingerprint the page
 * read, sent with the act, since no section holds it.
 */
function elementOrLiveValue(op: Record<string, unknown>, request: EvolutionRequest, key: string, features: ProjectFeaturesDraft): string {
	// A section change stands behind its own edits, whoever validates it (ac-evo-draft-section-read).
	const change = sectionDraftOfKey(request.sectionDrafts, key.split('@')[0]);
	if (change) return sectionChangeFingerprint(change);
	const rules = ruleDraftOfKey(request.ruleDrafts, key.split('@')[0]);
	if (rules) return ruleChangeFingerprint(rules);
	// A finding stands behind what becomes of it now (ac-evo-draft-findings-read).
	const finding = findingDraftOfKey(request.findingDrafts, key.split('@')[0]);
	if (finding) return findingChangeFingerprint(finding);
	// A change to the data stands behind what it says now (3.4 Datamap, criterion 3d4f23dd).
	const data = dataDraftOfKey(request.dataDrafts, key.split('@')[0]);
	if (data) return dataChangeFingerprint(data);
	return isElementPath(key.split('@')[0]) ? text(op.value) : liveValueOf(request, key, features);
}

async function specElementsFor(services: AppServices, projectId: string, leafId: string): Promise<SpecElements | null> {
	const snapshot = await services.readBehaviorFeature.execute(projectId, leafId).catch(() => null);
	return snapshot ? specElementsOf(snapshot.feature) : null;
}

/**
 * Keep a draft's runnable behaviour (DraftBehaviourModel): the engine replays
 * the operations over what the draft stands for, and they are kept only if it
 * validates them the way a saved batch is validated. `mintedIds` from the
 * caller win over the stored ones, so a model written after a dry run keeps
 * the ids that dry run announced. An empty list clears the model.
 */
async function setDraftBehaviour(
	services: AppServices,
	ctx: ActContext,
	request: EvolutionRequest,
	op: Record<string, unknown>
): Promise<ActOutcome> {
	const draftId = str(op.draftId);
	const operations = records(op.operations);
	const draft = request.drafts.find((d) => d.id === draftId);
	if (!draft || operations.length === 0 || request.frozen) {
		// The act names what is missing or refuses the frozen request.
		return setDraftBehaviourModelAct(ctx, request, draftId, null);
	}
	// A model written from a read of the draft is refused when the model moved
	// since that read: two writers appending at once would otherwise keep only
	// the last one's operations.
	if (typeof op.expectedModelAt === 'string' && op.expectedModelAt !== (draft.behaviourModel?.updatedAt ?? '')) {
		return refuse(
			`The behaviour model of draft "${draft.name || draftId}" changed since it was read.`,
			'Read the draft again and resend the batch: nothing was written.'
		);
	}
	const target = resolveWalkTarget(draftId, { requests: [request] }, true);
	if (!target.ok) return refuse(target.message, 'get_evolution lists the drafts of a request.');
	const answer = await services.simulateBehavior.execute({
		target: target.target,
		args: { operations },
		operationsMode: 'instead',
		...(Array.isArray(op.mintedIds) ? { mintedIds: strList(op.mintedIds) } : {})
	});
	if (!answer)
		return refuse(
			'The behaviour engine did not answer; the model was not kept.',
			'Retry once the engine is back: nothing was written.'
		);
	if (answer.kind === 'refused') return refuse(answer.error, 'Nothing was written.');
	const walk = answer.walk as { ok?: unknown; errors?: unknown; batch?: { mintedIds?: unknown } };
	if (walk.ok !== true) {
		const errors = Array.isArray(walk.errors) ? walk.errors.map(String) : [];
		return refuse(
			`The engine refused the behaviour model of draft "${draft.name || draftId}": ${errors.slice(0, 5).join(' | ') || 'no reason given'}`,
			'The operations are checked like an apply_behavior_batch; fix them and send the model again.'
		);
	}
	return setDraftBehaviourModelAct(ctx, request, draftId, {
		operations,
		mintedIds: strList(walk.batch?.mintedIds)
	});
}

/**
 * What one landing settles, written into the sections that own it
 * (ac-evo-draft-findings-landing): the rules register takes its findings fixed or
 * kept, a decision by design takes the kept findings something else detects.
 * The decision is the person's who validated the line, so it goes through the
 * coherence section's decided save like the decisions endpoint.
 */
async function writeFindingLanding(
	services: AppServices,
	projectId: string,
	landing: FindingLanding,
	origin: string | null,
	at: string
): Promise<{ ok: boolean; summary: string }> {
	const drafts = landing.lines.map((l) => l.draft);
	const validators = new Map(landing.lines.map((l) => [l.draft.id, l.validator]));
	const register = await services.loadRulesDraft.execute(projectId);
	const { rules, written } = registerWithSettlements(register, drafts, {
		requestKey: landing.requestKey,
		mergeCommit: landing.mergeCommit,
		at,
		validatorOf: (d) => validators.get(d.id)?.name ?? ''
	});
	if (written.length > 0) await services.saveRulesDraft.execute(rules);
	const byDesign = drafts.filter((d) => settlementOf(d, register) === 'by_design');
	let decided = 0;
	if (byDesign.length > 0) {
		const view = await services.loadCoherenceDraft.execute(projectId);
		let next = view.draft;
		for (const draft of byDesign) {
			const gap = view.analysis.gaps.find((g) => g.id === draft.findingId);
			if (!gap || gap.blocking) continue;
			const validator = validators.get(draft.id);
			next = settleGap(
				next,
				{ gapId: draft.findingId, gapTitle: gap.title, status: 'by_design', reason: `${draft.reason} (${landing.requestKey})`, author: { id: validator?.id ?? 'local', kind: 'person' } },
				`decision-${crypto.randomUUID().slice(0, 8)}`,
				at
			);
			next = dropPreparation(next, draft.findingId);
			decided++;
		}
		if (decided > 0) {
			const saved = await services.saveCoherenceDraft.executeDecided(next, {
				expectedRevision: await services.sectionDocuments.currentRevision(projectId, 'coherence'),
				origin
			});
			if (saved === null) return { ok: false, summary: `${written.length} finding${written.length === 1 ? '' : 's'} written into the rules register; the decisions by design could not be saved (the coherence section changed meanwhile): run the landing again.` };
		}
	}
	const byEngine = drafts.length - written.length - decided;
	return {
		ok: true,
		summary: `Project health: ${written.length} finding${written.length === 1 ? '' : 's'} settled in the rules register, ${decided} kept by design${byEngine > 0 ? `, ${byEngine} left to the engine reading the landed spec` : ''}`
	};
}

export async function applyEvolutionOperations(
	services: AppServices,
	input: {
		readonly projectId: string;
		readonly operations: readonly unknown[];
		readonly actor: Actor;
		readonly origin: string | null;
	}
): Promise<ApplyOutcome> {
	// The revisions first: the saves below land only on these sections as they were read (criterion d9c67477).
	const [featuresReadAt, dataReadAt] = await Promise.all([
		services.draftLock.current(input.projectId, 'features'),
		services.draftLock.current(input.projectId, 'data')
	]);
	const view = await loadEvolutionView(services, input.projectId);
	// The roster a proposal can be handed to; null where one member is alone.
	const roster = view.members.length > 1 ? new Set(view.members.map((m) => m.id)) : null;
	const working: Working = {
		evolution: view.draft,
		features: view.features,
		featuresChanged: false,
		data: view.data,
		dataChanged: false,
		sectionLandings: [],
		ruleLandings: [],
		findingLandings: [],
		touched: new Set()
	};
	// Each banned word travels with the agreed term it stands in for, so a flag
	// names the sense it guards rather than only saying "banned".
	const bannedWords = view.glossaryTerms.flatMap((t) =>
		(t.synonymsAvoid ?? []).map((avoid) => ({ avoid, prefer: t.term }))
	);
	// Mutable for one field: whether the AI acts under its person's delegation is read anew for each request (ac-evo-llm-delegation).
	const ctx: { -readonly [K in keyof ActContext]: ActContext[K] } = {
		actor: input.actor,
		bannedWords,
		at: services.clock.nowIso(),
		newId: () => crypto.randomUUID(),
		// Who signs follows the roster (ac-evo-req-13). A workspace with nobody
		// else in it has nobody to counter-sign, so the client carries the request
		// through on the person's behalf; the channel is stamped on the timeline
		// either way, so a later reader always knows how the decision arrived.
		soloWorkspace: view.members.length <= 1,
		// The people who can be named to validate: the members, a viewer excepted (ac-evo-req-named-validators).
		validators: roster ? new Set(view.members.filter((m) => m.role !== 'viewer').map((m) => personKey(m.id))) : null,
		// What the dossier stores (its timeline, its findings, its report lines)
		// is written in the language of the spec (382e5227).
		lang: view.language
	};
	const knownLeafIds = new Set(view.leaves.map((l) => l.id));
	// What an amendment's delta is checked against: the feature as it stands now.
	const baseLeaf = (leafId: string) => {
		const leaf = working.features.features.find((f) => f.id === leafId);
		if (!leaf) return null;
		return {
			description: leaf.description,
			criteria: working.features.leafMeta?.[leafId]?.acceptanceCriteria ?? []
		};
	};
	const leafNames = Object.fromEntries(view.leaves.map((l) => [l.id, l.name]));
	const sourceIds = new Set(view.sources.map((s) => s.id));
	/**
	 * Every point of Project health (ac-evo-draft-findings): its coherence gaps, its audit points and its code points, as
	 * What Lyriks noticed lists them. The reading the pages show first, at once; a point it does not hold yet is looked
	 * for in a reading taken now, so a point an agent names from a fresher reading is found too. Each read once per batch.
	 */
	const healthPoint = healthPointFinder(
		async () => (await services.projectHealthView.get(input.projectId))?.points ?? [],
		async () => (await services.readProjectHealth.execute(input.projectId)).points
	);
	/** What a finding line is checked against: the finding as Project health lists it, and another live request holding it. */
	const findingContext = async (findingId: string, requestId: string | null): Promise<FindingLineContext> => {
		const gap = await healthPoint(findingId);
		const other = requestSettling(working.evolution.requests, findingId, requestId);
		return {
			listed: gap,
			settledBy: other ? (requestKeyOf(working.evolution.requests, other.id) ?? other.id) : null,
			knownLeafIds
		};
	};

	const results: OperationResult[] = [];
	/** The AI's answers to questions on blocks, posted in their threads once the batch is saved. */
	const threadReplies: { threadId: string; messageId: string | undefined; text: string; personId: string; rosterName: string | undefined }[] = [];
	/** The AI's answers in the conversations of Ask my AI, recorded once the batch is saved. */
	const chatReplies: { click: ProjectClick; answer: AiChatAnswer }[] = [];

	/**
	 * A source registered in the same batch that cites it. The documents register
	 * is where a proposal's evidence lives, and a batch that could not write it
	 * sent the author out to patch_section and back, with the dossier nowhere
	 * saying so. The register row obeys the register's own rule: a reader can
	 * reach what it cites, through a web address or through the note that
	 * carries the words themselves.
	 */
	let documents: ProjectDocumentsDraft | null = null;
	const registerSource = async (op: Record<string, unknown>): Promise<Guarded | Said> => {
		const title = str(op.title).trim();
		const url = str(op.url).trim();
		const note = str(op.note).trim();
		if (!title) return refuse('A source needs a title.', 'The title is how a proposal and a reader name it.');
		const access = sourceAccess({ url, note });
		if (access === 'unreachable' || access === 'empty')
			return refuse(
				sourceAccessIssues([{ id: title, title, url, note }])[0].message,
				'A citation is evidence only if someone other than its author can reach it.'
			);
		const register = await loadDocuments();
		const id = str(op.id).trim() || `src-${ctx.newId()}`;
		const existing = register.sources.find((s) => s.id === id);
		if (existing) {
			if (existing.title === title && (existing.url ?? '') === url && (existing.note ?? '') === note)
				return { ok: true, summary: `Source ${id} is already registered` };
			return refuse(`A source "${id}" already exists with other content.`, 'Pick another id, or cite the existing one.');
		}
		const kind = isDocumentKind(op.kind) ? op.kind : url ? 'link' : 'evidence';
		documents = { ...register, sources: [...register.sources, createDocumentSource({ id, title, kind, url, note })] };
		documentsChanged = true;
		sourceIds.add(id);
		return { ok: true, summary: `Registered source ${id} ("${title}"): cite it as citedSourceIds ["${id}"]` };
	};
	let documentsChanged = false;
	let documentsRevision: number | null = null;
	/** The register as it was read, so what the AI added to it is journaled (ac-evo-live-cancel). */
	let documentsAtLoad: ProjectDocumentsDraft | null = null;
	async function loadDocuments(): Promise<ProjectDocumentsDraft> {
		if (!documents) {
			// The revision first: the save below lands only on the register as it was read.
			documentsRevision = await services.sectionDocuments.currentRevision(input.projectId, 'documents');
			documents = await services.loadDocumentRegister.execute(input.projectId);
			documentsAtLoad = documents;
		}
		return documents;
	}
	/** The request as a row of Documents & Sources, registered once: what the tables its landing writes cite. */
	async function requestSource(request: EvolutionRequest): Promise<string> {
		const id = requestSourceId(request.id);
		if (sourceIds.has(id)) return id;
		const register = await loadDocuments();
		if (!register.sources.some((s) => s.id === id)) {
			const row = requestSourceRow(request, requestKeyOf(working.evolution.requests, request.id) ?? request.id);
			documents = { ...register, sources: [...register.sources, createDocumentSource(row)] };
			documentsChanged = true;
		}
		sourceIds.add(id);
		return id;
	}
	// The click the AI of a live session is on when the batch starts: what it writes is journaled on it.
	const journaled = ctx.actor.kind === 'ai_client' ? (view.draft.requests.find((r) => currentClickOf(r, ctx.actor.id)) ?? null) : null;
	const onAClick = () => ctx.actor.kind === 'ai_client' && working.evolution.requests.some((r) => currentClickOf(r, ctx.actor.id));
	// Any unique prefix names a request, as the board and every report shorten it.
	const lookupRequest = (ref: string) => findRequestByRef(working.evolution.requests, ref);
	const put = (request: EvolutionRequest) => {
		const exists = working.evolution.requests.some((r) => r.id === request.id);
		working.evolution = {
			...working.evolution,
			requests: exists
				? working.evolution.requests.map((r) => (r.id === request.id ? request : r))
				: [...working.evolution.requests, request]
		};
		working.touched.add(request.id);
	};

	/** Behaviour models to land on the features this batch writes, once they are saved. */
	const landings: {
		requestId: string;
		draftName: string;
		featureId: string;
		operations: Record<string, unknown>[];
		mintedIds: string[];
	}[] = [];

	/** The drafts of a request whose behaviour model the engine no longer validates, said. */
	const draftModelsThatNoLongerApply = async (request: EvolutionRequest): Promise<string[]> => {
		const stale: string[] = [];
		for (const draft of request.drafts) {
			// Nothing left to replay: what the model held is already in the feature.
			if (!draft.behaviourModel?.operations.length || draft.kind === 'remove') continue;
			const target = resolveWalkTarget(draft.id, { requests: [request] }, true);
			if (!target.ok) continue;
			const answer = await services.simulateBehavior.execute({ target: target.target, args: {} });
			const walk = answer?.kind === 'walk' ? (answer.walk as { ok?: unknown; errors?: unknown }) : null;
			if (walk?.ok === true) continue;
			const why = !answer
				? 'the engine did not answer'
				: answer.kind === 'refused'
					? answer.error
					: Array.isArray(walk?.errors)
						? walk.errors.slice(0, 3).map(String).join(' | ')
						: 'refused by the engine';
			stale.push(`draft "${draft.name || draft.id}" does not apply: ${why}`);
		}
		return stale;
	};

	/**
	 * One gate, crossed. The freeze (into Build) records version N on the request
	 * and writes NOTHING into the specification: the code is built against a
	 * version nobody made official yet. Accepting the Build (into Approval) is
	 * the single moment a dossier touches the specification (ac-evo-req-landing,
	 * ac-evo-draft-5): every draft lands, with its behaviour, under the ids the
	 * code was already indexed against. Everywhere else a draft stays a draft.
	 */
	/** The project's deployment branch; empty while none is named (ac-evo-branch-setting). */
	const deploymentBranch = (): string => working.evolution.deploymentBranch ?? '';
	/** The open request bound to a branch, or the one at Build Lyriks named that branch for. */
	const requestOfBranch = (branch: string): ReturnType<typeof lookupRequest> | null => {
		if (!branch) return null;
		const open = working.evolution.requests.filter((r) => r.status === 'open');
		const found =
			open.find((r) => r.code?.branch === branch) ??
			open.find((r) => !r.code && r.stage === 'implementation' && branchNameFor(requestKeyOf(working.evolution.requests, r.id) ?? 'EVO', r.title) === branch);
		return found ? lookupRequest(found.id) : null;
	};

	const crossOnce = async (request: EvolutionRequest, waiverReason?: string): Promise<ActOutcome> => {
		// Validating the verification fixes one commit of the request's branch: none while code is uncommitted or a proof names another (ac-evo-branch-validate).
		if (request.stage === 'implementation') {
			const onCode = verificationCodeRefusal(request, deploymentBranch());
			if (!onCode.ok) return onCode;
		}
		// The freeze waits for the Specification a person stood behind, its actions read with the engine's graph (ac-evo-form-step-lock).
		const specification =
			request.stage === 'coherence' ? specificationHoldOf(view, request, await specificationActionTrails(services, view, request)) : undefined;
		const outcome = crossStageAct(ctx, request, {
			criticalEmptyCount: maturityOf(view, working.features, request).criticalEmptyCount,
			waiverReason,
			specification
		});
		if (!outcome.ok) return outcome;
		if (request.stage === 'implementation' && outcome.request.stage === 'acceptance' && outcome.request.code)
			return { ...outcome, request: withValidation(ctx, outcome.request), summary: `${outcome.summary}. Validated commit: ${outcome.request.code.branch}@${outcome.request.code.codeHead.slice(0, 7)}` };
		if (outcome.request.stage !== 'implementation') return outcome;
		// Checked at the freeze and again at the landing: an amendment whose model
		// no longer applies to the feature as it stands refuses the crossing,
		// rather than building, or writing, a feature without its behaviour.
		const stale = await draftModelsThatNoLongerApply(outcome.request);
		if (stale.length > 0) return staleModels(stale);
		const frozen = await withBaseline(outcome.request);
		return { ...outcome, request: frozen, summary: `${outcome.summary}. Nothing is written into the specification before the change is declared live` };
	};

	const staleModels = (stale: readonly string[]) =>
		refuse(
			`The behaviour model of ${stale.map((line) => line.replace(/\.+$/, '')).join('; ')}.`,
			'Rework the model with apply_behavior_batch on the draft id (simulate_behavior shows it as it stands), then try again. Nothing was written.'
		);

	/**
	 * The landing (ac-evo-req-landing): the one moment a request writes into the
	 * specification, when the change is declared live or the request closes.
	 * Accepting the Build and approving the change write nothing. A request
	 * already landed, under this rule or the earlier one, is left as it is.
	 */
	const landIfDue = async (request: EvolutionRequest, mergeCommit: string | null = null): Promise<ActOutcome> => {
		if (isLanded(request)) return { ok: true, request, summary: '' };
		const stale = await draftModelsThatNoLongerApply(request);
		if (stale.length > 0) return staleModels(stale);
		const adopted = landAdoptions(request);
		const materialised = materialiseDrafts(working.features, request, ctx.at, view.language);
		// Only what the model still has to write lands; what an earlier version
		// wrote is already in the feature (a request reopened and frozen again).
		const written = {
			...materialised,
			request: {
				...materialised.request,
				drafts: materialised.request.drafts.map((draft) => {
					const model = draft.behaviourModel;
					if (!model || model.operations.length === 0 || draft.kind === 'remove') return draft;
					const featureId = draft.materialisedAs ?? draft.baseLeafId;
					if (!featureId) return draft;
					landings.push({
						requestId: materialised.request.id,
						draftName: draft.name || draft.id,
						featureId,
						operations: model.operations,
						mintedIds: model.mintedIds
					});
					return { ...draft, behaviourModel: landBehaviourModel(model, ctx.at) };
				})
			}
		};
		if (written.changed || adopted > 0) {
			working.features = written.features;
			working.featuresChanged = true;
		}
		const data = await landData(written.request);
		const sections = await landSections(data.request);
		if (!sections.ok) return sections;
		const rules = await landRules(sections.request);
		if (!rules.ok) return rules;
		const findings = await landFindings(rules.request, mergeCommit);
		const lines = [
			...written.lines,
			...data.lines,
			...sections.lines,
			...rules.lines,
			...findings.lines,
			...(adopted > 0 ? [`${adopted} addition${adopted === 1 ? '' : 's'} of the code adopted into the spec`] : [])
		];
		return { ok: true, request: findings.request, summary: lines.length > 0 ? `The change is official: ${lines.join('. ')}` : '' };
	};

	/**
	 * The findings of Project health the request settles leave it with the
	 * change, in the same run (ac-evo-draft-findings-landing): each line is
	 * stamped with where it goes, and what the register or a decision by design
	 * receives is written after the dossier, signed by the person who validated
	 * the line. A finding only the engine detects is written nowhere.
	 */
	const landFindings = async (request: EvolutionRequest, mergeCommit: string | null): Promise<{ request: EvolutionRequest; lines: string[] }> => {
		const live = liveFindingDrafts(request.findingDrafts).filter((d) => d.outcome !== 'undecided');
		if (live.length === 0) return { request, lines: [] };
		const register = await services.loadRulesDraft.execute(input.projectId);
		const validatorOf = (draft: FindingDraft) => {
			const validations = fieldValidationOf(request, findingChangeKey(draft), findingChangeFingerprint(draft)).validations;
			const by = (validations.find((v) => v.byKind === 'person' || v.delegated) ?? validations[0])?.by ?? ctx.actor.id;
			return { id: by, name: view.members.find((m) => personKey(m.id) === personKey(by))?.name ?? by };
		};
		const stamped = new Map(live.map((d) => [d.id, settlementOf(d, register)]));
		working.findingLandings = [
			...working.findingLandings,
			{
				requestId: request.id,
				requestKey: requestKeyOf(working.evolution.requests, request.id) ?? 'EVO',
				mergeCommit,
				lines: live.map((draft) => ({ draft, validator: validatorOf(draft) }))
			}
		];
		const settled = live.length;
		const byEngine = [...stamped.values()].filter((v) => v === 'engine').length;
		return {
			request: {
				...request,
				findingDrafts: (request.findingDrafts ?? []).map((d) => {
					const settledAs = stamped.get(d.id);
					return settledAs ? { ...d, materialisedAt: ctx.at, settledAs } : d;
				})
			},
			lines: [
				`${settled} finding${settled === 1 ? '' : 's'} of Project health settled${byEngine > 0 ? ` (${byEngine} read again by the engine on the landed spec)` : ''}`
			]
		};
	};

	/**
	 * The rules the whole product keeps: the request's changes checked again on
	 * the rules as they hold now, as one batch, written into the project's
	 * behaviour right after the dossier is saved (ac-evo-draft-rules).
	 */
	const landRules = async (request: EvolutionRequest): Promise<(ActOutcome & { ok: false }) | { ok: true; request: EvolutionRequest; lines: string[] }> => {
		const live = liveRuleDrafts(request.ruleDrafts);
		if (live.length === 0) return { ok: true, request, lines: [] };
		const refusal = await checkRuleLanding(services, input.projectId, request);
		if (refusal) return refuse(refusal, 'Read the rules again (get_behavior_project), update the change (update_rule_draft) or take it out, then try again. Nothing was written.') as ActOutcome & { ok: false };
		working.ruleLandings = [...working.ruleLandings, { requestId: request.id, operations: ruleLandingOperations(request.ruleDrafts) }];
		return {
			ok: true,
			request: { ...request, ruleDrafts: (request.ruleDrafts ?? []).map((d) => (d.materialisedAt === null ? { ...d, materialisedAt: ctx.at } : d)) },
			lines: [`${live.length} change${live.length === 1 ? '' : 's'} to the rules the whole product keeps`]
		};
	};

	/**
	 * The other parts of the spec, laid with every change of the request and
	 * checked by their own guards now, written through their own save with the
	 * rest of the batch; a change a section moved away from holds the landing
	 * and names itself (ac-evo-draft-section-landing).
	 */
	const landSections = async (request: EvolutionRequest): Promise<(ActOutcome & { ok: false }) | { ok: true; request: EvolutionRequest; lines: string[] }> => {
		const live = liveSectionDrafts(request.sectionDrafts);
		if (live.length === 0) return { ok: true, request, lines: [] };
		const prepared = await prepareSectionLanding(services, input.projectId, request);
		if (!prepared.ok) return refuse(prepared.reason, 'Read the section again (get_section), update the change (update_section_draft) or take it out, then try again. Nothing was written.') as ActOutcome & { ok: false };
		working.sectionLandings = [...working.sectionLandings, ...prepared.landings];
		const pages = [...new Set(live.map((d) => SPEC_PAGES[d.page].name))];
		return {
			ok: true,
			request: { ...request, sectionDrafts: (request.sectionDrafts ?? []).map((d) => (d.materialisedAt === null ? { ...d, materialisedAt: ctx.at } : d)) },
			lines: [`${live.length} change${live.length === 1 ? '' : 's'} written into ${pages.join(', ')}`]
		};
	};

	/**
	 * The data changes, written into the Data section under the ids the request
	 * gave them, only at the landing (ac-evo-draft-data-landing).
	 */
	const landData = async (request: EvolutionRequest): Promise<{ request: EvolutionRequest; lines: string[] }> => {
		const live = request.dataDrafts.filter((d) => d.materialisedAt === null);
		if (live.length === 0) return { request, lines: [] };
		const landing = landingOfData(working.data, live);
		const removedEntities = new Set(landing.removedEntityIds);
		const removedFields = new Set(landing.removedFieldIds);
		const changes = new Map(landing.changedFields.map((c) => [c.fieldId, c]));
		const renamed = new Map(landing.renamed.map((r) => [r.id, r.name]));
		// Every table the landing writes says where it comes from: the request itself and what its drafts cite.
		const cited = [await requestSource(request), ...sourcesCitedByRequest(request).filter((id) => sourceIds.has(id))];
		const withSources = (held: readonly string[] | undefined) => [...new Set([...(held ?? []), ...cited])];
		working.data = {
			...working.data,
			// A table or a field whose id the Data section already holds is merged, never written twice.
			entities: landRows(
				working.data.entities
					.filter((e) => !removedEntities.has(e.id))
					.map((e) => (renamed.has(e.id) ? { ...e, name: renamed.get(e.id)! } : e)),
				landing.model.entities.map((e) => createEntity({ id: e.id, name: e.name, description: e.description, derivedFrom: 'feature', sourceIds: withSources([]) })),
				(held, landed) => ({ ...held, name: landed.name || held.name, description: landed.description || held.description, sourceIds: withSources(held.sourceIds) })
			),
			fields: landRows(
				working.data.fields
					.filter((f) => !removedFields.has(f.id) && !removedEntities.has(f.entityId))
					.map((f) => {
						const c = changes.get(f.id);
						if (!c) return f;
						return {
							...f,
							...(c.name ? { name: c.name } : {}),
							...(c.type ? { type: c.type } : {}),
							...(c.required !== undefined ? { isRequired: c.required } : {}),
							...(c.list !== undefined ? { isList: c.list } : {}),
							...(c.relationTo !== undefined ? { relationTargetEntityId: c.relationTo } : {})
						};
					}),
				landing.model.fields.map((f) =>
					createField(f.entityId, {
						id: f.id,
						name: f.name,
						type: f.type as EntityField['type'],
						isId: f.isId === true,
						isRequired: f.isRequired,
						isList: f.isList,
						relationTargetEntityId: f.relationTargetEntityId
					})
				),
				(held, landed) => ({ ...held, ...landed, id: held.id })
			)
		};
		working.dataChanged = true;
		return {
			request: {
				...request,
				dataDrafts: request.dataDrafts.map((d) =>
					d.materialisedAt === null ? { ...d, materialisedAs: d.kind === 'add' ? d.id.slice(DATA_DRAFT_PREFIX.length) : d.entityId, materialisedAt: ctx.at } : d
				)
			},
			lines: [...landing.lines]
		};
	};

	/**
	 * Where a value given on a touched feature waits while the change is not
	 * official (ac-evo-req-landing): on the request's amendment of that feature,
	 * drafted here when the request had none, never on the feature itself.
	 * Null when the request is frozen and holds no amendment to wait on.
	 */
	const holdingFor = (request: EvolutionRequest, leafId: string | null): { request: EvolutionRequest; homeId: string | null } => {
		if (!leafId || isDraftLeafId(leafId) || isLanded(request)) return { request, homeId: leafId };
		const standing = request.drafts.find((d) => d.baseLeafId === leafId && d.kind !== 'add' && d.materialisedAs === null);
		if (standing) return { request, homeId: standing.id };
		const drafted = addDraftLeafAct(ctx, request, draftInput({ kind: 'amend', baseLeafId: leafId }), knownLeafIds, baseLeaf);
		if (!drafted.ok) return { request, homeId: null };
		return { request: drafted.request, homeId: drafted.request.drafts[drafted.request.drafts.length - 1].id };
	};
	const NOT_HELD = refuse(
		'This request is frozen: nothing it holds changes until it is reopened.',
		'Send it back to its specification (rebrief) to change a value; the next freeze is the next version.'
	);
	/**
	 * The write-through of an accepted value: it lands in the section that owns
	 * it, on the feature's amendment while the change is not official, under the
	 * section's own refusal, and the dossier keeps no copy.
	 */
	const writeProposalThrough =
		(homeId: string | null) =>
		(proposal: Proposal, leafId: string | null): Guarded => {
			const written = saveDossierField(working.features, {
				fieldPath: proposal.targetField,
				leafId: homeId ?? leafId,
				value: proposal.value,
				sourceIds: proposal.citedSourceIds,
				canWriteCanonical: input.actor.role !== 'viewer'
			});
			if (written.status === 'refused') return refuse(written.reason, written.detail);
			working.features = written.draft;
			working.featuresChanged = true;
			return { ok: true };
		};

	/**
	 * What the code added and a person adopted during the Build becomes a
	 * criterion of its feature at the landing, not before: until then it is a
	 * decision on a report line, nothing official.
	 */
	const landAdoptions = (request: EvolutionRequest): number => {
		const meta = { ...(working.features.leafMeta ?? {}) };
		let count = 0;
		for (const line of request.implementationFindings) {
			if (line.decision !== 'adopted' || !line.leafId) continue;
			const leafId = request.drafts.find((d) => d.id === line.leafId)?.baseLeafId ?? line.leafId;
			const current = meta[leafId] ?? {};
			const text = `The product keeps what the code added: ${line.codeStatement || line.requirement}`;
			if ((current.acceptanceCriteria ?? []).some((c) => c.text === text)) continue;
			meta[leafId] = { ...current, acceptanceCriteria: [...(current.acceptanceCriteria ?? []), { id: ctx.newId(), text }] };
			count += 1;
		}
		if (count > 0) working.features = { ...working.features, leafMeta: meta };
		return count;
	};

	/**
	 * What the touched features already held when they joined the frozen request
	 * (ac-evo-impl-baseline): photographed at the first freeze, then, for a
	 * feature a rebrief adds, at the freeze that first carries it. A feature
	 * already photographed is never taken again, so what this request added in
	 * an earlier iteration never turns into something it inherited.
	 */
	const withBaseline = async (request: EvolutionRequest): Promise<EvolutionRequest> => {
		const pending = leavesOutsideBaseline(request);
		if (request.baselineKeys && pending.length === 0) return request;
		// Taken before the drafts' behaviour lands: what the features held then is
		// what the request inherited.
		const [statuses, specs] = await Promise.all([
			mapLimit(pending, 2, (id) => featureStatus(services, id)),
			mapLimit(pending, 2, (id) => specElementsFor(services, input.projectId, id))
		]);
		const covered = request.leafIds.filter((id) => !isDraftLeafId(id));
		return {
			...request,
			baselineKeys: [...new Set([...(request.baselineKeys ?? []), ...baselineKeysOf(statuses, specs)])].sort(),
			baselineLeafIds: covered
		};
	};

	/**
	 * A request with nothing to arbitrate finishes its run in the same act
	 * (ac-evo-req-12): the gates are crossed, the drafts are written, the dossier
	 * closes. Nobody is asked anything, because there is nothing to ask.
	 *
	 * It runs only when the readings themselves have just come back, so it is
	 * predictable: you asked for the impact and the coherence, they said nothing
	 * moves, and the dossier got out of your way.
	 */
	const settle = async (request: EvolutionRequest): Promise<ActOutcome> => {
		let current = request;
		const summaries: string[] = [];
		for (let guardCount = 0; guardCount < STAGE_ORDER.length; guardCount++) {
			if (current.stage === 'delivered') break;
			const crossed = await crossOnce(current);
			// A gate that refuses means there IS something to arbitrate after all.
			// Leave the request where it stands rather than forcing it through.
			if (!crossed.ok) return { ok: true, request: current, summary: summaries.join('. ') };
			current = crossed.request;
			summaries.push(crossed.summary);
		}
		const landed = await landIfDue(current);
		if (!landed.ok) return { ok: true, request: current, summary: summaries.join('. ') };
		const closed = closeRequestAct(ctx, landed.request);
		if (!closed.ok) return { ok: true, request: current, summary: summaries.join('. ') };
		if (landed.summary) summaries.push(landed.summary);
		return {
			ok: true,
			request: closed.request,
			summary: `Nothing moves and nothing contradicts, so this request crossed its gates and closed itself. ${summaries.join('. ')}`
		};
	};

	// The person's operations, then whatever the platform computes on its own
	// once an act leaves a request where a reading is due (ac-evo-imp-7,
	// ac-evo-coh-8, ac-evo-impl-9). An automatic reading that fails never sinks
	// the batch it follows: the act stands, the reading is simply not there yet.
	const queue: { raw: unknown; auto: boolean }[] = input.operations.map((raw) => ({ raw, auto: false }));
	const autoQueued = new Set<string>();
	/** The requests on which the AI asked the person something they answer on the page (ac-evo-live-auto-session). */
	const askedOnPage = new Set<string>();
	for (let index = 0; index < queue.length; index++) {
		const { raw, auto } = queue[index];
		const tracked = readTracked(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {});
		const op = tracked.op;
		// `op` is this batch's discriminator and `kind` is the behavior batch's.
		// Two batches, two spellings, one author switching between them: accept
		// either rather than answer "Unknown operation \"\"" to a batch that named
		// its operation perfectly well.
		const name = str(op.op) || str(op.kind);
		// What git reports names its branch: the request is the one bound to it, or the one at Build Lyriks named it for (feat-evo-code-branch).
		const byBranch = !str(op.requestId) && (name === 'report_code_state' || name === 'report_merge') ? requestOfBranch(str(op.branch)) : null;
		const lookup = str(op.requestId) ? lookupRequest(str(op.requestId)) : byBranch;
		// Results and links carry the full id whatever the caller typed.
		const requestId = lookup?.kind === 'found' ? lookup.request.id : str(op.requestId) || null;
		const record = (outcome: ActOutcome | Guarded | Said, id: string | null = requestId) => {
			if (outcome.ok) {
				if ('request' in outcome) put(outcome.request);
				const summary = 'summary' in outcome ? outcome.summary : 'ok';
				const ignored = auto ? [] : tracked.unread();
				const said = ignored.length > 0 ? `${summary} (ignored, not a field of ${name}: ${ignored.join(', ')})` : summary;
				results.push({ index, op: name, requestId: 'request' in outcome ? outcome.request.id : id, ok: true, summary: auto ? `Automatic: ${summary}` : said, ...(ignored.length > 0 ? { ignored } : {}) });
				if ('request' in outcome && ctx.actor.kind === 'ai_client' && asksOnThePage(op)) askedOnPage.add(outcome.request.id);
				return true;
			}
			if (auto) return true;
			results.push({
				index,
				op: name,
				requestId: id,
				ok: false,
				summary: outcome.reason,
				detail: outcome.detail,
				...(id ? { href: requestPagePath(input.projectId, id, refusalPlace(op as Record<string, unknown>, name)) } : {})
			});
			return false;
		};

		if (!(EVOLUTION_OPERATIONS as readonly string[]).includes(name)) {
			record(refuse(`Unknown operation "${name}".`, `The operations are: ${EVOLUTION_OPERATIONS.join(', ')}.`));
			break;
		}

		if (name === 'open_request') {
			const origin = op.origin;
			// An origin that is present but not one of the six is a typo, not an
			// omission: say so instead of answering the "you named none" refusal,
			// which reads as if the field had been forgotten.
			if (origin !== undefined && origin !== null && !isRequestOrigin(origin)) {
				record(unknownOrigin(origin), null);
				break;
			}
			// Opened on findings of Project health, the request starts with them (ac-cc-open-request).
			const findingIds = strList(op.findingIds);
			// Started from a suggestion, the request carries its deferred omission (criterion 03b7eacf).
			const deferredLineId = str(op.deferredLineId);
			const suggestion = deferredLineId ? deferredSuggestions(working.evolution.requests).find((s) => s.lineId === deferredLineId) : undefined;
			if (deferredLineId && !suggestion) {
				record(refuse('This omission no longer waits for an evolution.', 'A suggestion stands only while its line stays deferred and no evolution carries it.'), null);
				break;
			}
			const opened = openRequestAct(ctx, {
				id: str(op.id) || undefined,
				title: str(op.title) || suggestion?.title || (findingIds.length > 0 ? `Settle ${findingIds.length === 1 ? 'a finding' : `${findingIds.length} findings`} of Project health` : ''),
				origin: isRequestOrigin(origin) ? origin : suggestion ? 'technical_debt' : null,
				requester: str(op.requester),
				leafIds: [...strList(op.leafIds), ...(suggestion?.leafId && knownLeafIds.has(suggestion.leafId) ? [suggestion.leafId] : [])],
				knownLeafIds,
				...(suggestion ? { deferred: { from: { requestId: suggestion.fromRequestId, lineId: suggestion.lineId }, fromKey: suggestion.fromKey, statement: suggestion.statement } } : {})
			});
			let outcome: ActOutcome = opened;
			if (opened.ok && findingIds.length > 0) {
				const contexts = new Map<string, FindingLineContext>();
				for (const id of findingIds) contexts.set(id, await findingContext(id, opened.request.id));
				const withFindings = withFindingsAct(ctx, opened.request, findingIds, (id) => contexts.get(id) ?? { listed: null, settledBy: null, knownLeafIds });
				outcome = withFindings.ok ? { ...withFindings, summary: `${opened.summary}. ${withFindings.summary}` } : withFindings;
			}
			const ok = record(outcome, null);
			if (!ok) break;
			continue;
		}

		// Delegating on every evolution touches no request: the project holds it (ac-evo-llm-delegation).
		ctx.aiDelegated = false;
		if (name === 'delegate_to_ai' && str(op.scope) === 'project') {
			const allowed = canDelegateToAi(ctx.actor, 'project');
			if (!allowed.ok) {
				record(allowed, null);
				break;
			}
			const on = op.on !== false;
			working.evolution = { ...working.evolution, aiDelegations: withDelegation(working.evolution.aiDelegations, ctx.actor.id, on, ctx.at) };
			record({ ok: true, summary: on ? 'Your AI now validates every evolution of the project' : 'Your AI no longer validates every evolution of the project' }, null);
			continue;
		}

		// A click made outside a request is answered on the project: a question in its block's thread, a re-reading by one sentence (feat-ai-session).
		if (name === 'answer_click') {
			if (ctx.actor.kind !== 'ai_client') {
				record(refuse('Only the AI that took the click answers it.', 'The person reads the answer where the click was made.'), null);
				break;
			}
			const clickId = str(op.clickId);
			const click = (working.evolution.clicks ?? []).find((c) => c.id === clickId);
			const outcome = answerProjectClick(working.evolution, ctx.actor.id, clickId, str(op.text), ctx.at);
			if (!outcome.ok || !click) {
				record(outcome.ok ? refuse('No click of yours is in hand: wait for the next one with await_evolution_event.', '') : outcome, null);
				break;
			}
			// A message of Ask my AI: its answer reads in the person's private conversation; a change it carries is shown
			// only once a dry run lands it on the specification as it is now, refused to the AI otherwise (rule 45810bdd).
			if (click.kind === 'chat') {
				const answer = chatAnswerOf(op);
				const shape = proposalShapeRefusal(answer.proposal);
				if (shape) {
					record(refuse(shape, 'The person validates a change on the page; it must be complete to be read.'), null);
					break;
				}
				const errors = answer.proposal ? await proposalErrors(services, input.projectId, answer.proposal) : [];
				if (errors.length > 0) {
					record(
						refuse(
							`The change does not land on the specification as it is now: ${errors.slice(0, 5).join(' | ')}`,
							'Read the feature as it is now, correct the operations and answer again: the person sees nothing until it lands.'
						),
						null
					);
					break;
				}
				chatReplies.push({ click, answer });
			}
			working.evolution = outcome.draft;
			if (click.kind === 'ask_block' && click.threadId) {
				const rosterName = view.members.find((m) => m.id === ctx.actor.id)?.name;
				threadReplies.push({ threadId: click.threadId, messageId: click.messageId, text: str(op.text).trim(), personId: ctx.actor.id, rosterName });
			}
			record(
				{
					ok: true,
					summary:
						click.kind === 'chat'
							? `Answered in the conversation ${click.title}`
							: click.kind === 'ask_block'
								? `Answered in the thread of ${click.title}`
								: `Re-reading of ${click.title} answered`
				},
				null
			);
			continue;
		}

		// Where the project deploys from touches no request: the project holds it (ac-evo-branch-setting).
		if (name === 'set_deployment_branch') {
			const branch = str(op.branch).trim();
			const allowed = deploymentBranchAllowed(ctx, branch);
			if (!allowed.ok) {
				record(allowed, null);
				break;
			}
			working.evolution = { ...working.evolution, deploymentBranch: branch };
			record({ ok: true, summary: `The project deploys from ${branch}: each request's code is written on a branch derived from it and merged back into it` }, null);
			continue;
		}

		if (name === 'register_source') {
			const cancelled = ctx.actor.kind === 'ai_client' ? working.evolution.requests.map((r) => aiMayAct(r, ctx.actor.id)).find((g) => !g.ok) : undefined;
			if (cancelled) {
				record(cancelled, null);
				break;
			}
			const outcome = await registerSource(op);
			if (!record(outcome, null)) break;
			continue;
		}

		const request = lookup?.kind === 'found' ? lookup.request : undefined;
		if (!request) {
			record(
				refuse(
					lookup ? unresolvedRequestReason(str(op.requestId), lookup) : 'requestId is required.',
					'get_evolution lists the requests with their ids (any unique prefix of four characters or more names one); open_request creates one.'
				),
				null
			);
			break;
		}
		// Every id inside a request is named like the request itself: in full, or
		// by any unique prefix of four characters or more, the way reports quote it.
		const ambiguous = expandInnerRefs(op, request);
		if (ambiguous) {
			record(refuse(ambiguous, 'Give more of the id: get_evolution lists them in full.'));
			break;
		}
		// The person's AI validates under their delegation on this request, or on every evolution (ac-evo-llm-delegation-powers).
		ctx.aiDelegated = ctx.actor.kind === 'ai_client' && delegatedTo(ctx.actor.id, request, working.evolution);
		// The AI of a live session: nothing lands after the person cancelled, and
		// nothing it could not undo while it is on a click (ac-evo-live-cancel).
		if (ctx.actor.kind === 'ai_client' && !auto) {
			const mayAct = aiMayAct(request, ctx.actor.id);
			if (!mayAct.ok) {
				record(mayAct);
				break;
			}
			if (NOT_UNDOABLE.has(name) && onAClick()) {
				record(refuse(UNDOABLE_ONLY, 'Call await_evolution_event first: once you are off the click, the person validates or refuses what you wrote.'));
				break;
			}
		}

		let outcome: ActOutcome;
		/**
		 * Need and Solution stand validated once every answer they hold is
		 * (ac-evo-req-19), when a person validates the last one; accepting a
		 * proposal validates nothing (ac-evo-hist-accept-awaits-validation). The Solution is
		 * prose: its own texts stand it, the features it touches are read at the
		 * Impact analysis (ac-evo-sol-prose).
		 */
		const standStepWhenEveryAnswerIs = (done: ActOutcome, key: string): ActOutcome => {
			const step = key.startsWith('00-need.') ? 'need' : key.startsWith('step.solution.') ? 'solution' : null;
			if (!done.ok || !step || isStepValidated(done.request, step)) return done;
			const tally = inputValidation({ ...view, features: working.features }, done.request, step);
			if (tally.total === 0 || tally.validated !== tally.total) return done;
			const whole = validateStepAct(ctx, done.request, step);
			return whole.ok ? { ok: true, request: whole.request, summary: `${done.summary}. ${whole.summary}: every answer is validated` } : done;
		};
		/**
		 * A new number of validations per answer reads every answer again
		 * (ac-evo-req-validations-per-answer): the Need or the Solution stands
		 * validated once every answer it holds reaches it, and no longer stands on
		 * answers that fall short of it.
		 */
		const rereadAnswers = (done: ActOutcome, before: EvolutionRequest, always = false): ActOutcome => {
			if (!done.ok || (!always && done.request.validationsPerAnswer === before.validationsPerAnswer)) return done;
			let next: ActOutcome = done;
			for (const step of ['need', 'solution'] as const) {
				if (!next.ok) break;
				const tally = inputValidation({ ...view, features: working.features }, next.request, step);
				const every = tally.total > 0 && tally.validated === tally.total;
				if (every && !isStepValidated(next.request, step)) {
					const whole = validateStepAct(ctx, next.request, step);
					if (whole.ok) next = { ok: true, request: whole.request, summary: `${next.summary}. ${whole.summary}: every answer is validated` };
				} else if (!every && isStepValidated(next.request, step)) {
					next = { ok: true, request: reopenSteps(next.request, [step]), summary: `${next.summary}. ${step === 'need' ? 'Need' : 'Solution'} no longer stands validated` };
				}
			}
			return next;
		};
		switch (name as EvolutionOperationName) {
			case 'update_request': {
				const origin = op.origin;
				// Same rule as at the door: an unknown code is refused rather than
				// dropped, which would report a change that never happened.
				if (origin !== undefined && origin !== null && !isRequestOrigin(origin)) {
					outcome = unknownOrigin(origin);
					break;
				}
				outcome = rereadAnswers(
					updateRequestAct(
						ctx,
						request,
						{
							title: typeof op.title === 'string' ? op.title : undefined,
							origin: isRequestOrigin(origin) ? origin : undefined,
							requester: typeof op.requester === 'string' ? op.requester : undefined,
							validationsPerAnswer: typeof op.validationsPerAnswer === 'number' ? op.validationsPerAnswer : undefined
						},
						view.members.length
					),
					request
				);
				break;
			}
			case 'set_leaves':
				outcome = setLeavesAct(ctx, request, strList(op.leafIds), knownLeafIds);
				break;
			case 'add_draft_leaf':
				outcome = badCriteria(op) ? CRITERIA_REFUSAL : addDraftLeafAct(ctx, request, draftInput(op), knownLeafIds, baseLeaf);
				break;
			case 'update_draft_leaf':
				outcome = badCriteria(op)
					? CRITERIA_REFUSAL
					: updateDraftLeafAct(ctx, request, str(op.draftId), draftInput(op), knownLeafIds, baseLeaf);
				break;
			case 'add_data_draft':
				outcome = addDataDraftAct(ctx, request, dataDraftInput(op), working.data);
				break;
			case 'add_section_draft': {
				const page = str(op.page);
				const refusal = isSpecPage(page) ? await checkSectionEdits(services, input.projectId, page, records(op.edits)) : null;
				outcome = addSectionDraftAct(ctx, request, sectionDraftInput(op), { refusal });
				break;
			}
			case 'update_section_draft': {
				const current = (request.sectionDrafts ?? []).find((d) => d.id === sectionDraftIdOf(op));
				const refusal = current && op.edits !== undefined ? await checkSectionEdits(services, input.projectId, current.page, records(op.edits)) : null;
				outcome = updateSectionDraftAct(ctx, request, sectionDraftIdOf(op), sectionDraftInput(op), { refusal });
				break;
			}
			case 'remove_section_draft':
				outcome = removeSectionDraftAct(ctx, request, sectionDraftIdOf(op));
				break;
			case 'add_rule_draft': {
				const operations = records(op.operations);
				// Checked on the product as this request would leave it (ac-evo-draft-rules).
				outcome = addRuleDraftAct(ctx, request, ruleDraftInput(op), { refusal: await checkRuleOperations(services, input.projectId, operations, request) });
				break;
			}
			case 'update_rule_draft': {
				const refusal = op.operations !== undefined ? await checkRuleOperations(services, input.projectId, records(op.operations), request, ruleDraftIdOf(op)) : null;
				outcome = updateRuleDraftAct(ctx, request, ruleDraftIdOf(op), ruleDraftInput(op), { refusal });
				break;
			}
			case 'remove_rule_draft':
				outcome = removeRuleDraftAct(ctx, request, ruleDraftIdOf(op));
				break;
			case 'add_finding_draft':
				outcome = addFindingDraftAct(
					ctx,
					request,
					{
						findingId: str(op.findingId),
						...(isFindingOutcome(op.outcome) ? { outcome: op.outcome } : {}),
						...(typeof op.reason === 'string' ? { reason: op.reason } : {}),
						...(op.sourceIds !== undefined ? { sourceIds: strList(op.sourceIds) } : {})
					},
					await findingContext(str(op.findingId), request.id)
				);
				break;
			case 'update_finding_draft': {
				const id = findingDraftIdOf(op);
				const current = (request.findingDrafts ?? []).find((d) => d.id === id);
				outcome = updateFindingDraftAct(
					ctx,
					request,
					id,
					{
						...(isFindingOutcome(op.outcome) ? { outcome: op.outcome } : {}),
						...(typeof op.reason === 'string' ? { reason: op.reason } : {}),
						...(op.sourceIds !== undefined ? { sourceIds: strList(op.sourceIds) } : {})
					},
					{ listed: current ? (await findingContext(current.findingId, request.id)).listed : null }
				);
				break;
			}
			case 'remove_finding_draft':
				outcome = removeFindingDraftAct(ctx, request, findingDraftIdOf(op));
				break;
			case 'update_data_draft':
				outcome = updateDataDraftAct(ctx, request, str(op.dataDraftId), dataDraftInput(op), working.data);
				break;
			case 'remove_data_draft':
				outcome = removeDataDraftAct(ctx, request, str(op.dataDraftId));
				break;
			case 'remove_draft_leaf':
				outcome = removeDraftLeafAct(ctx, request, str(op.draftId));
				break;
			case 'set_draft_behaviour':
				outcome = await setDraftBehaviour(services, ctx, request, op);
				break;
			case 'propose':
				outcome = proposeAct(
					ctx,
					request,
					{
						fieldPath: str(op.fieldPath),
						leafId: str(op.leafId) || null,
						value: text(op.value),
						reasoning: str(op.reasoning),
						citedSourceIds: strList(op.citedSourceIds),
						whatWasRead: op.whatWasRead === undefined ? undefined : text(op.whatWasRead),
						whatWasInferred:
							op.whatWasInferred === undefined ? undefined : text(op.whatWasInferred),
						readVsInferred: typeof op.readVsInferred === 'boolean' ? op.readVsInferred : undefined,
						question: str(op.question),
						choices: strList(op.choices),
						multiple: op.multiple === true
					},
					{ sourceExists: (id) => sourceIds.has(id), bannedWords }
				);
				break;
			case 'decide_proposal': {
				const decision = str(op.decision);
				const decisionInput =
					decision === 'accept'
						? ({ decision: 'accept', sense: op.sense === undefined ? undefined : str(op.sense) } as const)
						: decision === 'refuse'
							? ({ decision: 'refuse', comment: str(op.comment) } as const)
							: decision === 'reword'
								? ({ decision: 'reword', value: text(op.value) } as const)
								: null;
				if (!decisionInput) {
					outcome = refuse('decision must be accept, refuse or reword.', 'Four decisions exist on a proposal; a comment goes through post_on_field.');
					break;
				}
				const target = request.proposals.find((p) => p.id === str(op.proposalId));
				const held = decision === 'accept' && target ? holdingFor(request, leafOf(target)) : { request, homeId: null };
				if (decision === 'accept' && target && leafOf(target) && held.homeId === null) {
					outcome = NOT_HELD;
					break;
				}
				outcome = decideProposalAct(ctx, held.request, str(op.proposalId), decisionInput, writeProposalThrough(held.homeId));
				break;
			}
			case 'decide_proposal_line': {
				// One line of a list suggestion, accepted or rejected on its own (ac-evo-llm-line-decision).
				const decision = str(op.decision);
				if (decision !== 'accept' && decision !== 'refuse') {
					outcome = refuse('decision must be accept or refuse.', 'A line of a suggestion is accepted or rejected; the whole suggestion is reworded with decide_proposal.');
					break;
				}
				const target = request.proposals.find((p) => p.id === str(op.proposalId));
				const leafId = target ? leafOf(target) : null;
				const held = decision === 'accept' && target ? holdingFor(request, leafId) : { request, homeId: null };
				if (decision === 'accept' && leafId && held.homeId === null) {
					outcome = NOT_HELD;
					break;
				}
				// The line is judged against the answer as the page reads it, so both sides see the same suggestion.
				const needKey = target ? needKeyOf(target.targetField) : null;
				const current = !target ? '' : needKey ? request.need[needKey] : leafId ? readTouchedField(working.features, request, target.targetField, leafId).value : '';
				outcome = decideProposalLineAct(ctx, held.request, str(op.proposalId), { line: str(op.line), decision, current }, writeProposalThrough(held.homeId));
				break;
			}
			case 'delegate_to_ai':
				outcome = delegateToAiAct(ctx, request, op.on !== false);
				break;
			case 'withdraw_proposal':
				outcome = withdrawProposalAct(ctx, request, str(op.proposalId));
				break;
			case 'name_validators': {
				// An answer is named by its field path, a step validated as a whole by its step (ac-evo-req-named-validators).
				const step = str(op.step);
				const target = step ? (isWholeValidatedStep(step) ? stepTarget(step) : `step:${step}`) : fieldKey(str(op.fieldPath), str(op.leafId) || null);
				outcome = nameValidatorsAct(ctx, request, { target, people: strList(op.people) });
				// The answers are read again at once: the Need or the Solution stands, or no longer stands.
				outcome = rereadAnswers(outcome, request, true);
				break;
			}
			case 'tag_reviewers':
				outcome = tagReviewersAct(ctx, request, str(op.proposalId), strList(op.reviewerIds), roster);
				break;
			case 'mark_open_question':
				outcome = markOpenQuestionAct(ctx, request, str(op.fieldPath), str(op.leafId) || null);
				break;
			case 'answer_open_question':
				outcome = answerOpenQuestionAct(ctx, request, str(op.fieldPath), str(op.leafId) || null);
				break;
			case 'edit_message':
				outcome = editMessageAct(ctx, request, { messageId: str(op.messageId), body: str(op.body) });
				break;
			case 'validate_topic':
			case 'resolve_topic':
			case 'reopen_topic':
				outcome = ruleTopicAct(ctx, request, {
					messageId: str(op.messageId),
					ruling: name === 'validate_topic' ? 'validated' : name === 'resolve_topic' ? 'resolved' : 'open'
				});
				break;
			case 'post_on_field':
				outcome = postOnFieldAct(ctx, request, str(op.fieldPath), str(op.leafId) || null, str(op.body), str(op.replyTo) || null, {
					asks: op.asks === true,
					choices: strList(op.choices),
					multiple: op.multiple === true,
					// The AI carrying a private exchange onto the question it concerns keeps it between the person and itself (ac-evo-live-scope).
					...(op.private === true && ctx.actor.kind === 'ai_client' ? { privateTo: ctx.actor.id } : {}),
					// The texts it offers, each at its place, for the person to accept (ac-evo-live-comment-suggests).
					...(op.writes !== undefined ? { writes: cleanWrites(Array.isArray(op.writes) ? op.writes.filter((w): w is Record<string, unknown> => !!w && typeof w === 'object') : []) } : {})
				});
				break;
			case 'decide_thread_suggestion':
				outcome =
					op.decision === 'accept' || op.decision === 'refuse'
						? decideThreadSuggestionAct(ctx, request, { messageId: str(op.messageId), decision: op.decision, fieldPath: str(op.fieldPath), line: str(op.line) })
						: refuse('decision must be accept or refuse.', 'Accept writes every text of the suggestion at its place; Refuse writes nothing.');
				break;
			case 'publish_exchange':
				outcome = publishExchangeAct(ctx, request, str(op.messageId));
				break;
			case 'cancel_click': {
				// "Cancel the request in progress": every place the AI wrote for the click goes back (ac-evo-live-cancel).
				if (ctx.actor.kind !== 'person') {
					outcome = refuse('Only the person whose AI took it cancels it.', 'Cancel shows where the person made the click, while their own AI is on it.');
					break;
				}
				const cancellable = cancellableClick(request, ctx.actor.id, str(op.clickId) || undefined);
				if (!cancellable.ok) {
					outcome = cancellable;
					break;
				}
				if (cancellable.journal.some((e) => e.section === 'documents')) await loadDocuments();
				const undo = undoJournal(
					{ evolution: working.evolution, ...(documents ? { documents } : {}), features: working.features, data: working.data },
					cancellable.journal
				);
				const touched = (section: JournalSection) => undo.undone.some((e) => e.section === section);
				working.evolution = undo.roots.evolution as ProjectEvolutionDraft;
				if (touched('documents')) {
					documents = undo.roots.documents as ProjectDocumentsDraft;
					documentsChanged = true;
				}
				if (touched('features')) {
					working.features = undo.roots.features as typeof working.features;
					working.featuresChanged = true;
				}
				if (touched('data')) {
					working.data = undo.roots.data as typeof working.data;
					working.dataChanged = true;
				}
				const restored = working.evolution.requests.find((r) => r.id === request.id) ?? request;
				const kept = undo.kept.map(placeOf);
				outcome = {
					ok: true,
					// Cancelling the click a step prefill sent stops the run (ac-evo-live-prefill-step).
					request: stopStepPrefillOnClick(markCancelled(restored, ctx.actor.id, cancellable.click.id, { at: ctx.at, undone: undo.undone.length, kept }), cancellable.click.id, ctx.at),
					summary: `Request ${cancellable.click.id} cancelled: ${undo.undone.length} ${undo.undone.length === 1 ? 'place' : 'places'} put back${
						kept.length > 0 ? `; kept, changed since: ${kept.join(', ')}` : ''
					}`
				};
				break;
			}
			case 'start_session':
				// One session per person and project (ac-ai-session-project): a request never opens one of its own any more.
				outcome = refuse(
					'A session is the project\'s: open it with start_evolution_session, given the project and, to start there, this request.',
					'One session per person and project hands the clicks of every page; a session of one request alone would miss them.'
				);
				break;
			case 'end_session':
				outcome = endSessionAct(ctx, request, str(op.sessionId) || null);
				break;
			case 'send_click': {
				// `clickKind`, never `kind`: `kind` names the operation itself in a batch.
				outcome =
					op.clickKind === 'ticket'
						? sendTicketClickAct(ctx, request, { ticketKey: str(op.ticketKey), message: text(op.message) })
						: op.clickKind === 'build'
							? sendBuildClickAct(ctx, request, text(op.brief))
						: op.clickKind === 'close'
							? isCloseStep(op.step)
								? sendCloseClickAct(ctx, request, op.step, text(op.brief))
								: refuse('A close click names its step: merge, sync or branch.', 'What happens next sends one click per step of the close.')
						: isAiClickKind(op.clickKind)
					? sendClickAct(ctx, request, {
							kind: op.clickKind,
							fieldPath: str(op.fieldPath),
							leafId: str(op.leafId) || null,
							section: strList(op.section),
							body: str(op.body),
							replyTo: str(op.replyTo) || null,
							step: str(op.step)
						})
					: refuse('clickKind must be prefill, ask, draw, ticket or build.', 'Prefill with my AI, Ask my AI and Draw with my AI ask about the request; ticket hands the AI the closing message for the ticket; build hands it the brief of the frozen version.');
				break;
			}
			case 'report_ticket_post':
				outcome = reportTicketPostAct(ctx, request, {
					ticketKey: str(op.ticketKey),
					tool: str(op.tool),
					commented: op.commented === true,
					movedToDone: op.movedToDone === true,
					note: str(op.note)
				});
				break;
			case 'withdraw_click':
				outcome = withdrawClickAct(ctx, request, str(op.clickId));
				break;
			case 'answer_suggestion':
				outcome = answerSuggestionAct(ctx, request, str(op.proposalId), str(op.body), strList(op.section));
				break;
			case 'start_step_prefill':
				outcome = startStepPrefillAct(ctx, request, str(op.step), stepPrefillSections(op.sections));
				break;
			case 'stop_step_prefill':
				outcome = stopStepPrefillAct(ctx, request);
				break;
			case 'run_impact': {
				const hypothesis = isImpactHypothesis(op.hypothesis) ? op.hypothesis : request.impactReport.hypothesis;
				const depth = num(op.depth, request.impactReport.depth);
				const graph = await services.loadKnowledgeGraph.execute(input.projectId);
				// The walk runs over the product as THIS request would leave it: the
				// graph with its drafts laid on top, and nothing written anywhere
				// (ac-evo-ovl-1, ac-evo-ovl-4). Exactly one overlay, so two requests
				// never read each other's drafts (ac-evo-ovl-6).
				const overlaid = overlayGraph(
					{ nodes: graph.nodes, edges: graph.edges },
					request.drafts
				);
				const spec = propagateImpact({
					request,
					hypothesis,
					depth,
					graph: overlaid,
					terms: view.glossaryTerms.map((t) => ({ id: t.id, term: t.term, synonymsAllowed: t.synonymsAllowed })),
					draftNodeIds: draftNodeIds(request.drafts),
					// The other pages of the spec and the rules are walked from too (ac-evo-draft-section-impact).
					changeStarts: [...sectionDraftStartNodeIds(request.sectionDrafts), ...ruleDraftStartNodeIds(request.ruleDrafts)],
					// What the diagrams use as it stands is walked from too (ac-evo-imp-used).
					usedLeafIds: usedFeatures(request).map((u) => u.featureId).filter((id) => knownLeafIds.has(id)),
					lang: view.language
				});
				// The code plane: the files anchoring the touched features and the
				// features the spec plane reached, read off the synced index.
				const depthByFeature: Record<string, number> = {
					...reachedFeatures(spec),
					...Object.fromEntries(request.leafIds.map((id) => [id, 1]))
				};
				// A drafted feature has no code to anchor on, by construction: it does
				// not exist. The code plane reads the real leaves only, and says so by
				// leaving the draft out rather than reporting an empty file list for it.
				const featureIds = Object.keys(depthByFeature).filter((id) => knownLeafIds.has(id));
				const statuses = Object.fromEntries(
					await mapLimit(featureIds, 2, async (id) => [id, await featureStatus(services, id)] as const)
				);
				const code = deriveCodeImpact({ request, hypothesis, statuses, depthByFeature, leafNames, lang: view.language });
				// The proof plane: each draft with a runnable model, proved as the
				// feature stands and as the draft would leave it. Nothing is written.
				// Proof by the solver is an Enterprise capability: elsewhere there is no proof plane.
				const modelled = services.proofs ? request.drafts.filter((d) => d.behaviourModel) : [];
				const proofImpact = await mapLimit(modelled, 1, async (draft) => {
					const target = resolveWalkTarget(draft.id, { requests: [request] }, false);
					const result = target.ok
						? await services.whatIf.execute({ target: target.target, projectId: input.projectId })
						: { kind: 'refused' as const, error: target.message };
					// An amendment is named by the feature it stands for.
					const base = draft.kind === 'add' ? null : draft.baseLeafId;
					const name = draft.name || (base ? leafNames[base] : '') || draft.id;
					return toDraftProofImpact({ id: draft.id, name }, result, ctx.at);
				});
				outcome = runImpactAct(ctx, request, hypothesis, depth, [...spec, ...code], proofImpact);
				break;
			}
			case 'run_coherence': {
				// The same request gives the same reading whatever asked for it: the behaviour
				// verification the analysis folds in is brought up to date first, within a deadline,
				// so a cold cache never moves the score (ac-evo-coh-same-reading).
				const behaviourUpToDate = await settlesWithin(
					services.behaviorAdvisories.prime?.(input.projectId) ?? Promise.resolve(),
					BEHAVIOUR_READ_DEADLINE_MS
				);
				const { analysis } = await services.loadCoherenceDraft.execute(input.projectId);
				const mapped = mapCoherenceAnalysis({ request, analysis, leafNames, at: ctx.at, partial: !behaviourUpToDate });
				// The engine walks what EXISTS, so it has nothing to say about a
				// capability that does not exist yet. What only a draft can contradict
				// is computed here and published beside it (ac-evo-ovl-2).
				const fromDrafts = draftCoherence({
					request,
					leafNames,
					dependsOn: Object.fromEntries(
						Object.entries(working.features.leafMeta ?? {}).map(([id, meta]) => [
							id,
							meta.dependsOn ?? []
						])
					),
					bannedWords: view.glossaryTerms.flatMap((t) =>
						(t.synonymsAvoid ?? []).map((avoid) => ({ avoid, prefer: t.term }))
					),
					lang: view.language
				});
				// The other parts of the spec, read as the change would leave them (ac-evo-draft-section-read).
				const sectionReadings = liveSectionDrafts(request.sectionDrafts).length > 0 ? await readSectionDrafts(services, input.projectId, request) : [];
				const fromSections = sectionDraftCoherence({
					request,
					bannedWords: view.glossaryTerms.flatMap((t) => (t.synonymsAvoid ?? []).map((avoid) => ({ avoid, prefer: t.term }))),
					noLongerApplies: Object.fromEntries(sectionReadings.map((r) => [r.id, r.noLongerApplies])),
					lang: view.language
				});
				// The rules the whole product keeps, proved by the engine with the change (ac-evo-draft-rules).
				const fromRules = ruleDraftCoherence({ request, proof: await proveRuleDrafts(services, input.projectId, request), lang: view.language });
				const findings = [...mapped.findings, ...fromDrafts, ...fromSections, ...fromRules];
				// Project health as the change would leave it, beside how it reads now (ac-evo-coh-after).
				const after = projectHealthAfter({
					gaps: analysis.gaps,
					findingDrafts: request.findingDrafts,
					register: await services.loadRulesDraft.execute(input.projectId),
					requestFindings: findings
				});
				outcome = runCoherenceAct(ctx, request, { ...mapped, report: { ...mapped.report, health: after }, findings }, { partial: !behaviourUpToDate });
				break;
			}
			case 'decide_finding':
				outcome = decideFindingAct(
					ctx,
					request,
					str(op.findingId),
					op.decision === 'reopen' ? 'reopen' : 'accept_risk',
					str(op.reason)
				);
				break;
			case 'build_implementation_report': {
				// The neighbours worth reading: what the touched features depend on and
				// what depends on them, which is where a change disturbs a span.
				const meta = working.features.leafMeta ?? {};
				const neighbourIds = new Set<string>();
				for (const leafId of request.leafIds) {
					for (const dep of meta[leafId]?.dependsOn ?? []) neighbourIds.add(dep);
					for (const [otherId, other] of Object.entries(meta))
						if ((other.dependsOn ?? []).includes(leafId)) neighbourIds.add(otherId);
				}
				for (const leafId of request.leafIds) neighbourIds.delete(leafId);
				// Before the change is official, a draft is read as the feature its model
				// would make, and the code that names what it adds as the entries held on
				// the request (ac-evo-impl-held): the report judges version N, not the
				// specification as it stood before it.
				// A feature a rebrief added is photographed before its first report, so its backlog reads inherited.
				const based = request.stage === 'implementation' && !isLanded(request) ? await withBaseline(request) : request;
				const subjects = isLanded(based) ? based.leafIds : [...touchedLeafIds(based)];
				const near = await mapLimit([...neighbourIds], 2, async (id) => [id, await featureStatus(services, id)] as const);
				const read = await mapLimit(subjects, 2, async (id) => {
					const draft = pendingDraftFor(based, id);
					if (!draft || draft.kind === 'remove')
						return { id, status: await featureStatus(services, id), spec: await specElementsFor(services, input.projectId, id) };
					const baseId = draft.baseLeafId;
					const [snapshot, official, baseSnapshot] = await Promise.all([
						draftFeature(services, working.evolution, draft.id),
						baseId ? featureStatus(services, baseId) : Promise.resolve(null),
						baseId ? services.readBehaviorFeature.execute(input.projectId, baseId).catch(() => null) : Promise.resolve(null)
					]);
					const signed = working.features.leafMeta?.[draft.id]?.acceptanceCriteria ?? [];
					const criteria = [...draft.acceptanceCriteria, ...signed.filter((c) => !draft.acceptanceCriteria.some((d) => d.id === c.id))];
					const officialKeys = new Set(
						draftIndexKeys((baseSnapshot?.feature as Record<string, unknown> | undefined) ?? null, {
							acceptanceCriteria: (baseId ? working.features.leafMeta?.[baseId]?.acceptanceCriteria : undefined) ?? []
						})
					);
					const held = heldStatusOf(snapshot, based.heldImplementation, criteria, officialKeys);
					return { id, status: mergedStatus(official, held), spec: specElementsOf(snapshot) };
				});
				const own = read.map((r) => [r.id, r.status] as const);
				const specs = read.map((r) => [r.id, r.spec] as const);
				const lines = deriveImplementationReport({
					request: { ...based, leafIds: subjects },
					statuses: Object.fromEntries(own),
					neighbours: Object.fromEntries(near),
					spec: Object.fromEntries(specs),
					leafNames,
					baseline: based.baselineKeys ? new Set(based.baselineKeys) : null,
					lang: view.language
				});
				// The data changes are lines too (ac-evo-impl-data), to build until a person validates them.
				const tableNames = new Map(working.data.entities.map((e) => [e.id, e.name]));
				const dataLines = dataReportLines(based.dataDrafts, based, (id) => tableNames.get(id) ?? id);
				outcome = buildReportAct(ctx, based, [...lines, ...dataLines]);
				break;
			}
			case 'cross_stage':
				outcome = await crossOnce(
					request,
					typeof op.waiverReason === 'string' ? op.waiverReason : undefined
				);
				break;
			case 'lift_waiver':
				outcome = liftWaiverAct(ctx, request);
				break;
			case 'rebrief':
				outcome = rebriefAct(ctx, request);
				break;
			case 'decide_line': {
				const decision = op.decision;
				const verdict = op.verdict;
				outcome = decideLineAct(ctx, request, {
					lineId: str(op.lineId) || undefined,
					verdict: isImplementationVerdict(verdict) ? verdict : undefined,
					decision: isLineDecision(decision) ? decision : 'undecided'
				});
				// Adopting an addition the code made puts it in the spec for real: it
				// becomes an acceptance criterion of the feature it was read on. Before
				// the change is declared live, the decision waits on the line and lands with
				// the change (landAdoptions); after, it is written now.
				if (outcome.ok && decision === 'adopted' && isLanded(outcome.request)) {
					const before = new Map(request.implementationFindings.map((l) => [l.id, l.decision]));
					const meta = { ...(working.features.leafMeta ?? {}) };
					for (const line of outcome.request.implementationFindings) {
						if (line.decision !== 'adopted' || before.get(line.id) === 'adopted' || !line.leafId) continue;
						const current = meta[line.leafId] ?? {};
						const text = `The product keeps what the code added: ${line.codeStatement || line.requirement}`;
						meta[line.leafId] = {
							...current,
							acceptanceCriteria: [...(current.acceptanceCriteria ?? []), { id: ctx.newId(), text }]
						};
						working.featuresChanged = true;
					}
					if (working.featuresChanged) working.features = { ...working.features, leafMeta: meta };
				}
				break;
			}
			case 'log_observation':
				outcome = logObservationAct(ctx, request, {
					body: str(op.body),
					type: isObservationType(op.type) ? op.type : undefined,
					target: isWalkthroughTarget(op.target) ? op.target : undefined
				});
				break;
			case 'rule_observation': {
				const ruling = op.ruling;
				if (!isObservationRuling(ruling) || ruling === 'open') {
					outcome = refuse('ruling must be validated, invalidated, deferred or requalified.', 'A thread ends in exactly one ruling.');
					break;
				}
				outcome = ruleObservationAct(ctx, request, str(op.observationId), ruling, str(op.reason));
				break;
			}
			case 'fold_back': {
				const leafId = str(op.leafId);
				const text = str(op.text);
				// Before the change is live, the criterion waits on the draft that stands
				// for that feature and lands with the rest (ac-evo-walk-7); never on the feature.
				if (!isLanded(request)) {
					const standing = request.drafts.find((d) => d.id === leafId || (d.baseLeafId === leafId && d.materialisedAs === null));
					if (!standing) {
						outcome = refuse(
							'This feature has no draft on the request to carry the remark.',
							'Write the remark back into a feature the request drafts: it lands with the change when it is declared live.'
						);
						break;
					}
					outcome = foldBackAct(ctx, request, { observationId: str(op.observationId), leafId, kind: 'acceptance_criterion', text }, () => ({ ok: true }));
					if (outcome.ok) {
						const criterion = { id: ctx.newId(), text: text.trim() };
						outcome = {
							...outcome,
							request: {
								...outcome.request,
								drafts: outcome.request.drafts.map((d) =>
									d.id === standing.id ? { ...d, acceptanceCriteria: [...d.acceptanceCriteria, criterion] } : d
								)
							}
						};
					}
					break;
				}
				outcome = foldBackAct(
					ctx,
					request,
					{ observationId: str(op.observationId), leafId, kind: 'acceptance_criterion', text },
					() => {
						const meta = working.features.leafMeta ?? {};
						const current = meta[leafId] ?? {};
						working.features = {
							...working.features,
							leafMeta: {
								...meta,
								[leafId]: {
									...current,
									acceptanceCriteria: [
										...(current.acceptanceCriteria ?? []),
										{ id: ctx.newId(), text: text.trim() }
									]
								}
							}
						};
						working.featuresChanged = true;
						return { ok: true };
					}
				);
				break;
			}
			case 'close_request': {
				// Closing declares the change live like a deployment does: with a deployment branch named, only the merge may (ac-evo-branch-merge).
				const byHand = declareByHandRefusal(request.code, deploymentBranch(), bringsCode(request));
				if (!byHand.ok) {
					outcome = byHand;
					break;
				}
				// Checked before anything lands: a deleted or closed request never writes into the specification again.
				const closable = closeRequestAct(ctx, request);
				if (!closable.ok) {
					outcome = closable;
					break;
				}
				// What the request carries lands first.
				const landed = await landIfDue(request);
				if (!landed.ok) {
					outcome = landed;
					break;
				}
				outcome = closeRequestAct(ctx, landed.request);
				if (outcome.ok && landed.summary) outcome = { ...outcome, summary: `${outcome.summary}. ${landed.summary}` };
				break;
			}
			case 'update_need': {
				// Only the questions actually sent are written; a list question may
				// arrive as an array, one entry per line.
				const patch: Partial<Record<NeedKey, string>> = {};
				for (const key of NEED_KEYS) if (op[key] !== undefined) patch[key] = text(op[key]);
				outcome = updateNeedAct(ctx, request, patch);
				break;
			}
			case 'mark_step_not_applicable':
				outcome = markStepNotApplicableAct(ctx, request, {
					step: str(op.step),
					notApplicable: op.notApplicable !== false,
					reason: str(op.reason)
				});
				break;
			case 'answer_field': {
				const leafId = str(op.leafId) || null;
				const held = holdingFor(request, leafId);
				if (leafId && held.homeId === null) {
					outcome = NOT_HELD;
					break;
				}
				const answered = answerFieldAct(ctx, held.request, { fieldPath: str(op.fieldPath), leafId, value: text(op.value) });
				if (answered.ok) {
					const written = saveDossierField(working.features, {
						fieldPath: str(op.fieldPath),
						leafId: held.homeId,
						value: text(op.value),
						canWriteCanonical: input.actor.role !== 'viewer'
					});
					if (written.status === 'refused') {
						outcome = refuse(written.reason, written.detail);
						break;
					}
					working.features = written.draft;
					working.featuresChanged = true;
				}
				outcome = answered;
				break;
			}
			case 'update_step_description':
				outcome = updateStepDescriptionAct(ctx, request, { step: str(op.step), description: text(op.description) });
				break;
			case 'withdraw_field_verdict':
				outcome = withdrawFieldVerdictAct(ctx, request, { key: fieldKey(str(op.fieldPath), str(op.leafId) || null) });
				break;
			case 'skip_question': {
				const key = fieldKey(str(op.fieldPath), str(op.leafId) || null);
				outcome = skipQuestionAct(ctx, request, {
					fieldPath: str(op.fieldPath),
					leafId: str(op.leafId) || null,
					reason: text(op.reason),
					liveValue: liveValueOf(request, key, working.features)
				});
				break;
			}
			case 'unskip_question':
				outcome = unskipQuestionAct(ctx, request, { fieldPath: str(op.fieldPath), leafId: str(op.leafId) || null });
				break;
			case 'refuse_field': {
				const key = fieldKey(str(op.fieldPath), str(op.leafId) || null);
				outcome = refuseFieldAct(ctx, request, { key, liveValue: elementOrLiveValue(op, request, key, working.features), reason: text(op.reason) });
				break;
			}
			case 'answer_step':
				outcome = answerStepAct(ctx, request, { step: str(op.step), question: str(op.question), answer: text(op.answer) });
				break;
			case 'redraw_diagram':
				outcome = redrawDiagramAct(ctx, request, { diagram: text(op.diagram), step: str(op.step) });
				break;
			case 'write_text_from_diagram':
				outcome = writeTextFromDiagramAct(ctx, request, { step: str(op.step), question: str(op.question), answer: text(op.answer) });
				break;
			case 'validate_field': {
				const key = fieldKey(str(op.fieldPath), str(op.leafId) || null);
				// A finding is validated once what becomes of it is chosen (ac-evo-draft-findings-read).
				const finding = findingDraftOfKey(request.findingDrafts, key);
				const undecided = finding ? findingValidationRefusal(finding) : null;
				if (undecided) {
					outcome = refuse(undecided, 'update_finding_draft {findingDraftId, outcome: "fixed" | "kept", reason} chooses it.');
					break;
				}
				outcome = validateFieldAct(ctx, request, { key, liveValue: elementOrLiveValue(op, request, key, working.features) });
				outcome = standStepWhenEveryAnswerIs(outcome, key);
				break;
			}
			case 'ask_question':
				outcome = askQuestionAct(ctx, request, {
					step: str(op.step),
					question: str(op.question),
					why: str(op.why),
					fieldKey: str(op.fieldPath) ? fieldKey(str(op.fieldPath), str(op.leafId) || null) : null
				});
				break;
			case 'resolve_question':
				outcome = resolveQuestionAct(ctx, request, {
					questionId: str(op.questionId),
					resolution: op.resolution === 'set_aside' ? 'set_aside' : 'answered',
					text: text(op.text)
				});
				break;
			case 'validate_step':
				{
					// Need and Solution are validated answer by answer, never as a whole over unvalidated answers.
					const step = str(op.step);
					const tally = step === 'need' || step === 'solution' ? inputValidation({ ...view, features: working.features }, request, step) : null;
					outcome =
						tally && tally.total > 0 && tally.validated < tally.total
							? refuse(
									`Validate each answer of ${step === 'need' ? 'the Need' : 'the Solution'}: ${tally.validated} of ${tally.total} validated.`,
									'validate_field {fieldPath, leafId?} on each answer; the step stands validated once the last one is.'
								)
							: validateStepAct(ctx, request, step);
				}
				break;
			case 'withdraw_step_validation':
				outcome = withdrawStepValidationAct(ctx, request, str(op.step));
				break;
			case 'declare_deployment': {
				// With a deployment branch named, the merge declares the change live, never a hand (ac-evo-branch-merge).
				const byHand = declareByHandRefusal(request.code, deploymentBranch(), bringsCode(request));
				if (!byHand.ok) {
					outcome = byHand;
					break;
				}
				// Checked before anything lands: a deleted request never writes, a closed one keeps who declared it and when.
				const declarable = declareDeploymentAct(ctx, request, {});
				if (!declarable.ok) {
					outcome = declarable;
					break;
				}
				// Live: the change becomes official now, never before (ac-evo-req-landing).
				const landed = await landIfDue(request);
				if (!landed.ok) {
					outcome = landed;
					break;
				}
				outcome = declareDeploymentAct(ctx, landed.request, {
					releaseId: typeof op.releaseId === 'string' ? op.releaseId : null,
					note: str(op.note)
				});
				if (outcome.ok && landed.summary) outcome = { ...outcome, summary: `${outcome.summary}. ${landed.summary}` };
				break;
			}
			case 'cancel_request':
				outcome = cancelRequestAct(ctx, request, text(op.reason));
				// The branch is to delete; the deployment branch never held its code (ac-evo-branch-cancel).
				if (outcome.ok && request.code) outcome = { ...outcome, summary: `${outcome.summary}. Delete its branch: git branch -D ${request.code.branch}` };
				break;
			case 'report_code_state':
				outcome = reportCodeStateAct(ctx, request, deploymentBranch(), branchNameFor(requestKeyOf(working.evolution.requests, request.id) ?? 'EVO', request.title), {
					repository: parseCodeRepository(op.repository),
					history: parseBranchHistory(op.history),
					branch: str(op.branch).trim(),
					baseCommit: str(op.baseCommit).trim() || null,
					head: str(op.head).trim(),
					codeHead: str(op.codeHead).trim(),
					clean: op.clean !== false,
					proofsChecked: num(op.proofsChecked, 0),
					proofsOnOtherCommits: num(op.proofsOnOtherCommits, 0)
				});
				break;
			case 'report_merge': {
				const merge = { branch: str(op.branch).trim(), into: str(op.into).trim(), mergeCommit: str(op.mergeCommit).trim(), containsValidated: op.containsValidated === true };
				// Checked before anything lands: a merge that does not count writes nothing.
				const merged = declareByMergeAct(ctx, request, deploymentBranch(), merge);
				if (!merged.ok) {
					outcome = merged;
					break;
				}
				// The specification and the deployment branch change together: the drafts land at the merge (ac-evo-branch-merge).
				const landed = await landIfDue(request, merge.mergeCommit || null);
				if (!landed.ok) {
					outcome = landed;
					break;
				}
				// The code the branch brought becomes the reference the code changed outside Lyriks is read against (ac-evo-branch-not-outside).
				const brought = await readCodeBroughtBy(services, input.projectId, request.code!).catch(() => ({}));
				outcome = declareByMergeAct(ctx, landed.request, deploymentBranch(), merge, brought);
				if (outcome.ok && landed.summary) outcome = { ...outcome, summary: `${outcome.summary}. ${landed.summary}` };
				break;
			}
			case 'reopen_request':
				outcome = reopenRequestAct(ctx, request);
				break;
			case 'delete_request': {
				outcome = deleteRequestAct(ctx, request);
				// The rows its drafts were holding signed values in can never be
				// signed again, so they go with the request rather than sitting in
				// the features section naming nothing.
				if (outcome.ok) {
					const pruned = pruneDraftMeta(
						working.features,
						request.drafts.map((d) => d.id)
					);
					if (pruned.changed) {
						working.features = pruned.features;
						working.featuresChanged = true;
					}
				}
				break;
			}
			default:
				outcome = refuse(`Unknown operation "${name}".`, `The operations are: ${EVOLUTION_OPERATIONS.join(', ')}.`);
		}
		if (!record(outcome)) break;
		// An act of the AI answers the click it was taking care of ("Record the AI's answer").
		const answer = outcome.ok ? answerOf(name, op) : null;
		if (answer && outcome.ok) {
			const answered = recordAnswerAct(ctx, outcome.request, answer);
			if (answered) put(answered);
		}
		// The Impact analysis is a step, not a second click: once the steps before it
		// stand validated and nothing waits for a signature, the request enters it
		// on its own. Validating is optional, so a request whose steps nobody
		// validated is moved on by hand. The freeze stays a deliberate act.
		if (
			// Validating the last answer of Need or Solution completes the step as surely as validating it (ac-evo-req-23).
			(name === 'validate_step' || name === 'mark_step_not_applicable' || name === 'validate_field') &&
			outcome.ok &&
			outcome.request.stage === 'specification' &&
			unvalidatedSpecSteps(outcome.request).length === 0 &&
			gateFor(outcome.request, 'coherence', 0).ok
		) {
			const entered = crossStageAct({ ...ctx, actor: { ...ctx.actor, kind: 'person' }, soloWorkspace: true }, outcome.request, { criticalEmptyCount: 0 });
			// The crossing is lent a person's standing to pass its guard, but the history
			// keeps who actually acted: an assistant stays an assistant (ac-evo-hist-auto-crossing-author).
			if (entered.ok) put(attributeTo(entered.request, outcome.request.history.length, ctx.actor.kind));
		}
		// The readings have just come back. If they say nothing moves and nothing
		// contradicts, the dossier costs its author nothing further.
		if (
			(name === 'run_coherence' || name === 'run_impact') &&
			outcome.ok &&
			outcome.request.stage === 'specification' &&
			nothingToArbitrate(outcome.request)
		) {
			const settled = await settle(outcome.request);
			if (settled.ok && settled.request.stage !== 'specification')
				record(settled, settled.request.id);
		}
		const standing = requestId ? lookupRequest(requestId) : null;
		if (standing?.kind === 'found') {
			const due = dueReadings(standing.request);
			const id = standing.request.id;
			if (due.impact.length > 0 && !autoQueued.has(`${id}:impact`)) {
				autoQueued.add(`${id}:impact`);
				for (const hypothesis of due.impact) queue.push({ raw: { op: 'run_impact', requestId: id, hypothesis, depth: 2 }, auto: true });
				queue.push({ raw: { op: 'run_coherence', requestId: id }, auto: true });
			}
			if (due.report && !autoQueued.has(`${id}:report`)) {
				autoQueued.add(`${id}:report`);
				queue.push({ raw: { op: 'build_implementation_report', requestId: id }, auto: true });
			}
		}
	}

	if (results.some((r) => !r.ok)) return { ok: false, status: 422, results };

	// The texts of a step and its diagram follow each other in a session: a write that left them apart sends the
	// person's AI the Draw click that catches the other side up (ac-evo-live-follow).
	for (const after of working.evolution.requests) {
		const before = view.draft.requests.find((r) => r.id === after.id);
		if (!before || before === after) continue;
		const followed = followUpClicks(before, after, ctx.actor.id, ctx.at, ctx.newId);
		if (followed !== after) put(followed);
	}

	// What the AI of a live session wrote while it is on a click, journaled with
	// what it replaced so the person can cancel it ("The AI writes for the click it is on").
	if (journaled && ctx.actor.kind === 'ai_client') {
		const personId = ctx.actor.id;
		const changesOf = (): JournalEntry[] => [
			...journalChanges('evolution', view.draft, working.evolution, isSessionBookkeeping),
			...(documentsChanged && documents && documentsAtLoad ? journalChanges('documents', documentsAtLoad, documents) : []),
			...(working.featuresChanged ? journalChanges('features', view.features, working.features) : []),
			...(working.dataChanged ? journalChanges('data', view.data, working.data) : [])
		];
		let changes = changesOf();
		const holder = working.evolution.requests.find((r) => r.id === journaled.id);
		const click = holder ? currentClickOf(holder, personId) : null;
		// An answer that changed anything other than the thread publishes the exchange with that change (ac-evo-live-ask).
		if (holder && click?.kind === 'ask' && click.messageId && changes.some((c) => !isThreadPlace(c))) {
			const published = publishExchange(holder, personId, click.messageId);
			if (published.ok) {
				put(published.request);
				changes = changesOf();
			}
		}
		const current = working.evolution.requests.find((r) => r.id === journaled.id);
		if (current)
			put(journalOnCurrentClick(current, personId, changes, { evolution: working.evolution, ...(documents ? { documents } : {}), features: working.features, data: working.data }));
	}

	const heldBy = (summary: string): ApplyOutcome => ({
		ok: false,
		status: 409,
		results: [...results, { index: results.length, op: 'land_section_changes', requestId: null, ok: false, summary }]
	});
	// Nothing moves unless all this batch saves still stands as it read it (criterion d9c67477): the
	// sections live in several stores and share no transaction, so the refusal comes before the first write.
	if ((await services.sectionDocuments.currentRevision(input.projectId, 'evolution')) !== view.revision) return { ok: false, status: 409, results };
	const claimed = await claimSections(services.draftLock, publishSectionChange, input.projectId, input.origin, [
		...(working.featuresChanged ? [{ section: 'features', readAt: featuresReadAt }] : []),
		...(working.dataChanged ? [{ section: 'data', readAt: dataReadAt }] : [])
	]);
	if (!claimed.ok) return heldBy(`The ${claimed.section} section was changed by someone else while this batch ran. Nothing was written: read it again and retry.`);
	const { claims } = claimed;

	// Persist: the canonical section first (it is what an accepted value IS),
	// then the dossier under the revision it was read at.
	try {
		// The register first, under the revision it was read at: a Documents edit made
		// meanwhile refuses this batch whole rather than being overwritten by it.
		if (documentsChanged && documents) {
			const written = await services.saveDocumentsDraft.execute(documents, { expectedRevision: documentsRevision, origin: input.origin });
			if (!written) {
				await claims.release();
				return { ok: false, status: 409, results };
			}
		}
		// The other parts of the spec a landing writes, each through its own save, before the rest: a section
		// that moved since the landing laid the change on it refuses the batch whole (ac-evo-draft-section-landing).
		if (working.sectionLandings.length > 0) {
			const written = await writeSectionLandings(services, input.projectId, working.sectionLandings, input.origin);
			if (!written.ok) {
				await claims.release();
				return heldBy(written.reason);
			}
		}
	} catch (e) {
		await claims.release();
		throw e;
	}
	if (working.featuresChanged) await claims.land('features', () => services.saveFeaturesDraft.execute(working.features));
	// The Data section moves only when a request's data changes land (ac-evo-draft-data-landing).
	if (working.dataChanged) await claims.land('data', () => services.saveDataDraft.execute(working.data));
	const saved = await services.saveEvolutionDraft.execute(working.evolution, {
		expectedRevision: view.revision,
		origin: input.origin
	});
	if (!saved) {
		const sectionsWritten = documentsChanged || working.sectionLandings.length > 0 || working.featuresChanged || working.dataChanged;
		if (!sectionsWritten) return { ok: false, status: 409, results };
		return heldBy('The dossier was changed by someone else at the last moment, after the sections of this batch were written. Read it again before retrying.');
	}
	// The AI's answers to questions on blocks go into their threads once the batch stands,
	// signed for the person under the name their question reads under (ac-ai-session-ask-block).
	const threads = threadReplies.length > 0 ? ((await services.loadDiscussions.execute(input.projectId).catch(() => null))?.document.threads ?? []) : [];
	for (const reply of threadReplies) {
		const question = threads.find((t) => t.id === reply.threadId)?.messages.find((m) => m.id === reply.messageId);
		const author = aiAnswerAuthor(reply.personId, question, reply.rosterName);
		const posted = await services.actOnDiscussion.execute(input.projectId, { kind: 'reply', threadId: reply.threadId, text: reply.text }, author, input.origin);
		if (!posted.ok) console.warn('[evolution] could not post the AI answer in its thread:', posted.refusal);
	}
	for (const reply of chatReplies) {
		if (!(await recordChatAnswer(services, input.projectId, reply.click, reply.answer, input.origin))) console.warn('[evolution] could not record the AI answer in its conversation');
	}
	// The features now exist; their behaviour lands through the ordinary write
	// path, with the ids the draft's model was authored and simulated with.
	for (const landing of landings) {
		const landed = await services.authorBehavior.execute({
			projectId: input.projectId,
			featureId: landing.featureId,
			operations: landing.operations,
			mintedIds: landing.mintedIds
		});
		const ok = landed.batch?.ok === true;
		results.push({
			index: results.length,
			op: 'land_draft_behaviour',
			requestId: landing.requestId,
			ok,
			summary: ok
				? `Behaviour model of "${landing.draftName}" written into feature ${landing.featureId} (${landing.operations.length} operations)`
				: `The behaviour model of "${landing.draftName}" could not be written into feature ${landing.featureId}: ${
						landed.batch?.errors?.slice(0, 3).join(' | ') ?? 'the engine did not answer'
					}. The feature exists without it; apply the draft's operations with apply_behavior_batch.`
		});
		if (ok) void services.scheduleBackSync(input.projectId).catch(() => {});
	}
	// The rules the whole product keeps, written as the project batch writes them, after the
	// behaviour of the request's features: a rule may read a state only that behaviour declares (ac-evo-draft-rules).
	for (const landing of working.ruleLandings) {
		const landed = await landRuleDrafts(services, input.projectId, landing.operations);
		results.push({
			index: results.length,
			op: 'land_rule_changes',
			requestId: landing.requestId,
			ok: landed.ok,
			summary: landed.ok
				? `The rules the whole product keeps were written (${landing.operations.length} operation${landing.operations.length === 1 ? '' : 's'})`
				: `The rules the whole product keeps could not be written: ${landed.reason}. Apply the request's operations with apply_project_behavior_batch.`
		});
	}
	// The findings of Project health the landed requests settled, after their behaviour: the register first, then the decisions by design (ac-evo-draft-findings-landing).
	for (const landing of working.findingLandings) {
		const written = await writeFindingLanding(services, input.projectId, landing, input.origin, ctx.at);
		results.push({ index: results.length, op: 'settle_findings', requestId: landing.requestId, ok: written.ok, summary: written.summary });
	}
	services.implementationCoverage.invalidate(input.projectId);
	// Every evolution this batch closed moves the Specification 360° one version, read off the spec as it now stands.
	await captureClosingBaselines(services, { projectId: input.projectId, before: view.draft, after: working.evolution, origin: input.origin });

	// The touched requests as cards, read back off the saved state; the dossier
	// itself is one get_evolution away, so a batch answer stays small.
	const after: EvolutionView = await loadEvolutionView(services, input.projectId);
	const requests = [...working.touched]
		.map((id) => after.draft.requests.find((r) => r.id === id))
		.filter((r): r is EvolutionRequest => r !== undefined)
		.map((r) => {
			const card = requestCard(after, r, { withNext: true });
			// Asked on the page with no session of its own: the answer would not reach the AI, so opening one comes first.
			// A session of the whole project covers the request too (ac-ai-session-project).
			const owed = askedOnPage.has(r.id) && !openSessionOf(r, input.actor.id) && !openProjectSessionOf(working.evolution, input.actor.id);
			return owed && card.next ? { ...card, next: sessionFirst(card.next) } : card;
		});
	return { ok: true, results, revision: saved.revision, savedAt: saved.savedAt, requests };
}
