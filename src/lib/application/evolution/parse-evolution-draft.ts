import type { DraftProofImpact, ProofChanges, ProofScopeEntry } from '$lib/domain/evolution/proof-impact';
import { SECTION_DRAFT_PREFIX, isSpecPage, sectionEditsIssue, type SectionDraft, type SectionEdit } from '$lib/domain/evolution';
import { RULE_DRAFT_PREFIX, ruleOperationsIssue, type RuleDraft } from '$lib/domain/evolution';
import { FINDING_DRAFT_PREFIX, isFindingOutcome, type FindingDraft, type FindingSettlement, type ProjectHealthAfter } from '$lib/domain/evolution';
import type { AiDelegation } from '$lib/domain/evolution';
import { isProjectClickKind, type ProjectClick } from '$lib/domain/evolution';
import { HISTORY_LISTED, withoutCredentials, type BranchHistory, type CodeRepository, type CodeTrack } from '$lib/domain/evolution';
import type { DiagramAlignment, TechnicalAlignment, TextAlignment } from '$lib/domain/evolution';
import {
	createEmptyEvolutionDraft,
	createEmptyNeed,
	createEmptyStepDescriptions,
	createEmptyStepAnswers,
	DESCRIBED_STEPS,
	STEP_QUESTIONS,
	type StepAnswers,
	type CustomQuestion,
	type FieldValidation,
	type NamedValidators,
	type FieldVersion,
	type StepDescriptions,
	isSkippableStep,
	isValidatedStep,
	NEED_KEYS,
	type StepValidation,
	type Deployment,
	type RequestNeed,
	type StepSkip,
	isAuthorKind,
	isCoherenceAxis,
	isFindingSeverity,
	isHistoryEntryType,
	isImpactHypothesis,
	isCodeWork,
	isImpactNodeKind,
	isImpactSection,
	isImpactSeverity,
	isImplementationVerdict,
	isInjectionKind,
	isLineDecision,
	isObservationRuling,
	isObservationType,
	isProposalDecision,
	isRequestOrigin,
	isRequestStage,
	isRequestStatus,
	isWalkthroughTarget,
	isCanonicalSection,
	isFieldThreadState,
	DRAFT_LEAF_PREFIX,
	MAX_IMPACT_DEPTH,
	blockById,
	fieldKey,
	isLeafScoped,
	type CoherenceFinding,
	type DraftBehaviourNote,
	type DraftBehaviourModel,
	type DraftLeaf,
	type EvolutionRequest,
	type FieldSignature,
	type FieldThread,
	type FieldThreadMessage,
	type FrozenVersion,
	type VersionSnapshot,
	type DataDraft,
	DATA_DRAFT_PREFIX,
	isDataFieldType,
	type GateWaiver,
	type HistoryEntry,
	type ImpactFinding,
	type ImplementationFinding,
	type Iteration,
	type Observation,
	type ObservationMessage,
	type ProjectEvolutionDraft,
	type Proposal,
	isAiClickKind,
	isCloseStep,
	isDrawableStep,
	isSessionEndReason,
	type StepPrefill,
	type StepPrefillState,
	type AiClick,
	type CloseStep,
	type AiClickState,
	type JournalEntry,
	type JournalSection,
	type RequestCancellation,
	type RequestDeferredFrom,
	type HeardProgress,
	type LiveSession,
	type TicketPost
} from '$domain/evolution';

/**
 * Anti-corruption parse for the Evolution draft.
 *
 * Nothing crosses this boundary unchecked: every enum falls back to its safe
 * default, every number is clamped to the range the specification allows, and a
 * row without a usable id is dropped rather than half-read. The one shape rule
 * the parser enforces beyond typing is the request invariant that a main leaf is
 * never also a secondary one.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const strList = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];

function num(v: unknown, fallback: number, min?: number, max?: number): number {
	const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
	const lower = min === undefined ? n : Math.max(min, n);
	return max === undefined ? lower : Math.min(max, lower);
}

/** Rows keyed by a non-empty, unique id; anything else is skipped. */
function rows(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: Record<string, unknown>[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const record = item as Record<string, unknown>;
		const id = record.id;
		if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
		seen.add(id);
		out.push(record);
	}
	return out;
}

function parseWaiver(src: Record<string, unknown>): GateWaiver {
	return {
		id: src.id as string,
		stage: isRequestStage(src.stage) ? src.stage : 'implementation',
		reason: str(src.reason),
		grantedBy: str(src.grantedBy),
		grantedAt: str(src.grantedAt),
		liftedBy: nullableStr(src.liftedBy),
		liftedAt: nullableStr(src.liftedAt)
	};
}

function parseSignature(src: Record<string, unknown>): FieldSignature {
	return {
		id: src.id as string,
		key: str(src.key),
		signerId: str(src.signerId),
		signedAt: str(src.signedAt),
		signedValue: str(src.signedValue),
		voidedAt: nullableStr(src.voidedAt),
		voidedBy: nullableStr(src.voidedBy)
	};
}

function parseTopicRuling(src: unknown): Pick<FieldThreadMessage, 'ruling'> {
	if (!src || typeof src !== 'object') return {};
	const r = src as Record<string, unknown>;
	return (r.state === 'validated' || r.state === 'resolved') && typeof r.by === 'string' && typeof r.at === 'string'
		? { ruling: { state: r.state, by: r.by, at: r.at } }
		: {};
}

function parseThreadMessage(src: Record<string, unknown>): FieldThreadMessage {
	return {
		id: src.id as string,
		author: str(src.author),
		authorKind: isAuthorKind(src.authorKind) ? src.authorKind : 'person',
		body: str(src.body),
		postedAt: str(src.postedAt),
		// Earlier texts carry no id: read as plain records, never through `rows`.
		...(Array.isArray(src.earlier)
			? {
					earlier: src.earlier
						.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
						.map((e) => ({ body: str(e.body), at: str(e.at) }))
				}
			: {}),
		...(typeof src.editedAt === 'string' ? { editedAt: src.editedAt } : {}),
		...(typeof src.replyTo === 'string' && src.replyTo !== '' ? { replyTo: src.replyTo } : {}),
		...parseTopicRuling(src.ruling),
		...(typeof src.privateTo === 'string' && src.privateTo !== '' ? { privateTo: src.privateTo } : {}),
		...(src.awaitsAnswer === true ? { awaitsAnswer: true as const } : {}),
		...(strList(src.choices).length > 0 ? { choices: strList(src.choices) } : {}),
		...(src.multiple === true ? { multiple: true as const } : {}),
		...parseSuggestion(src.suggests, src.suggestion),
  ...(Array.isArray(src.requirementDecisions) ? { requirementDecisions: src.requirementDecisions.flatMap((raw) => {
   const d = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
   return typeof d.fieldPath === 'string' && typeof d.line === 'string' && typeof d.by === 'string' && typeof d.at === 'string' && (d.state === 'accepted' || d.state === 'refused')
    ? [{ fieldPath: d.fieldPath, line: d.line, by: d.by, at: d.at, state: d.state as 'accepted' | 'refused' }] : [];
  }) } : {})
	};
}

/** The texts an AI message offers and how a person decided them (ac-evo-live-comment-suggests). */
function parseSuggestion(suggests: unknown, suggestion: unknown): Pick<FieldThreadMessage, 'suggests' | 'suggestion'> {
	const writes = Array.isArray(suggests)
		? suggests
				.filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
				.map((w) => ({ fieldPath: str(w.fieldPath), value: str(w.value) }))
				.filter((w) => w.fieldPath !== '' && w.value !== '')
		: [];
	if (writes.length === 0) return {};
	const d = suggestion && typeof suggestion === 'object' ? (suggestion as Record<string, unknown>) : null;
	const decided = d && (d.state === 'accepted' || d.state === 'refused') && typeof d.by === 'string' && typeof d.at === 'string';
	return { suggests: writes, ...(decided ? { suggestion: { state: d.state as 'accepted' | 'refused', by: d.by as string, at: d.at as string } } : {}) };
}

