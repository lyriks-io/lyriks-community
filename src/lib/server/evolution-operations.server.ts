import type { AppServices } from '$composition/container.server';
import {
	addDraftLeafAct,
	answerOpenQuestionAct,
	buildReportAct,
	closeRequestAct,
	crossStageAct,
	decideLineAct,
	decideProposalAct,
	deleteRequestAct,
	deriveCodeImpact,
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
	pruneDraftMeta,
	markOpenQuestionAct,
	nothingToArbitrate,
	openRequestAct,
	overlayGraph,
	postOnFieldAct,
	propagateImpact,
	proposeAct,
	reachedFeatures,
	rebriefAct,
	refuse,
	removeDraftLeafAct,
	REQUEST_ORIGINS,
	ruleObservationAct,
	runCoherenceAct,
	runImpactAct,
	setLeavesAct,
	STAGE_ORDER,
	tagReviewersAct,
	updateDraftLeafAct,
	updateRequestAct,
	type ActContext,
	type ActOutcome,
	type Actor,
	type DraftLeafInput,
	type EvolutionRequest,
	type FeatureStatus,
	type Guarded,
	type ProjectEvolutionDraft
} from '$domain/evolution';
import { saveDossierField } from '$application/use-cases/save-dossier-field';
import type { ProjectFeaturesDraft } from '$domain/features';
import { mapLimit } from '$lib/shared/map-limit';
import { loadEvolutionView, maturityOf, requestCard, type EvolutionView } from './evolution-view.server';

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
		acceptanceCriteria:
			op.acceptanceCriteria === undefined ? undefined : strList(op.acceptanceCriteria),
		dependsOn: op.dependsOn === undefined ? undefined : strList(op.dependsOn),
		sourceIds: op.sourceIds === undefined ? undefined : strList(op.sourceIds),
		behaviour
	};
};

export const EVOLUTION_OPERATIONS = [
	'open_request',
	'update_request',
	'set_leaves',
	'add_draft_leaf',
	'update_draft_leaf',
	'remove_draft_leaf',
	'propose',
	'decide_proposal',
	'tag_reviewers',
	'mark_open_question',
	'answer_open_question',
	'post_on_field',
	'run_impact',
	'run_coherence',
	'build_implementation_report',
	'cross_stage',
	'lift_waiver',
	'rebrief',
	'decide_line',
	'rule_observation',
	'fold_back',
	'close_request',
	'delete_request'
] as const;
export type EvolutionOperationName = (typeof EVOLUTION_OPERATIONS)[number];

