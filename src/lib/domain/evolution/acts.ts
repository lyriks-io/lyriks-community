import {
	MAX_IMPACT_DEPTH,
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
	type DraftLeaf,
	type DraftLeafKind,
	type EvolutionRequest,
	type ImpactFinding,
	type ImplementationFinding,
	type Proposal
} from './draft';
import { ALLOW, firstRefusal, guard, refuse, type Guarded, type Refused } from './guard';
import {
	ALL_BLOCK_FIELDS,
	blockFieldByPath,
	canonicalPathsFor,
	fieldKey,
	holdsValue,
	isLeafScoped
} from './blocks';
import {
	acceptanceDebt,
	canAdvance,
	canCloseRequest,
	canDeleteRequest,
	canOpenRequest,
	canRebrief,
	nextStage,
	openRequest
} from './lifecycle';
import { canCrossToImplementation, canLeaveCoherence, canLeaveSpecification, canLiftWaiver, canWaive, openWaiver } from './gate';
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
import { canPostOnField, latestThread, openThread, post } from './field-thread';
import { canFoldBack, canInvalidate, canRule } from './acceptance';
import { record } from './history';
import { canComputePropagation } from './impact';
import { canRunCheck } from './coherence';
import { withImpactReading } from './impact-propagation';
import { withCoherenceReading, type CoherenceMapping } from './coherence-mapping';
import { withDerivedReport } from './report-derivation';

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
}

/** Create the dossier and open it in Specify, in one act. */
export function openRequestAct(ctx: ActContext, input: OpenRequestInput): ActOutcome {
	const leafIds = [...new Set(input.leafIds)];
	const refused = unknownLeaves(leafIds, input.knownLeafIds);
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
	return done(
		stamp(ctx, openRequest(request, ctx.at), 'stage_crossing', 'Request opened in specification'),
		`Opened "${request.title}" in specification`
	);
}

export function updateRequestAct(
	ctx: ActContext,
	request: EvolutionRequest,
	patch: { readonly title?: string; readonly origin?: RequestOrigin; readonly requester?: string }
): ActOutcome {
	const allowed = firstRefusal(
		notFinished(request),
		guard(
			patch.title !== undefined && patch.title.trim() === '',
			'A request needs a title before it can be opened.',
			'Without a title the request cannot be found again on Thursday, which is the whole point of giving it an identity.'
		)
	);
	if (!allowed.ok) return allowed;
	return done(
		{
			...request,
			title: patch.title !== undefined ? patch.title.trim() : request.title,
			origin: patch.origin ?? request.origin,
			requester: patch.requester !== undefined ? patch.requester.trim() : request.requester
		},
		'Request updated'
	);
}