function parseFieldThread(src: Record<string, unknown>): FieldThread {
	return {
		id: src.id as string,
		key: str(src.key),
		state: isFieldThreadState(src.state) ? src.state : 'open',
		// A message with no author answers none of the questions a thread exists for.
		messages: rows(src.messages)
			.map(parseThreadMessage)
			.filter((m) => m.author.trim() !== ''),
		changeValue: nullableStr(src.changeValue),
		changedBy: nullableStr(src.changedBy),
		changedAt: nullableStr(src.changedAt)
	};
}

/**
 * The data changes of a request (ac-evo-draft-data). Read as plain records:
 * a change to an existing field names it by `fieldId` and carries no id of its
 * own, so `rows` (which drops id-less rows) is never used on them.
 */
function parseDataDrafts(value: unknown): DataDraft[] {
	const plain = (v: unknown): Record<string, unknown>[] =>
		Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
	const optBool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
	return plain(value)
		.filter((d) => typeof d.id === 'string' && d.id.startsWith(DATA_DRAFT_PREFIX))
		.map((d) => ({
			id: d.id as string,
			kind: d.kind === 'amend' || d.kind === 'remove' ? d.kind : 'add',
			entityId: typeof d.entityId === 'string' ? d.entityId : null,
			name: str(d.name),
			description: str(d.description),
			addFields: plain(d.addFields)
				.filter((f) => typeof f.id === 'string')
				.map((f) => ({
					id: f.id as string,
					name: str(f.name),
					type: isDataFieldType(f.type) ? f.type : 'string',
					required: f.required === true,
					list: f.list === true,
					relationTo: typeof f.relationTo === 'string' ? f.relationTo : null
				})),
			changeFields: plain(d.changeFields)
				.filter((c) => typeof c.fieldId === 'string')
				.map((c) => ({
					fieldId: c.fieldId as string,
					...(typeof c.name === 'string' ? { name: c.name } : {}),
					...(isDataFieldType(c.type) ? { type: c.type } : {}),
					...(optBool(c.required) !== undefined ? { required: c.required as boolean } : {}),
					...(optBool(c.list) !== undefined ? { list: c.list as boolean } : {}),
					...(c.relationTo === null || typeof c.relationTo === 'string' ? { relationTo: c.relationTo as string | null } : {})
				})),
			removeFields: strList(d.removeFields),
			materialisedAs: typeof d.materialisedAs === 'string' ? d.materialisedAs : null,
			materialisedAt: typeof d.materialisedAt === 'string' ? d.materialisedAt : null
		}));
}

/** The section changes, read back edit by edit: an edit that no longer reads well formed is dropped rather than replayed. */
function parseSectionDrafts(value: unknown): SectionDraft[] {
	const plain = (v: unknown): Record<string, unknown>[] =>
		Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
	return plain(value)
		.filter((d) => typeof d.id === 'string' && d.id.startsWith(SECTION_DRAFT_PREFIX) && isSpecPage(d.page))
		.map((d) => ({
			id: d.id as string,
			page: d.page as SectionDraft['page'],
			summary: str(d.summary),
			edits: plain(d.edits).filter((e) => sectionEditsIssue([e]) === null) as unknown as SectionEdit[],
			sourceIds: strList(d.sourceIds),
			materialisedAt: typeof d.materialisedAt === 'string' ? d.materialisedAt : null
		}));
}

/** The changes to the rules the whole product keeps, read back as they were drafted. */
function parseRuleDrafts(value: unknown): RuleDraft[] {
	const plain = (v: unknown): Record<string, unknown>[] =>
		Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
	return plain(value)
		.filter((d) => typeof d.id === 'string' && d.id.startsWith(RULE_DRAFT_PREFIX) && ruleOperationsIssue(plain(d.operations)) === null)
		.map((d) => ({
			id: d.id as string,
			summary: str(d.summary),
			operations: plain(d.operations),
			sourceIds: strList(d.sourceIds),
			materialisedAt: typeof d.materialisedAt === 'string' ? d.materialisedAt : null
		}));
}

/** The findings of Project health a request settles, read back as they were named (ac-evo-draft-findings). */
function parseFindingDrafts(value: unknown): FindingDraft[] {
	const plain = (v: unknown): Record<string, unknown>[] =>
		Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
	const settlements: readonly FindingSettlement[] = ['register', 'by_design', 'engine'];
	return plain(value)
		.filter((d) => typeof d.id === 'string' && d.id.startsWith(FINDING_DRAFT_PREFIX) && typeof d.findingId === 'string' && d.findingId !== '')
		.map((d) => ({
			id: d.id as string,
			findingId: d.findingId as string,
			title: str(d.title),
			featureRef: typeof d.featureRef === 'string' && d.featureRef !== '' ? d.featureRef : null,
			blocking: d.blocking === true,
			outcome: isFindingOutcome(d.outcome) ? d.outcome : 'undecided',
			reason: str(d.reason),
			sourceIds: strList(d.sourceIds),
			materialisedAt: typeof d.materialisedAt === 'string' ? d.materialisedAt : null,
			...(settlements.includes(d.settledAs as FindingSettlement) ? { settledAs: d.settledAs as FindingSettlement } : {})
		}));
}

/** Project health now and after the change, as the last coherence check read it (ac-evo-coh-after). */
function parseHealthAfter(value: unknown): ProjectHealthAfter | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const src = value as Record<string, unknown>;
	const headline = (v: unknown) => {
		const h = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
		const verdict = h.verdict === 'strong' || h.verdict === 'watch' || h.verdict === 'critical' ? h.verdict : 'watch';
		return { score: num(h.score, 0, 0, 100), verdict, total: num(h.total, 0, 0), blocking: num(h.blocking, 0, 0) } as ProjectHealthAfter['now'];
	};
	// Keyed by findingId, not id: rows() would skip them.
	const listed = (v: unknown) =>
		(Array.isArray(v) ? v : [])
			.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as Record<string, unknown>).findingId === 'string')
			.map((r) => ({ findingId: r.findingId as string, title: str(r.title) }));
	return {
		now: headline(src.now),
		after: headline(src.after),
		leaving: listed(src.leaving),
		expectedToLeave: listed(src.expectedToLeave),
		undecided: num(src.undecided, 0, 0),
		coming: rows(src.coming).filter((r) => typeof r.id === 'string').map((r) => ({ id: r.id as string, title: str(r.title) }))
	};
}

function parseFrozenVersion(src: Record<string, unknown>): FrozenVersion {
	const snapshot = parseVersionSnapshot(src.snapshot);
	return { version: num(src.version, 0, 0), at: str(src.at), by: str(src.by), ...(snapshot ? { snapshot } : {}) };
}

/**
 * The copy a freeze kept of its version (ac-evo-freeze-5). Read back field by
 * field like the rest of the dossier, so a copy written by an older or a
 * foreign writer never carries anything the page does not expect.
 */
function parseVersionSnapshot(value: unknown): VersionSnapshot | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const src = value as Record<string, unknown>;
	const criteria = (v: unknown) =>
		rows(v)
			.filter((c) => typeof c.id === 'string')
			.map((c) => ({ id: c.id as string, text: str(c.text) }));
	const data = Array.isArray(src.data)
		? parseDataDrafts(src.data).map(({ materialisedAs: _a, materialisedAt: _b, ...d }) => d)
		: undefined;
	return {
		...(data ? { data } : {}),
		...(Array.isArray(src.sections) ? { sections: parseSectionDrafts(src.sections).map(({ id, page, summary, edits }) => ({ id, page, summary, edits })) } : {}),
		...(Array.isArray(src.rules) ? { rules: parseRuleDrafts(src.rules).map(({ id, summary, operations }) => ({ id, summary, operations })) } : {}),
		...(Array.isArray(src.findings) ? { findings: parseFindingDrafts(src.findings).map(({ id, findingId, title, featureRef, blocking, outcome, reason }) => ({ id, findingId, title, featureRef, blocking, outcome, reason })) } : {}),
		need: parseNeed(src.need),
		steps: parseStepDescriptions(src.steps),
		...(src.answers && typeof src.answers === 'object' ? { answers: parseStepAnswers(src.answers) } : {}),
		subjects: rows(src.subjects).map((s) => ({
			id: str(s.id),
			kind: s.kind === 'amend' || s.kind === 'remove' ? s.kind : 'add',
			baseLeafId: typeof s.baseLeafId === 'string' ? s.baseLeafId : null,
			name: str(s.name),
			description: str(s.description),
			changeSummary: str(s.changeSummary),
			objective: str(s.objective),
			problem: str(s.problem),
			expectedEffect: str(s.expectedEffect),
			value: str(s.value),
			criteria: criteria(s.criteria),
			retiredCriteria: strList(s.retiredCriteria),
			rewordedCriteria: criteria(s.rewordedCriteria),
			// Elements carry no id of their own: read as plain records, never through `rows`, which drops id-less rows.
			elements: (Array.isArray(s.elements) ? s.elements : [])
				.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
				.map((e) => ({ kind: str(e.kind), label: str(e.label), status: str(e.status) }))
		}))
	};
}