export interface OperationResult {
	readonly index: number;
	readonly op: string;
	readonly requestId: string | null;
	readonly ok: boolean;
	readonly summary: string;
	readonly detail?: string;
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

interface Working {
	evolution: ProjectEvolutionDraft;
	features: ProjectFeaturesDraft;
	featuresChanged: boolean;
	readonly touched: Set<string>;
}

/** The engine's status of one feature, or null when it holds none. */
async function featureStatus(services: AppServices, leafId: string): Promise<FeatureStatus | null> {
	if (!services.codeAdoption.available) return null;
	const result = await services.codeAdoption.getImplementationStatus(leafId).catch(() => null);
	return result?.ok ? (result.value as FeatureStatus) : null;
}

export async function applyEvolutionOperations(
	services: AppServices,
	input: {
		readonly projectId: string;
		readonly operations: readonly unknown[];
		readonly actor: Actor;
		readonly origin: string | null;
		readonly activeWorkspaceId?: string;
	}
): Promise<ApplyOutcome> {
	const view = await loadEvolutionView(services, input.projectId, { activeWorkspaceId: input.activeWorkspaceId });
	// The roster a proposal can be handed to; null where one member is alone.
	const roster = view.members.length > 1 ? new Set(view.members.map((m) => m.id)) : null;
	const working: Working = {
		evolution: view.draft,
		features: view.features,
		featuresChanged: false,
		touched: new Set()
	};
	const ctx: ActContext = {
		actor: input.actor,
		at: services.clock.nowIso(),
		newId: () => crypto.randomUUID(),
		// Who signs follows the roster (ac-evo-req-13). A workspace with nobody
		// else in it has nobody to counter-sign, so the client carries the request
		// through on the person's behalf; the channel is stamped on the timeline
		// either way, so a later reader always knows how the decision arrived.
		soloWorkspace: view.members.length <= 1
	};
	const knownLeafIds = new Set(view.leaves.map((l) => l.id));
	const leafNames = Object.fromEntries(view.leaves.map((l) => [l.id, l.name]));
	const sourceIds = new Set(view.sources.map((s) => s.id));
	const bannedWords = view.glossaryTerms.flatMap((t) => t.synonymsAvoid ?? []);

	const results: OperationResult[] = [];
	const findRequest = (id: string): EvolutionRequest | undefined =>
		working.evolution.requests.find((r) => r.id === id);
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

	/**
	 * One gate, crossed. When the gate is the one into Verify, the crossing
	 * freezes the specification AND writes what the request drafted into the
	 * features section: the single moment a dossier touches a section
	 * (ac-evo-draft-5). Everywhere else a draft stays a draft.
	 */
	const crossOnce = (request: EvolutionRequest, waiverReason?: string): ActOutcome => {
		const outcome = crossStageAct(ctx, request, {
			criticalEmptyCount: maturityOf(view, working.features, request).criticalEmptyCount,
			waiverReason
		});
		if (!outcome.ok) return outcome;
		if (outcome.request.stage !== 'implementation') return outcome;
		const written = materialiseDrafts(working.features, outcome.request, ctx.at);
		if (!written.changed) return outcome;
		working.features = written.features;
		working.featuresChanged = true;
		return {
			ok: true,
			request: written.request,
			summary: `${outcome.summary}. ${written.lines.join('. ')}`
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
	const settle = (request: EvolutionRequest): ActOutcome => {
		let current = request;
		const summaries: string[] = [];
		for (let guardCount = 0; guardCount < STAGE_ORDER.length; guardCount++) {
			if (current.stage === 'delivered') break;
			const crossed = crossOnce(current);
			// A gate that refuses means there IS something to arbitrate after all.
			// Leave the request where it stands rather than forcing it through.
			if (!crossed.ok) return { ok: true, request: current, summary: summaries.join('. ') };
			current = crossed.request;
			summaries.push(crossed.summary);
		}
		const closed = closeRequestAct(ctx, current);
		if (!closed.ok) return { ok: true, request: current, summary: summaries.join('. ') };
		return {
			ok: true,
			request: closed.request,
			summary: `Nothing moves and nothing contradicts, so this request crossed its gates and closed itself. ${summaries.join('. ')}`
		};
	};

	for (let index = 0; index < input.operations.length; index++) {
		const raw = input.operations[index];
		const op = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
		// `op` is this batch's discriminator and `kind` is the behavior batch's.
		// Two batches, two spellings, one author switching between them: accept
		// either rather than answer "Unknown operation \"\"" to a batch that named
		// its operation perfectly well.
		const name = str(op.op) || str(op.kind);
		const requestId = str(op.requestId) || null;
		const record = (outcome: ActOutcome | Guarded, id: string | null = requestId) => {
			if (outcome.ok) {
				if ('request' in outcome) put(outcome.request);
				results.push({ index, op: name, requestId: 'request' in outcome ? outcome.request.id : id, ok: true, summary: 'summary' in outcome ? outcome.summary : 'ok' });
				return true;
			}
			results.push({ index, op: name, requestId: id, ok: false, summary: outcome.reason, detail: outcome.detail });
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
			const ok = record(
				openRequestAct(ctx, {
					id: str(op.id) || undefined,
					title: str(op.title),
					origin: isRequestOrigin(origin) ? origin : null,
					requester: str(op.requester),
					leafIds: strList(op.leafIds),
					knownLeafIds
				}),
				null
			);
			if (!ok) break;
			continue;
		}

		const request = requestId ? findRequest(requestId) : undefined;
		if (!request) {
			record(
				refuse(
					requestId ? `Request "${requestId}" does not exist on this project.` : 'requestId is required.',
					'get_evolution lists the requests with their ids; open_request creates one.'
				)
			);
			break;
		}

		let outcome: ActOutcome;
		switch (name as EvolutionOperationName) {
			case 'update_request': {
				const origin = op.origin;
				// Same rule as at the door: an unknown code is refused rather than
				// dropped, which would report a change that never happened.
				if (origin !== undefined && origin !== null && !isRequestOrigin(origin)) {
					outcome = unknownOrigin(origin);
					break;
				}
				outcome = updateRequestAct(ctx, request, {
					title: typeof op.title === 'string' ? op.title : undefined,
					origin: isRequestOrigin(origin) ? origin : undefined,
					requester: typeof op.requester === 'string' ? op.requester : undefined
				});
				break;
			}
			case 'set_leaves':
				outcome = setLeavesAct(ctx, request, strList(op.leafIds), knownLeafIds);
				break;
			case 'add_draft_leaf':
				outcome = addDraftLeafAct(ctx, request, draftInput(op), knownLeafIds);
				break;
			case 'update_draft_leaf':
				outcome = updateDraftLeafAct(ctx, request, str(op.draftId), draftInput(op), knownLeafIds);
				break;
			case 'remove_draft_leaf':
				outcome = removeDraftLeafAct(ctx, request, str(op.draftId));
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
						readVsInferred: typeof op.readVsInferred === 'boolean' ? op.readVsInferred : undefined
					},
					{ sourceExists: (id) => sourceIds.has(id), bannedWords }
				);
				break;
			case 'decide_proposal': {
				const decision = str(op.decision);
				const decisionInput =
					decision === 'accept'
						? ({ decision: 'accept' } as const)
						: decision === 'refuse'
							? ({ decision: 'refuse', comment: str(op.comment) } as const)
							: decision === 'reword'
								? ({ decision: 'reword', value: text(op.value) } as const)
								: null;
				if (!decisionInput) {
					outcome = refuse('decision must be accept, refuse or reword.', 'Four decisions exist on a proposal; a comment goes through post_on_field.');
					break;
				}
				outcome = decideProposalAct(ctx, request, str(op.proposalId), decisionInput, (proposal, leafId) => {
					// The write-through: the value lands in the section that owns it, under
					// the section's own refusal, and the dossier keeps no copy.
					const written = saveDossierField(working.features, {
						fieldPath: proposal.targetField,
						leafId,
						value: proposal.value,
						sourceIds: proposal.citedSourceIds,
						canWriteCanonical: input.actor.role !== 'viewer'
					});
					if (written.status === 'refused') return refuse(written.reason, written.detail);
					working.features = written.draft;
					working.featuresChanged = true;
					return { ok: true };
				});
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
			case 'post_on_field':
				outcome = postOnFieldAct(ctx, request, str(op.fieldPath), str(op.leafId) || null, str(op.body));
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
					draftNodeIds: draftNodeIds(request.drafts)
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
				const code = deriveCodeImpact({ request, hypothesis, statuses, depthByFeature, leafNames });
				outcome = runImpactAct(ctx, request, hypothesis, depth, [...spec, ...code]);
				break;
			}
			case 'run_coherence': {
				const { analysis } = await services.loadCoherenceDraft.execute(input.projectId);
				const mapped = mapCoherenceAnalysis({ request, analysis, leafNames, at: ctx.at });
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
					)
				});
				outcome = runCoherenceAct(ctx, request, {
					...mapped,
					findings: [...mapped.findings, ...fromDrafts]
				});
				break;
			}
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
				const [own, near] = await Promise.all([
					mapLimit(request.leafIds, 2, async (id) => [id, await featureStatus(services, id)] as const),
					mapLimit([...neighbourIds], 2, async (id) => [id, await featureStatus(services, id)] as const)
				]);
				const lines = deriveImplementationReport({
					request,
					statuses: Object.fromEntries(own),
					neighbours: Object.fromEntries(near),
					leafNames
				});
				outcome = buildReportAct(ctx, request, lines);
				break;
			}
			case 'cross_stage':
				outcome = crossOnce(
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
				break;
			}
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
			case 'close_request':
				outcome = closeRequestAct(ctx, request);
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
		// The readings have just come back. If they say nothing moves and nothing
		// contradicts, the dossier costs its author nothing further.
		if (
			(name === 'run_coherence' || name === 'run_impact') &&
			outcome.ok &&
			outcome.request.stage === 'specification' &&
			nothingToArbitrate(outcome.request)
		) {
			const settled = settle(outcome.request);
			if (settled.ok && settled.request.stage !== 'specification')
				record(settled, settled.request.id);
		}
	}

	if (results.some((r) => !r.ok)) return { ok: false, status: 422, results };

	// Persist: the canonical section first (it is what an accepted value IS),
	// then the dossier under the revision it was read at.
	if (working.featuresChanged) await services.saveFeaturesDraft.execute(working.features);
	const saved = await services.saveEvolutionDraft.execute(working.evolution, {
		expectedRevision: view.revision,
		origin: input.origin
	});
	if (!saved) return { ok: false, status: 409, results };
	services.implementationCoverage.invalidate(input.projectId);

	// The touched requests as cards, read back off the saved state; the dossier
	// itself is one get_evolution away, so a batch answer stays small.
	const after: EvolutionView = await loadEvolutionView(services, input.projectId, { activeWorkspaceId: input.activeWorkspaceId });
	const requests = [...working.touched]
		.map((id) => after.draft.requests.find((r) => r.id === id))
		.filter((r): r is EvolutionRequest => r !== undefined)
		.map((r) => requestCard(after, r));
	return { ok: true, results, revision: saved.revision, savedAt: saved.savedAt, requests };
}