export function setLeavesAct(
	ctx: ActContext,
	request: EvolutionRequest,
	leafIds: readonly string[],
	knownLeafIds: ReadonlySet<string>
): ActOutcome {
	const unique = [...new Set(leafIds)];
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
	readonly acceptanceCriteria?: readonly string[];
	readonly dependsOn?: readonly string[];
	readonly sourceIds?: readonly string[];
	readonly behaviour?: readonly { kind: DraftBehaviourNote['kind']; name: string; detail?: string }[];
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
export function addDraftLeafAct(
	ctx: ActContext,
	request: EvolutionRequest,
	input: DraftLeafInput,
	knownLeafIds: ReadonlySet<string>
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

	const base = kind === 'add' ? null : baseLeafId;
	const draft = createDraftLeaf({
		id: `${DRAFT_LEAF_PREFIX}${ctx.newId()}`,
		kind,
		baseLeafId: base,
		// Left empty on purpose when the change does not rename: the freeze then
		// keeps the name the leaf already has.
		name,
		description: (input.description ?? '').trim(),
		coreId: input.coreId ?? null,
		parentFamilyId: input.parentFamilyId ?? null,
		objective: (input.objective ?? '').trim(),
		problem: (input.problem ?? '').trim(),
		expectedEffect: (input.expectedEffect ?? '').trim(),
		value: (input.value ?? '').trim(),
		acceptanceCriteria: (input.acceptanceCriteria ?? [])
			.map((text) => text.trim())
			.filter((text) => text !== '')
			.map((text) => ({ id: ctx.newId(), text })),
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
			`Drafted: ${kind} "${draft.name || draft.baseLeafId}"`
		),
		`Drafted ${kind} "${draft.name || draft.baseLeafId}" as ${draft.id}`
	);
}

export function updateDraftLeafAct(
	ctx: ActContext,
	request: EvolutionRequest,
	draftId: string,
	input: DraftLeafInput,
	knownLeafIds: ReadonlySet<string>
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
	const behaviour = input.behaviour === undefined ? null : behaviourRows(ctx, input.behaviour);
	if (behaviour && !behaviour.ok) return behaviour;

	const next: DraftLeaf = {
		...current,
		kind,
		baseLeafId: kind === 'add' ? null : baseLeafId,
		name,
		description: input.description !== undefined ? input.description.trim() : current.description,
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
				: input.acceptanceCriteria
						.map((text) => text.trim())
						.filter((text) => text !== '')
						.map((text) => ({ id: ctx.newId(), text })),
		dependsOn: input.dependsOn === undefined ? current.dependsOn : [...new Set(input.dependsOn)],
		sourceIds: input.sourceIds === undefined ? current.sourceIds : [...new Set(input.sourceIds)],
		behaviour: behaviour ? behaviour.rows : current.behaviour
	};

	const touched = new Set(request.leafIds);
	if (next.baseLeafId) touched.add(next.baseLeafId);

	return done(
		{
			...request,
			drafts: request.drafts.map((d) => (d.id === draftId ? next : d)),
			leafIds: [...touched]
		},
		`Draft "${next.name || next.baseLeafId}" updated`
	);
}

export function removeDraftLeafAct(
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
	return done(
		{
			...request,
			drafts: request.drafts.filter((d) => d.id !== draftId),
			leafIds: request.leafIds.filter((id) => id !== draftId),
			// Dropping the draft drops what was proposed on it. The sections were
			// never touched, so there is nothing else to undo.
			proposals: request.proposals.filter(
				(proposal) => !proposal.targetField.endsWith(`@${draftId}`)
			)
		},
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
}

export interface ProposeChecks {
	readonly sourceExists: (id: string) => boolean;
	/** Words the glossary bans; a proposal using one is flagged before it is offered. */
	readonly bannedWords: readonly string[];
}

const escapeWord = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The paths a proposal can fill, listed in the refusal that rejects one.
 *
 * A refusal naming neither what it received nor what it accepts costs a round
 * trip, and pointing at another tool costs a second one when the caller is
 * holding a reading that already lists them.
 */
export function proposableFieldPaths(): string {
	return ALL_BLOCK_FIELDS.filter((f) => f.editor === 'inline')
		.map((f) => f.path)
		.join(', ');
}

export function usesBannedWord(value: string, bannedWords: readonly string[]): boolean {
	const words = bannedWords.map((w) => w.trim()).filter((w) => w.length > 1);
	if (words.length === 0) return false;
	return new RegExp(`\\b(${words.map(escapeWord).join('|')})\\b`, 'i').test(value);
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
			input.citedSourceIds.length === 0,
			'A proposal cites at least one source of the evidence register.',
			'A value nobody can trace back to a source cannot be signed for; register the source in documents first.'
		),
		guard(
			missingSources.length > 0,
			`Unknown source${missingSources.length === 1 ? '' : 's'}: ${missingSources.join(', ')}.`,
			'Sources are cited by the id of their row in the documents register.'
		),
		guard(
			pendingProposals(request).some((p) => fieldKey(p.targetField, leafOf(p)) === key),
			'A proposal is already waiting on this field. The person decides it first (accept, refuse or reword).',
			'One proposal per empty field, so the reader judges rather than compares.'
		)
	);
	if (!allowed.ok || !field) return allowed as Refused;

	const path = canonicalPathsFor(field, input.leafId ? [input.leafId] : [])[0]?.path ?? '';
	// Structural, never linguistic: the two halves are either named or they are
	// not. No language is privileged, because a check that only passes in English
	// switches the sourcing discipline off wherever the product is actually used.
	const read = input.whatWasRead?.trim() ?? '';
	const inferred = input.whatWasInferred?.trim() ?? '';
	const readVsInferred = input.readVsInferred ?? (read !== '' && inferred !== '');
	const proposal: Proposal = createProposal({
		id: ctx.newId(),
		targetField: input.fieldPath,
		canonicalSection: field.section,
		canonicalPath: path,
		value: input.value.trim(),
		// The free text stays what a reader reads. When only the two halves were
		// given, it is composed from them rather than left blank, so the dossier
		// never shows a proposal with no reasoning at all.
		reasoning: input.reasoning.trim() || [read, inferred].filter((part) => part !== '').join('\n\n'),
		whatWasRead: read,
		whatWasInferred: inferred,
		reasoningSeparatesReadFromInferred: readVsInferred,
		citedSourceIds: [...new Set(input.citedSourceIds)],
		bannedSynonymDetected: usesBannedWord(input.value, checks.bannedWords)
	});
	return done(
		{ ...request, proposals: [...request.proposals, proposal] },
		`Proposed ${field.label}${input.leafId ? ` for ${input.leafId}` : ''}${proposal.bannedSynonymDetected ? ' (flagged: banned word)' : ''}`
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
	| { readonly decision: 'accept' }
	| { readonly decision: 'refuse'; readonly comment: string }
	| { readonly decision: 'reword'; readonly value: string };

/** Whether every tagged reviewer stands behind the proposal. */
export function everyReviewerValidated(proposal: Proposal): boolean {
	return proposal.reviewerIds.every((id) => proposal.verdicts.some((v) => v.by === id && v.verdict === 'validated'));
}

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
			? `The proposed ${proposal.targetField} needs no tagged reviewer any more`
			: `Handed the proposed ${proposal.targetField} to ${unique.join(', ')}`
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

	const reviewed = proposal.reviewerIds.length > 0;
	const notATaggedReviewer = guard(
		reviewed && !proposal.reviewerIds.includes(ctx.actor.id),
		`This proposal waits for its tagged reviewers: ${proposal.reviewerIds.join(', ')}.`,
		'A proposal handed to named reviewers is decided by them; tag yourself to take part.'
	);

	if (input.decision === 'accept') {
		const allowed = firstRefusal(
			canAcceptProposal(ctx.actor, proposal, { soloWorkspace: ctx.soloWorkspace }),
			guard(
				proposal.decision !== 'pending' && proposal.decision !== 'reworded',
				'This proposal has already been decided.',
				'A decided proposal is a signed decision; propose again for a new value.'
			),
			notATaggedReviewer
		);
		if (!allowed.ok) return allowed;
		if (reviewed) {
			const validated = withVerdict(proposal, { by: ctx.actor.id, verdict: 'validated', comment: '', at: ctx.at });
			if (!everyReviewerValidated(validated)) {
				const given = validated.verdicts.filter((v) => v.verdict === 'validated').length;
				return done(
					stamp(
						ctx,
						{ ...request, proposals: request.proposals.map((p) => (p.id === proposalId ? validated : p)) },
						'proposal_verdict',
						`Validated the proposed ${proposal.targetField} (${given} of ${validated.reviewerIds.length} reviewers)`,
						{ proposalId }
					),
					`Validated; ${validated.reviewerIds.length - given} ${validated.reviewerIds.length - given === 1 ? 'reviewer' : 'reviewers'} still to validate`
				);
			}
			proposal = validated;
		}
		const leafId = leafOf(proposal);
		const written = writeThrough(proposal, leafId);
		if (!written.ok) return written;
		const key = fieldKey(proposal.targetField, leafId);
		const field = blockFieldByPath(proposal.targetField);
		const holds = field ? holdsValue(field, proposal.value) : proposal.value.trim() !== '';
		const signed = proposal;
		const accepted: EvolutionRequest = {
			...request,
			proposals: request.proposals.map((p) =>
				p.id === proposalId
					? { ...signed, decision: 'accepted', acceptedBy: ctx.actor.id, acceptedAt: ctx.at }
					: p
			),
			openQuestionKeys: holds ? request.openQuestionKeys.filter((k) => k !== key) : request.openQuestionKeys
		};
		return done(
			stamp(ctx, accepted, 'accepted_proposal', `Accepted the proposed ${proposal.targetField}`, {
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
			notATaggedReviewer
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
				? stamp(ctx, next, 'proposal_verdict', `Invalidated the proposed ${proposal.targetField}`, { proposalId })
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
					? { ...p, value: input.value.trim(), decision: 'reworded', bannedSynonymDetected: false, verdicts: [] }
					: p
			)
		},
		`Reworded the proposed ${proposal.targetField}`
	);
}

/* ───────────────────────── Open questions and threads ───────────────────────── */

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
			!blockFieldByPath(fieldPath),
			`No field is named "${fieldPath}". The fields that can be declared open are ${proposableFieldPaths()}.`,
			'The same list comes back as `fieldsAvailable` on the reading you already have.'
		),
		canMarkOpenQuestion({
			canEdit: canEdit(ctx.actor),
			fieldSelected: fieldPath !== '',
			alreadyOpen: request.openQuestionKeys.includes(key),
			blockState: ''
		})
	);
	if (!allowed.ok) return allowed;
	return done(
		{ ...request, openQuestionKeys: [...new Set([...request.openQuestionKeys, key])] },
		`Declared ${fieldPath} an open question`
	);
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
	body: string
): ActOutcome {
	const key = fieldKey(fieldPath, leafId);
	const current = latestThread(request, key);
	const startsNew = current === undefined || current.state === 'turned_into_change';
	const allowed = firstRefusal(
		notFinished(request),
		guard(
			!blockFieldByPath(fieldPath),
			`No field is named "${fieldPath}". The fields that can be carry a thread are ${proposableFieldPaths()}.`,
			'The same list comes back as `fieldsAvailable` on the reading you already have.'
		),
		guard(body.trim() === '', 'A message needs a body.', 'An empty message says nothing.'),
		canPostOnField(ctx.actor, { canComment: true, thread: startsNew ? undefined : current })
	);
	if (!allowed.ok) return allowed;
	const message = {
		id: ctx.newId(),
		author: ctx.actor.id,
		authorKind: ctx.actor.kind,
		body: body.trim(),
		postedAt: ctx.at
	};
	return done(
		{
			...request,
			fieldThreads: startsNew
				? [...request.fieldThreads, openThread({ id: ctx.newId(), key, message })]
				: request.fieldThreads.map((t) => (t.id === current.id ? post(t, message) : t))
		},
		`Posted on ${fieldPath}${leafId ? ` for ${leafId}` : ''}`
	);
}