function parseCoherenceFinding(src: Record<string, unknown>): CoherenceFinding {
	return {
		id: src.id as string,
		axis: isCoherenceAxis(src.axis) ? src.axis : 'semantic',
		severity: isFindingSeverity(src.severity) ? src.severity : 'minor',
		title: str(src.title),
		requestNodeId: str(src.requestNodeId),
		existingNodeId: str(src.existingNodeId),
		fixNowTarget: str(src.fixNowTarget),
		published: bool(src.published),
		...(src.scope === 'inherited' || src.scope === 'request' ? { scope: src.scope } : {}),
		...(src.note === true ? { note: true } : {}),
		...(src.risk && typeof src.risk === 'object'
			? {
					risk: {
						by: str((src.risk as Record<string, unknown>).by),
						at: str((src.risk as Record<string, unknown>).at),
						reason: str((src.risk as Record<string, unknown>).reason)
					}
				}
			: {})
	};
}

function parseImpactFinding(src: Record<string, unknown>): ImpactFinding {
	const ruleWork = src.ruleWork;
	const migration = src.migrationImplied;
	return {
		id: src.id as string,
		hypothesis: isImpactHypothesis(src.hypothesis) ? src.hypothesis : 'add',
		section: isImpactSection(src.section) ? src.section : 'leaves',
		nodeId: str(src.nodeId),
		nodeLabel: str(src.nodeLabel),
		// A row of unknown kind is read as a feature: it is the granularity the
		// section is named after, so it understates rather than invents.
		nodeKind: isImpactNodeKind(src.nodeKind) ? src.nodeKind : 'feature',
		groupPath: strList(src.groupPath),
		note: str(src.note),
		codeWork: isCodeWork(src.codeWork) ? src.codeWork : null,
		depth: num(src.depth, 1, 1, MAX_IMPACT_DEPTH),
		severity: isImpactSeverity(src.severity) ? src.severity : 'none',
		migrationImplied: typeof migration === 'boolean' ? migration : null,
		ruleWork: ruleWork === 'replay' || ruleWork === 'rewrite' ? ruleWork : null,
		fromDraft: bool(src.fromDraft),
		// Which touched feature the walk reached it from: the row reads with that
		// feature's draft. Kept only when present, so an older reading stays as it was.
		...(typeof src.fromLeafId === 'string' && src.fromLeafId ? { fromLeafId: src.fromLeafId } : {}),
		...(src.fromUsed === true ? { fromUsed: true } : {}),
		...(typeof src.fromChange === 'string' && src.fromChange ? { fromChange: src.fromChange } : {})
	};
}

const BEHAVIOUR_KINDS = ['surface', 'state', 'action', 'rule', 'scenario'] as const;
type BehaviourKind = (typeof BEHAVIOUR_KINDS)[number];
const isBehaviourKind = (v: unknown): v is BehaviourKind =>
	typeof v === 'string' && (BEHAVIOUR_KINDS as readonly string[]).includes(v);

function parseBehaviourNote(src: Record<string, unknown>, index: number): DraftBehaviourNote {
	return {
		id: str(src.id) || `beh-${index}`,
		// A row whose kind did not survive the trip is read as a rule: it is the
		// one kind that says "something must hold" without claiming a shape.
		kind: isBehaviourKind(src.kind) ? src.kind : 'rule',
		name: str(src.name),
		detail: str(src.detail)
	};
}

/**
 * What the request proposes. A dossier written before drafts existed carries
 * none, and reads back with an empty list: the specification it produced is
 * unaffected either way, because a draft never reached a section.
 */
function parseDraftLeaf(src: Record<string, unknown>, index: number): DraftLeaf {
	const kind = src.kind;
	const base = str(src.baseLeafId);
	return {
		id: str(src.id) || `${DRAFT_LEAF_PREFIX}${index}`,
		kind: kind === 'amend' || kind === 'remove' ? kind : 'add',
		baseLeafId: base === '' ? null : base,
		name: str(src.name),
		description: str(src.description),
		...(str(src.changeSummary) ? { changeSummary: str(src.changeSummary) } : {}),
		coreId: str(src.coreId) || null,
		parentFamilyId: str(src.parentFamilyId) || null,
		objective: str(src.objective),
		problem: str(src.problem),
		expectedEffect: str(src.expectedEffect),
		value: str(src.value),
		acceptanceCriteria: (Array.isArray(src.acceptanceCriteria) ? src.acceptanceCriteria : [])
			.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
			.map((c, i) => ({ id: str(c.id) || `ac-draft-${i}`, text: str(c.text) }))
			.filter((c) => c.text !== ''),
		...(Array.isArray(src.retireCriteria) ? { retireCriteria: strList(src.retireCriteria) } : {}),
		...(Array.isArray(src.changeCriteria)
			? {
					changeCriteria: src.changeCriteria
						.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
						.map((c) => ({ id: str(c.id), text: str(c.text) }))
						.filter((c) => c.id !== '' && c.text !== '')
				}
			: {}),
		...(Array.isArray(src.descriptionPatch)
			? {
					descriptionPatch: src.descriptionPatch
						.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
						.map((p) => ({ find: str(p.find), replace: str(p.replace) }))
						.filter((p) => p.find !== '')
				}
			: {}),
		...(str(src.descriptionAppend) ? { descriptionAppend: str(src.descriptionAppend) } : {}),
		dependsOn: strList(src.dependsOn),
		sourceIds: strList(src.sourceIds),
		behaviour: (Array.isArray(src.behaviour) ? src.behaviour : [])
			.filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
			.map(parseBehaviourNote)
			.filter((b) => b.name !== ''),
		...parseBehaviourModel(src.behaviourModel, str(src.materialisedAt) || null),
		materialisedAs: str(src.materialisedAs) || null,
		materialisedAt: str(src.materialisedAt) || null
	};
}

/**
 * A draft's runnable behaviour, kept exactly as authored: the engine validated
 * the operations when they were written, and a reshaped operation would replay
 * as a different change. Only the envelope is checked here.
 */
function parseBehaviourModel(src: unknown, materialisedAt: string | null): { behaviourModel?: DraftBehaviourModel } {
	if (!src || typeof src !== 'object') return {};
	const model = src as Record<string, unknown>;
	const operations = (Array.isArray(model.operations) ? model.operations : []).filter(
		(op): op is Record<string, unknown> =>
			!!op && typeof op === 'object' && !Array.isArray(op) && typeof op.kind === 'string'
	);
	const landedSrc = model.landed && typeof model.landed === 'object' ? (model.landed as Record<string, unknown>) : null;
	const landedOps = (Array.isArray(landedSrc?.operations) ? landedSrc.operations : []).filter(
		(op): op is Record<string, unknown> =>
			!!op && typeof op === 'object' && !Array.isArray(op) && typeof op.kind === 'string'
	);
	if (operations.length === 0 && landedOps.length === 0) return {};
	// A model frozen before `landed` existed was written whole by that freeze and
	// left untouched since: it is all landed, and nothing is left to replay.
	if (!landedSrc && materialisedAt && str(model.updatedAt) !== '' && str(model.updatedAt) <= materialisedAt) {
		return {
			behaviourModel: {
				operations: [],
				mintedIds: [],
				updatedAt: str(model.updatedAt),
				landed: { operations, mintedIds: strList(model.mintedIds) }
			}
		};
	}
	return {
		behaviourModel: {
			operations,
			mintedIds: strList(model.mintedIds),
			updatedAt: str(model.updatedAt),
			...(landedOps.length > 0 ? { landed: { operations: landedOps, mintedIds: strList(landedSrc?.mintedIds) } } : {})
		}
	};
}

function parseImplementationFinding(src: Record<string, unknown>): ImplementationFinding {
	return {
		id: src.id as string,
		iteration: num(src.iteration, 1, 1),
		verdict: isImplementationVerdict(src.verdict) ? src.verdict : 'missing',
		requirement: str(src.requirement),
		...(str(src.leafId) ? { leafId: str(src.leafId) } : {}),
		filePath: str(src.filePath),
		lineRange: str(src.lineRange),
		specStatement: str(src.specStatement),
		codeStatement: str(src.codeStatement),
		hasRequirementAnchor: bool(src.hasRequirementAnchor, true),
		anchorForeignLeaf: bool(src.anchorForeignLeaf),
		acceptanceTestPassing: bool(src.acceptanceTestPassing),
		specVersion: num(src.specVersion, 0, 0),
		...(src.scope === 'inherited' || src.scope === 'request' ? { scope: src.scope } : {}),
		decision: isLineDecision(src.decision) ? src.decision : 'undecided',
		decidedBy: nullableStr(src.decidedBy),
		decidedAt: nullableStr(src.decidedAt)
	};
}

function parseProposal(src: Record<string, unknown>): Proposal {
	return {
		id: src.id as string,
		targetField: str(src.targetField),
		canonicalSection:
			src.canonicalSection === 'request' || isCanonicalSection(src.canonicalSection) ? src.canonicalSection : 'features',
		canonicalPath: str(src.canonicalPath),
		value: str(src.value),
		reasoning: str(src.reasoning),
		// Empty on a proposal stored before the two halves were named. Its verdict
		// travels on the flag below, which was computed when it was made, so nothing
		// already waiting for a signature is invalidated by reading it back.
		whatWasRead: str(src.whatWasRead),
		whatWasInferred: str(src.whatWasInferred),
		reasoningSeparatesReadFromInferred: bool(src.reasoningSeparatesReadFromInferred),
		citedSourceIds: strList(src.citedSourceIds),
		bannedSynonymDetected: bool(src.bannedSynonymDetected),
		flaggedWords: (Array.isArray(src.flaggedWords) ? src.flaggedWords : [])
			.filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && typeof (f as Record<string, unknown>).word === 'string')
			.map((f) => ({ word: str(f.word), prefer: str(f.prefer) })),
		keptWordingSense: str(src.keptWordingSense),
		proposedBy: str(src.proposedBy),
		decision: isProposalDecision(src.decision) ? src.decision : 'pending',
		comment: str(src.comment),
		acceptedBy: nullableStr(src.acceptedBy),
		acceptedAt: nullableStr(src.acceptedAt),
		reviewerIds: strList(src.reviewerIds),
		// A verdict with no author stands behind nothing: dropped.
		verdicts: (Array.isArray(src.verdicts) ? src.verdicts : [])
			.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
			.map((v) => ({
				by: str(v.by),
				verdict: v.verdict === 'invalidated' ? ('invalidated' as const) : ('validated' as const),
				comment: str(v.comment),
				at: str(v.at)
			}))
			.filter((v) => v.by.trim() !== ''),
		...parseProposalAsk(src.ask),
		...parseProposalDialogue(src.dialogue),
		...parseProposalLineDecisions(src.lineDecisions),
		// The suggestions it rewrote in place, so a link to one of them still lands on it (ac-evo-link-arrival-only).
		...(strList(src.replaces).length > 0 ? { replaces: strList(src.replaces) } : {})
	};
}

/** The lines of a list suggestion decided one by one; one with no line or no author decided nothing and is dropped (ac-evo-llm-line-decision). */
function parseProposalLineDecisions(value: unknown): Pick<Proposal, 'lineDecisions'> {
	const decisions = (Array.isArray(value) ? value : [])
		.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
		.map((d) => ({
			line: str(d.line),
			side: d.side === 'removed' ? ('removed' as const) : ('added' as const),
			decision: d.decision === 'refused' ? ('refused' as const) : ('accepted' as const),
			by: str(d.by),
			at: str(d.at)
		}))
		.filter((d) => d.line.trim() !== '' && d.by.trim() !== '');
	return decisions.length > 0 ? { lineDecisions: decisions } : {};
}

/** The question the AI asked with its suggestion; one with no words asks nothing and is dropped (ac-evo-live-card-ask). */
function parseProposalAsk(value: unknown): Pick<Proposal, 'ask'> {
	if (!value || typeof value !== 'object') return {};
	const src = value as Record<string, unknown>;
	if (!str(src.question)) return {};
	const answer = src.answer && typeof src.answer === 'object' ? (src.answer as Record<string, unknown>) : null;
	return {
		ask: {
			question: str(src.question),
			choices: strList(src.choices),
			...(src.multiple === true ? { multiple: true as const } : {}),
			...(answer && str(answer.body) ? { answer: { body: str(answer.body), by: str(answer.by), at: str(answer.at) } } : {})
		}
	};
}

/** What was asked and answered on the suggestions a suggestion replaced; an exchange missing either half is dropped. */
function parseProposalDialogue(value: unknown): Pick<Proposal, 'dialogue'> {
	const dialogue = (Array.isArray(value) ? value : [])
		.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
		.map((e) => ({ question: str(e.question), answer: str(e.answer), by: str(e.by), at: str(e.at) }))
		.filter((e) => e.question !== '' && e.answer !== '');
	return dialogue.length > 0 ? { dialogue } : {};
}

function parseMessage(src: Record<string, unknown>): ObservationMessage {
	return {
		id: src.id as string,
		channel: src.channel === 'llm' ? 'llm' : 'human',
		author: str(src.author),
		authorKind: isAuthorKind(src.authorKind) ? src.authorKind : 'person',
		body: str(src.body),
		postedAt: str(src.postedAt)
	};
}

function parseObservation(src: Record<string, unknown>): Observation {
	return {
		id: src.id as string,
		type: isObservationType(src.type) ? src.type : 'defect',
		target: isWalkthroughTarget(src.target) ? src.target : 'prototype',
		body: str(src.body),
		screenId: str(src.screenId),
		elementId: str(src.elementId),
		captureAttached: bool(src.captureAttached),
		captureAnnotated: bool(src.captureAnnotated),
		status: src.status === 'logged' ? 'logged' : 'draft',
		ruling: isObservationRuling(src.ruling) ? src.ruling : 'open',
		rulingReason: str(src.rulingReason),
		assignee: nullableStr(src.assignee),
		messages: rows(src.messages).map(parseMessage),
		linkedRequestId: nullableStr(src.linkedRequestId),
		foldedBackAt: nullableStr(src.foldedBackAt),
		foldedBackBy: nullableStr(src.foldedBackBy),
		foldedBackKind: isInjectionKind(src.foldedBackKind) ? src.foldedBackKind : null,
		foldedBackLeafId: nullableStr(src.foldedBackLeafId)
	};
}

function parseHistoryEntry(src: Record<string, unknown>): HistoryEntry {
	return {
		id: src.id as string,
		type: isHistoryEntryType(src.type) ? src.type : 'stage_crossing',
		summary: str(src.summary),
		authorId: str(src.authorId),
		authorKind: isAuthorKind(src.authorKind) ? src.authorKind : 'person',
		recordedAt: str(src.recordedAt),
		proposalId: nullableStr(src.proposalId),
		acceptedByPersonId: nullableStr(src.acceptedByPersonId),
		supersededById: nullableStr(src.supersededById),
		channel: src.channel === 'page' || src.channel === 'ai_client' || src.channel === 'assistant' ? src.channel : null
	};
}

function parseIteration(src: Record<string, unknown>, index: number): Iteration {
	const status = src.reportStatus;
	return {
		number: num(src.number, index + 1, 1),
		startedAt: str(src.startedAt),
		brief: str(src.brief),
		protectedLineIds: strList(src.protectedLineIds),
		reportStatus: status === 'ready' || status === 'closed' ? status : 'building'
	};
}