/* ───────────────────────── Reports (computed, never deposited) ───────────────────────── */

export function runImpactAct(
	ctx: ActContext,
	request: EvolutionRequest,
	hypothesis: ImpactHypothesis,
	depth: number,
	findings: readonly ImpactFinding[]
): ActOutcome {
	const allowed = firstRefusal(notFinished(request), canComputePropagation(depth));
	if (!allowed.ok) return allowed;
	return done(
		withImpactReading(request, hypothesis, Math.min(MAX_IMPACT_DEPTH, depth), findings, ctx.at),
		`Impact under "${hypothesis}" at depth ${depth}: ${findings.length} node${findings.length === 1 ? '' : 's'} move`
	);
}

export function runCoherenceAct(
	ctx: ActContext,
	request: EvolutionRequest,
	mapping: CoherenceMapping
): ActOutcome {
	const allowed = firstRefusal(notFinished(request), canRunCheck(request, 'whole_project', 'engine'));
	if (!allowed.ok) return allowed;
	const blocking = mapping.findings.filter((f) => f.published && f.severity === 'blocking').length;
	const informative = mapping.findings.filter((f) => f.published).length - blocking;
	return done(
		withCoherenceReading(request, mapping),
		`Coherence ${mapping.report.projectScore}/100 (${mapping.report.requestDelta >= 0 ? '+' : ''}${mapping.report.requestDelta}): ${blocking} blocking, ${informative} informative`
	);
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
	return done(
		withDerivedReport(request, lines, ctx.at),
		`Report for version ${request.specVersion}: ${count('conform')} conform, ${count('non_conform')} non-conform, ${count('missing')} missing, ${count('out_of_scope')} out of scope, ${count('regression')} regression`
	);
}