/**
 * A dossier written before open questions existed carried parked BLOCKS. A
 * parked block is exactly a block whose every field is an open question, so the
 * old mark is read as the new one rather than dropped: the author's holes stay
 * declared.
 */
function openQuestionsOfParkedBlocks(
	src: Record<string, unknown>,
	leafIds: readonly string[]
): string[] {
	const keys: string[] = [];
	for (const blockId of strList(src.skippedBlockIds)) {
		for (const field of blockById(blockId)?.fields ?? []) {
			if (!isLeafScoped(field)) keys.push(fieldKey(field.path));
			else for (const leafId of leafIds) keys.push(fieldKey(field.path, leafId));
		}
	}
	return keys;
}

function parseRequest(src: Record<string, unknown>): EvolutionRequest {
	const coherence = (src.coherenceReport ?? {}) as Record<string, unknown>;
	const impact = (src.impactReport ?? {}) as Record<string, unknown>;
	const coherenceStatus = coherence.status;
	// The features the change touches, deduplicated: the set says WHAT is
	// touched, not how often. Legacy dossiers carried a main leaf and a list
	// beside it; both are folded into the one set, main leaf first.
	const leafIds = [
		...new Set([...strList(src.mainLeafId ? [src.mainLeafId] : []), ...strList(src.leafIds), ...strList(src.secondaryLeafIds)])
	];
	return {
		id: src.id as string,
		title: str(src.title),
		origin: isRequestOrigin(src.origin) ? src.origin : null,
		requester: str(src.requester),
		stage: isRequestStage(src.stage) ? src.stage : 'draft',
		status: isRequestStatus(src.status) ? src.status : 'open',
		...parseRequestCancellation(src.cancellation),
		...parseRequestDeferredFrom(src.deferredFrom),
		leafIds,
		dataDrafts: parseDataDrafts(src.dataDrafts),
		sectionDrafts: parseSectionDrafts(src.sectionDrafts),
		ruleDrafts: parseRuleDrafts(src.ruleDrafts),
		findingDrafts: parseFindingDrafts(src.findingDrafts),
		drafts: (Array.isArray(src.drafts) ? src.drafts : [])
			.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
			.map(parseDraftLeaf),
		iteration: num(src.iteration, 1, 1),
		iterations: (Array.isArray(src.iterations) ? src.iterations : [])
			.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
			.map(parseIteration),
		specVersion: num(src.specVersion, 0, 0),
		frozen: bool(src.frozen),
		frozenVersions: (Array.isArray(src.frozenVersions) ? src.frozenVersions : [])
			.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
			.map(parseFrozenVersion)
			.filter((v) => v.version >= 1),
		...(Array.isArray(src.baselineKeys) ? { baselineKeys: strList(src.baselineKeys) } : {}),
		...(Array.isArray(src.baselineLeafIds) ? { baselineLeafIds: strList(src.baselineLeafIds) } : {}),
		...(Array.isArray(src.coherenceBaseline) ? { coherenceBaseline: strList(src.coherenceBaseline) } : {}),
		createdAt: str(src.createdAt),
		openQuestionKeys: [
			...new Set([...strList(src.openQuestionKeys), ...openQuestionsOfParkedBlocks(src, leafIds)])
		],
		answeredKeys: [...new Set(strList(src.answeredKeys))],
		// A signature with no signer or no home stands behind nothing: dropped.
		fieldSignatures: rows(src.fieldSignatures)
			.map(parseSignature)
			.filter((s) => s.signerId !== '' && s.key !== ''),
		fieldThreads: rows(src.fieldThreads)
			.map(parseFieldThread)
			.filter((t) => t.key !== ''),
		filledFieldKeys: strList(src.filledFieldKeys),
		coherenceGateClosed: bool(src.coherenceGateClosed),
		coherenceReport: {
			status:
				coherenceStatus === 'ready' || coherenceStatus === 'running' ? coherenceStatus : 'not_run',
			projectScore: num(coherence.projectScore, 0, 0, 100),
			requestDelta: num(coherence.requestDelta, 0, -100, 100),
			ranAt: nullableStr(coherence.ranAt),
			...((h) => (h ? { health: h } : {}))(parseHealthAfter(coherence.health))
		},
		impactReport: {
			status: impact.status === 'ready' ? 'ready' : 'not_run',
			hypothesis: isImpactHypothesis(impact.hypothesis) ? impact.hypothesis : 'add',
			depth: num(impact.depth, 2, 1, MAX_IMPACT_DEPTH),
			ranAt: nullableStr(impact.ranAt)
		},
		coherenceFindings: rows(src.coherenceFindings).map(parseCoherenceFinding),
		impactFindings: rows(src.impactFindings).map(parseImpactFinding),
		...(Array.isArray(src.proofImpact)
			? {
					// One reading per draft: the rows are keyed by draft, not by an id of their own.
					proofImpact: objects(src.proofImpact)
						.map(parseProofImpact)
						.filter((p, i, all) => p.draftId !== '' && all.findIndex((q) => q.draftId === p.draftId) === i)
				}
			: {}),
		implementationFindings: rows(src.implementationFindings).map(parseImplementationFinding),
		proposals: rows(src.proposals).map(parseProposal),
		observations: rows(src.observations).map(parseObservation),
		waivers: rows(src.waivers).map(parseWaiver),
		// The history never holds an unattributed decision. The write guard refuses
		// one, and so does this boundary: an out-of-process author writing straight
		// to the section must not be able to slip one past the guard.
		history: rows(src.history)
			.map(parseHistoryEntry)
			.filter((entry) => entry.authorId.trim() !== ''),
		need: parseNeed(src.need),
		// One mark per step, and a mark with no reason or no author says nothing.
		skippedSteps: (Array.isArray(src.skippedSteps) ? src.skippedSteps : [])
			.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
			.map((s) => ({ step: s.step, reason: str(s.reason), by: str(s.by), at: str(s.at) }))
			.filter((s): s is StepSkip => isSkippableStep(s.step) && s.reason.trim() !== '' && s.by !== '')
			.filter((s, i, all) => all.findIndex((o) => o.step === s.step) === i),
		deployment: parseDeployment(src.deployment),
		stepValidations: parseStepValidations(src.stepValidations),
		stepDescriptions: parseStepDescriptions(src.stepDescriptions),
		stepAnswers: parseStepAnswers(src.stepAnswers),
		// A skip carries no id of its own: read as plain records, never through `rows`.
		skippedQuestions: (Array.isArray(src.skippedQuestions) ? src.skippedQuestions : [])
			.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && str((v as Record<string, unknown>).key) !== '')
			.map((v) => ({ key: str(v.key), reason: str(v.reason), by: str(v.by), byKind: isAuthorKind(v.byKind) ? v.byKind : 'person', at: str(v.at) })),
		diagramAlignment: parseDiagramAlignment(src.diagramAlignment),
		technicalAlignment: parseTechnicalAlignment(src.technicalAlignment),
		textAlignment: parseTextAlignment(src.textAlignment),
		// A request stored before the setting existed asks for one validation, as it always did.
		validationsPerAnswer: Number.isInteger(src.validationsPerAnswer) && (src.validationsPerAnswer as number) >= 1 ? (src.validationsPerAnswer as number) : 1,
		namedValidators: parseNamedValidators(src.namedValidators),
		customQuestions: rows(src.customQuestions).map(parseCustomQuestion).filter((q): q is CustomQuestion => q !== null),
		fieldVersions: rows(src.fieldVersions).map(parseFieldVersion).filter((v): v is FieldVersion => v !== null),
		// A validation carries no id of its own (it points at a version by versionId):
		// read as plain records, never through `rows`, which dropped every one of them.
		fieldValidations: (Array.isArray(src.fieldValidations) ? src.fieldValidations : [])
			.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
			.map(parseFieldValidation)
			.filter((v): v is FieldValidation => v !== null),
		heldImplementation: parseHeld(src.heldImplementation),
		...parseCodeTrack(src.code),
		liveSessions: rows(src.liveSessions).map(parseLiveSession).filter((s): s is LiveSession => s !== null),
		aiClicks: rows(src.aiClicks).map(parseAiClick).filter((c): c is AiClick => c !== null),
		...parseAiDelegations(src.aiDelegations),
		...parseStepPrefills(src.stepPrefills),
		...(str(src.closingBaselineId) ? { closingBaselineId: str(src.closingBaselineId) } : {}),
		...parseTicketPost(src.ticketPost)
	};
}