/* ───────────────────────── Gates ───────────────────────── */

/** The gate a request must pass to enter `target`. */
export function gateFor(
	request: EvolutionRequest,
	target: RequestStage,
	criticalEmptyCount: number
): Guarded {
	switch (target) {
		case 'coherence':
			return canLeaveSpecification(request);
		case 'implementation':
			return firstRefusal(
				canCrossToImplementation(request, criticalEmptyCount),
				canLeaveCoherence(request)
			);
		case 'acceptance':
			return canCloseReport(request);
		case 'delivered':
			return guard(
				acceptanceDebt(request) > 0,
				'An accepted observation has not been written back into the spec yet.',
				'Delivering here would leave the specification describing something other than the product that was accepted.'
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
	input: { readonly criticalEmptyCount: number; readonly waiverReason?: string }
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
	const gate = gateFor(request, target, input.criticalEmptyCount);
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
			`Gate waived: ${input.waiverReason.trim()}`
		);
	} else {
		if (!gate.ok) return gate;
		crossed = stamp(ctx, { ...request, stage: target }, 'stage_crossing', `Crossed into ${target}`);
	}
	if (target === 'implementation') {
		const frozen = freeze(crossed, ctx.actor, ctx.at);
		crossed = stamp(ctx, frozen, 'spec_frozen', `Specification frozen as version ${frozen.specVersion}`);
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
			'Waiver lifted'
		),
		'Waiver lifted'
	);
}