/** The code a merge brought, by code element key; absent when it brought none (ac-evo-branch-not-outside). */
function broughtCode(value: unknown): { code?: Record<string, string> } {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const code = Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'));
	return Object.keys(code).length ? { code } : {};
}

/** Where the request's code stands in git; a track naming no branch or no commit says nothing (feat-evo-code-branch). */
function parseCodeTrack(value: unknown): { code?: CodeTrack } {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const src = value as Record<string, unknown>;
	const branch = str(src.branch);
	const codeHead = str(src.codeHead);
	if (!branch || !codeHead) return {};
	const count = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
	const record = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
	const validated = record(src.validated);
	const merged = record(src.merged);
	return {
		code: {
			repository: parseCodeRepository(src.repository),
			branch,
			baseCommit: str(src.baseCommit) || null,
			head: str(src.head) || codeHead,
			codeHead,
			clean: src.clean !== false,
			proofsChecked: count(src.proofsChecked),
			proofsOnOtherCommits: count(src.proofsOnOtherCommits),
			reportedAt: str(src.reportedAt),
			...(str(src.boundAt) ? { boundAt: str(src.boundAt) } : {}),
			// A commit carries no id of its own: read as plain records, never through `rows`, which drops them.
			commits: (Array.isArray(src.commits) ? src.commits : [])
				.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
				.map((c) => ({ sha: str(c.sha), at: str(c.at), clean: c.clean !== false }))
				.filter((c) => c.sha !== ''),
			history: parseBranchHistory(src.history),
			validated: validated && str(validated.commit) ? { commit: str(validated.commit), at: str(validated.at), by: str(validated.by) } : null,
			validationSetAside: src.validationSetAside === true,
			merged: merged && str(merged.commit) ? { into: str(merged.into), commit: str(merged.commit), at: str(merged.at), ...broughtCode(merged.code) } : null
		}
	};
}

/**
 * The repository a report or a stored track names; null when it names none.
 * The remote's credentials are taken out here too, whatever wrote it (ac-evo-branch-repository).
 */
export function parseCodeRepository(value: unknown): CodeRepository | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const src = value as Record<string, unknown>;
	const name = str(src.name).trim().slice(0, 200);
	if (!name) return null;
	const url = withoutCredentials(str(src.url)).slice(0, 500);
	return { name, url: url || null };
}

/** The branch's commits a report or a stored track lists, newest first; null when it lists none (ac-evo-branch-history). */
export function parseBranchHistory(value: unknown): BranchHistory | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const src = value as Record<string, unknown>;
	if (!Array.isArray(src.commits)) return null;
	const commits = src.commits
		.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
		.map((c) => ({ sha: str(c.sha).trim(), subject: str(c.subject).slice(0, 300), author: str(c.author).slice(0, 120), at: str(c.at), code: c.code !== false }))
		.filter((c) => /^[0-9a-f]{7,64}$/i.test(c.sha))
		.slice(0, HISTORY_LISTED);
	const count = Number.isInteger(src.count) && (src.count as number) >= commits.length ? (src.count as number) : commits.length;
	return { count, commits };
}

/** What the AI reported it did on the ticket; a report naming no ticket or no tool says nothing. */
function parseTicketPost(value: unknown): { ticketPost?: TicketPost } {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const src = value as Record<string, unknown>;
	const ticketKey = str(src.ticketKey).trim();
	const tool = str(src.tool).trim();
	if (!ticketKey || !tool) return {};
	return {
		ticketPost: {
			at: str(src.at),
			by: str(src.by),
			byKind: isAuthorKind(src.byKind) ? src.byKind : 'ai_client',
			ticketKey,
			tool,
			commented: bool(src.commented),
			movedToDone: bool(src.movedToDone),
			note: str(src.note)
		}
	};
}

/** The ticket and the message a ticket click hands the AI; one missing either is no hand-off. */
function parseTicketHandOff(value: unknown): { ticket?: { key: string; message: string } } {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const src = value as Record<string, unknown>;
	return str(src.key) && str(src.message) ? { ticket: { key: str(src.key), message: str(src.message) } } : {};
}

const STEP_PREFILL_STATES: readonly StepPrefillState[] = ['running', 'done', 'stopped'];

/** The prefills of a whole step; a run with no section or no click it sent walks nothing and is dropped (ac-evo-live-prefill-step). */
function parseStepPrefills(value: unknown): { stepPrefills?: StepPrefill[] } {
	const runs = rows(value)
		.map((src): StepPrefill | null => {
			const sections = rows(src.sections)
				.map((s) => ({ id: str(s.id), fieldPath: str(s.fieldPath), leafId: nullableStr(s.leafId), section: strList(s.section) }))
				.filter((s) => s.id !== '' && s.fieldPath !== '');
			const personId = str(src.personId);
			const clickId = str(src.clickId);
			if (!personId || !clickId || sections.length === 0) return null;
			const index = Number.isInteger(src.index) ? Math.min(Math.max(src.index as number, 0), sections.length - 1) : 0;
			const endedAt = str(src.endedAt);
			return {
				id: str(src.id),
				personId,
				step: str(src.step),
				sections,
				index,
				clickId,
				state: STEP_PREFILL_STATES.find((st) => st === src.state) ?? 'stopped',
				startedAt: str(src.startedAt),
				...(endedAt ? { endedAt } : {})
			};
		})
		.filter((r): r is StepPrefill => r !== null);
	return runs.length > 0 ? { stepPrefills: runs } : {};
}

/** Who delegated validation to their own AI; one naming nobody delegates nothing and is dropped (ac-evo-llm-delegation). */
function parseAiDelegations(value: unknown): { aiDelegations?: AiDelegation[] } {
	const delegations = (Array.isArray(value) ? value : [])
		.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
		.map((d) => ({ personId: str(d.personId), at: str(d.at) }))
		.filter((d) => d.personId.trim() !== '');
	return delegations.length > 0 ? { aiDelegations: delegations } : {};
}

/** A session with no person or no opening says nothing (ac-evo-live-start). */
function parseLiveSession(src: Record<string, unknown>): LiveSession | null {
	const personId = str(src.personId);
	const startedAt = str(src.startedAt);
	if (!personId || !startedAt) return null;
	const endedAt = str(src.endedAt);
	return {
		id: str(src.id),
		personId,
		startedAt,
		...(endedAt ? { endedAt, endReason: isSessionEndReason(src.endReason) ? src.endReason : 'ended_by_person' } : {}),
		...(str(src.currentClickId) ? { currentClickId: str(src.currentClickId) } : {}),
		...(str(src.cancelledClickId) ? { cancelledClickId: str(src.cancelledClickId) } : {}),
		...parseHeard(src.heard)
	};
}

/** What the AI last heard of the request; a mark without its time says nothing (ac-evo-live-progress-wakes). */
function parseHeard(raw: unknown): { heard?: HeardProgress } {
	if (!raw || typeof raw !== 'object') return {};
	const src = raw as Record<string, unknown>;
	const at = str(src.at);
	if (!at || !isRequestStage(src.stage)) return {};
	return { heard: { at, stage: src.stage, steps: strList(src.steps).filter(isValidatedStep), decided: strList(src.decided) } };
}

const AI_CLICK_STATES: readonly AiClickState[] = ['waiting', 'taken', 'answered', 'withdrawn', 'cancelled'];
const JOURNAL_SECTIONS: readonly JournalSection[] = ['evolution', 'documents', 'features', 'data'];