/** Back to Specify on purpose; a frozen spec is amended and the gate re-closes. */
export function rebriefAct(ctx: ActContext, request: EvolutionRequest): ActOutcome {
	const allowed = firstRefusal(carriesForward(ctx, 'rebrief a request'), canRebrief(request));
	if (!allowed.ok) return allowed;
	const back = stamp(
		ctx,
		{ ...amend(request), stage: 'specification', coherenceGateClosed: true },
		'stage_crossing',
		'Sent back to specification for rebrief'
	);
	return done(
		request.frozen
			? stamp(ctx, back, 'spec_amended', `Specification amended after version ${request.specVersion}`)
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
		guard(
			input.decision === 'undecided',
			'Undecided is not a decision.',
			'A line is validated, invalidated, adopted or removed.'
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
		decidedBy: ctx.actor.id,
		decidedAt: ctx.at,
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
	return done(
		stamp(ctx, { ...request, implementationFindings: targeted }, 'verdict_decision', summary),
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
			`Observation ${ruling}`
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
			`Observation folded back into ${input.leafId} as an acceptance criterion`
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
	return done(stamp(ctx, { ...request, status: 'closed' }, 'stage_crossing', 'Request closed'), 'Request closed');
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
	criticalEmptyCount: number
): { readonly next: RequestStage | null; readonly verdict: Guarded } {
	const next = nextStage(request.stage);
	return { next, verdict: next ? firstRefusal(canAdvance(request, next), gateFor(request, next, criticalEmptyCount)) : ALLOW };
}

export const stageIndex = (stage: RequestStage): number => STAGE_ORDER.indexOf(stage);

export type { CoherenceFinding };