/** A journaled write keeps its place only with a section and a path; anything else could not be undone. */
function parseJournal(value: unknown): JournalEntry[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(e): e is JournalEntry =>
			!!e &&
			typeof e === 'object' &&
			JOURNAL_SECTIONS.includes((e as JournalEntry).section) &&
			Array.isArray((e as JournalEntry).path) &&
			typeof (e as JournalEntry).existedBefore === 'boolean' &&
			typeof (e as JournalEntry).existsAfter === 'boolean'
	);
}

function parseCancellation(value: unknown): AiClick['cancellation'] | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const src = value as Record<string, unknown>;
	return {
		at: str(src.at),
		undone: typeof src.undone === 'number' ? src.undone : 0,
		kept: Array.isArray(src.kept) ? src.kept.filter((k): k is string => typeof k === 'string') : []
	};
}

/** Why, by whom and when a request was cancelled; a record without its reason says nothing (ac-evo-req-cancel). */
function parseRequestCancellation(value: unknown): { cancellation?: RequestCancellation } {
	if (!value || typeof value !== 'object') return {};
	const src = value as Record<string, unknown>;
	return str(src.reason) ? { cancellation: { reason: str(src.reason), by: str(src.by), at: str(src.at) } } : {};
}

/** The deferred omission a request was started from; a link that names no line says nothing (criterion 03b7eacf). */
function parseRequestDeferredFrom(value: unknown): { deferredFrom?: RequestDeferredFrom } {
	if (!value || typeof value !== 'object') return {};
	const src = value as Record<string, unknown>;
	return str(src.requestId) && str(src.lineId) ? { deferredFrom: { requestId: str(src.requestId), lineId: str(src.lineId) } } : {};
}

/** A click with no sender, no kind or no question it bears on is dropped (ac-evo-live-nothing-lost). */
function parseAiClick(src: Record<string, unknown>): AiClick | null {
	const personId = str(src.personId);
	const fieldPath = str(src.fieldPath);
	if (!personId || !fieldPath || !isAiClickKind(src.kind)) return null;
	const state = AI_CLICK_STATES.find((s) => s === src.state) ?? 'waiting';
	return {
		id: str(src.id),
		personId,
		kind: src.kind,
		fieldPath,
		leafId: nullableStr(src.leafId),
		...(strList(src.section).length > 0 ? { section: strList(src.section) } : {}),
		...(src.answeredNothing === true ? { answeredNothing: true as const } : {}),
		...(src.follow === true ? { follow: true as const } : {}),
		...(isDrawableStep(src.step) ? { step: src.step } : {}),
		...(str(src.messageId) ? { messageId: str(src.messageId) } : {}),
		...(str(src.proposalId) ? { proposalId: str(src.proposalId) } : {}),
		...(str(src.stepPrefillId) ? { stepPrefillId: str(src.stepPrefillId) } : {}),
		...parseTicketHandOff(src.ticket),
		...(src.build && typeof src.build === 'object' && str((src.build as Record<string, unknown>).brief) ? { build: { brief: str((src.build as Record<string, unknown>).brief) } } : {}),
		...parseCloseHandOff(src.close),
		at: str(src.at),
		state,
		...(str(src.takenAt) ? { takenAt: str(src.takenAt) } : {}),
		...(str(src.answeredAt) ? { answeredAt: str(src.answeredAt) } : {}),
		...(Array.isArray(src.journal) ? { journal: parseJournal(src.journal) } : {}),
		...(parseCancellation(src.cancellation) ? { cancellation: parseCancellation(src.cancellation) } : {})
	};
}

/** A close click's step and brief (ac-evo-verd-steps-to-ai); nothing when either is missing. */
function parseCloseHandOff(value: unknown): { close?: { step: CloseStep; brief: string } } {
	if (!value || typeof value !== 'object') return {};
	const src = value as Record<string, unknown>;
	return isCloseStep(src.step) && str(src.brief) ? { close: { step: src.step, brief: str(src.brief) } } : {};
}

/** The texts the Functional spec's diagram follows; null when none were recorded (ac-evo-func-uml-sync). */
function parseDiagramAlignment(value: unknown): DiagramAlignment | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const src = value as Record<string, unknown>;
	return { description: str(src.description), refusals: str(src.refusals), failures: str(src.failures), at: str(src.at) };
}

/** The description of the Technical spec its diagram follows; null when none was recorded (ac-evo-tech-uml-sync). */
function parseTechnicalAlignment(value: unknown): TechnicalAlignment | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const src = value as Record<string, unknown>;
	return { description: str(src.description), at: str(src.at) };
}

/** The diagram each text a diagram edit moved past follows; an entry without its diagram says nothing (ac-evo-func-uml-sync). */
function parseTextAlignment(value: unknown): TextAlignment | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const held = Object.entries(value as Record<string, unknown>).flatMap(([field, entry]) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
		const src = entry as Record<string, unknown>;
		return typeof src.diagram === 'string' ? [[field, { diagram: src.diagram, at: str(src.at) }] as const] : [];
	});
	return held.length === 0 ? null : Object.fromEntries(held);
}

/** Held index entries, keyed `<type>:<id>`; an entry that is not an object says nothing. */
function parseHeld(value: unknown): Record<string, Readonly<Record<string, unknown>>> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).filter(
			(entry): entry is [string, Record<string, unknown>] => /^[a-z_]+:./.test(entry[0]) && !!entry[1] && typeof entry[1] === 'object'
		)
	);
}

function parseStepDescriptions(value: unknown): StepDescriptions {
	const src = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
	const out = createEmptyStepDescriptions();
	for (const step of DESCRIBED_STEPS) out[step] = str(src[step]);
	return out;
}

function parseStepAnswers(value: unknown): StepAnswers {
	const src = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
	const out = createEmptyStepAnswers();
	for (const q of STEP_QUESTIONS) {
		const step = (src[q.step] && typeof src[q.step] === 'object' ? src[q.step] : {}) as Record<string, unknown>;
		out[q.step][q.key] = str(step[q.key]);
	}
	return out;
}

/** A question nobody can read or nobody asked is dropped. */
function parseCustomQuestion(src: Record<string, unknown>): CustomQuestion | null {
	const question = str(src.question).trim();
	if (str(src.id) === '' || question === '' || !isValidatedStep(src.step)) return null;
	const status = src.status === 'answered' || src.status === 'set_aside' ? src.status : 'open';
	return {
		id: str(src.id),
		step: src.step,
		fieldKey: nullableStr(src.fieldKey),
		question,
		why: str(src.why),
		askedBy: str(src.askedBy),
		askedByKind: isAuthorKind(src.askedByKind) ? src.askedByKind : 'ai_client',
		askedAt: str(src.askedAt),
		status,
		resolution: str(src.resolution),
		resolvedBy: nullableStr(src.resolvedBy),
		resolvedAt: nullableStr(src.resolvedAt)
	};
}

/** A version that names no field or no author is evidence of nothing: dropped. */
function parseFieldVersion(src: Record<string, unknown>): FieldVersion | null {
	if (str(src.id) === '' || str(src.key) === '' || str(src.by) === '') return null;
	const source =
		src.source === 'proposal' || src.source === 'ai_client' || src.source === 'earlier' || src.source === 'diagram' || src.source === 'assistant' ? src.source : 'typed';
	return {
		id: str(src.id),
		key: str(src.key),
		value: str(src.value),
		by: str(src.by),
		byKind: isAuthorKind(src.byKind) ? src.byKind : 'person',
		source,
		proposalId: nullableStr(src.proposalId),
		at: str(src.at)
	};
}

function parseFieldValidation(src: Record<string, unknown>): FieldValidation | null {
	if (str(src.key) === '' || str(src.versionId) === '' || str(src.by) === '') return null;
	return {
		key: str(src.key),
		versionId: str(src.versionId),
		by: str(src.by),
		byKind: isAuthorKind(src.byKind) ? src.byKind : 'person',
		at: str(src.at),
		...(src.verdict === 'refused' ? { verdict: 'refused' as const, reason: str(src.reason) } : {}),
		...(src.delegated === true ? { delegated: true as const } : {})
	};
}

function parseNeed(value: unknown): RequestNeed {
	const src = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
	const need = createEmptyNeed();
	for (const key of NEED_KEYS) need[key] = str(src[key]);
	return need;
}

/** One record per validated step; a validation with no author stands behind nothing and is dropped. */
function parseStepValidations(value: unknown): StepValidation[] {
	const out: StepValidation[] = [];
	for (const item of Array.isArray(value) ? value : []) {
		if (!item || typeof item !== 'object') continue;
		const src = item as Record<string, unknown>;
		if (!isValidatedStep(src.step) || out.some((v) => v.step === src.step)) continue;
		const validations = (Array.isArray(src.validations) ? src.validations : [])
			.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
			.map((v) => ({ by: str(v.by), kind: isAuthorKind(v.kind) ? v.kind : 'person', at: str(v.at) }))
			.filter((v, i, all) => v.by !== '' && all.findIndex((o) => o.by === v.by) === i);
		out.push({ step: src.step, validatorIds: [...new Set(strList(src.validatorIds))], validations });
	}
	return out;
}

/**
 * One record per target; a record naming nobody, now or before, says nothing
 * and is dropped. A record carries no id of its own: read through `objects`.
 */
function parseNamedValidators(value: unknown): NamedValidators[] {
	const out: NamedValidators[] = [];
	for (const src of objects(value)) {
		const target = str(src.target);
		if (target === '' || out.some((n) => n.target === target)) continue;
		const people = [...new Set(strList(src.people).map((p) => p.trim().toLowerCase()).filter((p) => p !== ''))];
		const gone = [...new Set(strList(src.gone).map((p) => p.trim().toLowerCase()).filter((p) => p !== '' && !people.includes(p)))];
		if (people.length === 0 && gone.length === 0) continue;
		out.push({ target, people, gone });
	}
	return out;
}

function parseDeployment(value: unknown): Deployment | null {
	if (!value || typeof value !== 'object') return null;
	const src = value as Record<string, unknown>;
	const declaredBy = str(src.declaredBy);
	if (declaredBy === '') return null;
	return { releaseId: nullableStr(src.releaseId), note: str(src.note), declaredBy, declaredAt: str(src.declaredAt) };
}

/** Every object of a list, for rows that carry no id of their own. */
const objects = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
		: [];

const outcomeChanges = (value: unknown) =>
	rows(value).map((c) => ({
		id: str(c.id),
		name: str(c.name),
		...(str(c.before) ? { before: str(c.before) } : {}),
		...(str(c.after) ? { after: str(c.after) } : {})
	}));

const pathSteps = (value: unknown) =>
	objects(value).map((step) => ({
		actionName: str(step.actionName),
		...(str(step.featureName) ? { featureName: str(step.featureName) } : {}),
		parameters:
			step.parameters && typeof step.parameters === 'object' && !Array.isArray(step.parameters)
				? (step.parameters as Record<string, unknown>)
				: {}
	}));

const findingChanges = (value: unknown) =>
	objects(value).map((f) => ({
		kind: str(f.kind),
		severity: str(f.severity),
		on: str(f.on),
		detail: str(f.detail),
		...(Array.isArray(f.path) ? { path: pathSteps(f.path) } : {})
	}));

const passOrFail = (v: unknown) => (v === 'pass' || v === 'fail' ? v : undefined);

function parseProofImpact(src: Record<string, unknown>): DraftProofImpact {
	const scope = objects(src.scope)
		.filter((row) => str(row.featureId) !== '')
		.map(
			(row): ProofScopeEntry => ({
				featureId: str(row.featureId),
				featureName: str(row.featureName),
				reason: row.reason === 'declares-a-written-state' ? 'declares-a-written-state' : 'changed',
				...(Array.isArray(row.states) ? { states: strList(row.states) } : {})
			})
		);
	return {
		draftId: str(src.draftId),
		draftName: str(src.draftName),
		ranAt: str(src.ranAt),
		...(str(src.unavailable) ? { unavailable: str(src.unavailable) } : {}),
		...parseProofChanges(src),
		...(scope.length > 0 ? { scope } : {}),
		...(Array.isArray(src.dependents)
			? {
					dependents: objects(src.dependents).map((d) => ({
						featureId: str(d.featureId),
						featureName: str(d.featureName),
						...parseProofChanges(d)
					}))
				}
			: {})
	};
}

function parseProofChanges(src: Record<string, unknown>): ProofChanges {
	const proven = (src.proven ?? {}) as Record<string, unknown>;
	const deadlocks = src.deadlocks && typeof src.deadlocks === 'object' ? (src.deadlocks as Record<string, unknown>) : null;
	return {
		proven: {
			before: bool(proven.before),
			after: bool(proven.after),
			...(str(proven.reason) ? { reason: str(proven.reason) } : {})
		},
		statements: outcomeChanges(src.statements),
		actions: outcomeChanges(src.actions),
		goals: outcomeChanges(src.goals),
		...(deadlocks
			? {
					deadlocks: {
						...(str(deadlocks.before) ? { before: str(deadlocks.before) } : {}),
						...(str(deadlocks.after) ? { after: str(deadlocks.after) } : {}),
						...(Array.isArray(deadlocks.path) ? { path: strList(deadlocks.path) } : {})
					}
				}
			: {}),
		findingsAppeared: findingChanges(src.findingsAppeared),
		findingsResolved: findingChanges(src.findingsResolved),
		scenarios: objects(src.scenarios).map((s) => ({
			actionName: str(s.actionName),
			scenarioName: str(s.scenarioName),
			...(passOrFail(s.before) ? { before: passOrFail(s.before) } : {}),
			...(passOrFail(s.after) ? { after: passOrFail(s.after) } : {}),
			...(str(s.reason) ? { reason: str(s.reason) } : {})
		})),
		unchanged: bool(src.unchanged)
	};
}

export function parseEvolutionDraft(input: unknown, projectId: string): ProjectEvolutionDraft {
	const base = createEmptyEvolutionDraft(projectId);
	if (!input || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;
	return {
		...base,
		projectId,
		requests: rows(src.requests).map(parseRequest),
		...parseAiDelegations(src.aiDelegations),
		...(str(src.deploymentBranch).trim() ? { deploymentBranch: str(src.deploymentBranch).trim() } : {}),
		...parseProjectSessions(src)
	};
}

/** The sessions of each person's AI on the project and the clicks made outside a request (feat-ai-session). */
function parseProjectSessions(src: Record<string, unknown>): Pick<ProjectEvolutionDraft, 'sessions' | 'clicks'> {
	const sessions = rows(src.sessions).map(parseLiveSession).filter((s): s is LiveSession => s !== null);
	const clicks = rows(src.clicks).map(parseProjectClick).filter((c): c is ProjectClick => c !== null);
	return { ...(sessions.length > 0 ? { sessions } : {}), ...(clicks.length > 0 ? { clicks } : {}) };
}

/**
 * A click outside a request with no person, no kind or no place says nothing.
 * A message of Ask my AI has its conversation for its place: asked from the
 * Ask my AI page or from a page that names no block, it carries no anchor.
 */
function parseProjectClick(src: Record<string, unknown>): ProjectClick | null {
	const personId = str(src.personId);
	const anchor = str(src.anchor);
	if (!str(src.id) || !personId || !isProjectClickKind(src.kind)) return null;
	if (src.kind === 'chat' ? !str(src.conversationId) : !anchor) return null;
	const state = AI_CLICK_STATES.includes(src.state as AiClickState) ? (src.state as AiClickState) : 'waiting';
	const optional = (key: 'conversationId' | 'threadId' | 'messageId' | 'text' | 'featureId' | 'takenAt' | 'answeredAt' | 'answer') => (str(src[key]) ? { [key]: str(src[key]) } : {});
	return {
		id: str(src.id),
		personId,
		kind: src.kind,
		page: src.page === 'retrospec' ? 'retrospec' : 'spec',
		anchor,
		title: str(src.title),
		at: str(src.at),
		state,
		...optional('conversationId'),
		...optional('threadId'),
		...optional('messageId'),
		...optional('text'),
		...optional('featureId'),
		...optional('takenAt'),
		...optional('answeredAt'),
		...optional('answer'),
		...(src.answeredNothing === true ? { answeredNothing: true as const } : {})
	};
}
