import type { AppServices } from '$composition/container.server';
import {
	correctionFreezeGate,
	draftIndexKeys,
	findRequestByRef,
	refuse,
	validatesSpecification,
	elementPrints,
	freezeCorrection as freezeDomain,
	ACTIONS_UNREAD,
	inCorrection,
	openCorrection,
	proposalPrint,
	readingsBehindDrafts,
	type ActContext,
	type ActOutcome,
	type CorrectionElements,
	type EvolutionRequest,
	type ProjectEvolutionDraft
} from '$domain/evolution';
import type { ProjectFeaturesDraft } from '$domain/features';
import { readDraftFeature } from './evolution-graph.server';
import { specificationActionTrails } from './evolution-spec-actions.server';
import { maturityOf, specificationHoldOf, type EvolutionView } from './evolution-view.server';

/**
 * Correcting the frozen version in the Build, inside one batch of operations
 * (EVO-012): the act that changes what a request in Build proposes opens
 * version N+1 in correction, and the act after which nothing holds it any
 * longer freezes it. The domain decides (correction.ts); this reads what only
 * the engine knows: the elements the drafts make, and the actions to validate.
 */
export interface CorrectionDeps {
	readonly services: AppServices;
	readonly ctx: ActContext;
	/** The dossier as the batch read it: its members, its data, its language. */
	readonly view: EvolutionView;
	/** The batch's working copies, as they stand when asked. */
	readonly evolution: () => ProjectEvolutionDraft;
	readonly features: () => ProjectFeaturesDraft;
	/** The drafts whose behaviour model no longer applies, said. */
	readonly staleModels: (request: EvolutionRequest) => Promise<readonly string[]>;
	/** The request with the features it touches photographed where they are not yet. */
	readonly baseline: (request: EvolutionRequest) => Promise<EvolutionRequest>;
}

/** What one batch state holds: the dossier and the features section, as an act found them. */
export interface BatchState {
	readonly evolution: ProjectEvolutionDraft;
	readonly features: ProjectFeaturesDraft;
}

/**
 * What the drafts of a request bring, read by the engine: each element's print
 * and every index key they make. Null when the engine did not answer: nothing
 * is read on a guess.
 */
export async function readRequestElements(
	services: AppServices,
	evolution: ProjectEvolutionDraft,
	features: ProjectFeaturesDraft,
	request: EvolutionRequest
): Promise<CorrectionElements | null> {
	const prints: Record<string, string> = {};
	const brought = new Set<string>();
	for (const draft of request.drafts) {
		if (draft.kind === 'remove' || draft.materialisedAs !== null) continue;
		const reading = await readDraftFeature(services, evolution, draft.id);
		if (reading.status === 'unanswered') return null;
		const feature = reading.status === 'computed' ? reading.feature : null;
		const signed = features.leafMeta?.[draft.id]?.acceptanceCriteria ?? [];
		const criteria = [...draft.acceptanceCriteria, ...signed.filter((c) => !draft.acceptanceCriteria.some((d) => d.id === c.id)), ...(draft.changeCriteria ?? [])];
		Object.assign(prints, elementPrints(feature, criteria));
		for (const id of draft.retireCriteria ?? []) prints[`criterion:${id}`] = 'retired';
		for (const key of draftIndexKeys(feature, draft, signed.map((c) => c.id))) brought.add(key);
	}
	return { prints, brought };
}

/**
 * After one act: when it changed what a request in Build proposes, version
 * N+1 opens in correction, with what version N's elements read (from the
 * batch state before the act) kept to compare at the freeze.
 */
export async function openCorrectionWhenChanged(deps: CorrectionDeps, before: BatchState & { readonly request: EvolutionRequest }, outcome: ActOutcome): Promise<ActOutcome> {
	if (!outcome.ok || outcome.request.id !== before.request.id || inCorrection(outcome.request)) return outcome;
	if (!before.request.frozen || before.request.stage !== 'implementation') return outcome;
	const changed = proposalPrint(before.request, before.features.leafMeta) !== proposalPrint(outcome.request, deps.features().leafMeta);
	if (!changed) return outcome;
	// The engine silent here keeps the correction open all the same: its freeze then reads every element as moved.
	const elements = await readRequestElements(deps.services, before.evolution, before.features, before.request);
	// What version N proposed, kept whole: the brief and the tests of the frozen version read it until N+1 is frozen.
	const criteria = Object.fromEntries(before.request.drafts.map((d) => [d.id, [...(before.features.leafMeta?.[d.id]?.acceptanceCriteria ?? [])]]));
	return openCorrection(deps.ctx, before.request, outcome, true, elements?.prints ?? null, { drafts: before.request.drafts, criteria });
}

/**
 * Version N+1 frozen in the Build when nothing holds it, or the sentence that
 * holds it (criterion c3376a9e): the gate of the crossing out of the Impact
 * analysis on what the correction changed, the readings, the drafted
 * behaviour and the engine, which keeps the correction and freezes nothing
 * while it does not answer.
 */
export async function freezeCorrection(deps: CorrectionDeps, request: EvolutionRequest): Promise<ActOutcome> {
	const view: EvolutionView = { ...deps.view, draft: deps.evolution(), features: deps.features() };
	const criticalEmptyCount = maturityOf(view, view.features, request).criticalEmptyCount;
	const readingsBehind = readingsBehindDrafts(request);
	// What the page alone counts first: the engine is asked only once nothing else holds the version.
	const settled = correctionFreezeGate(request, { specification: specificationHoldOf(view, request), criticalEmptyCount, readingsBehind, staleModels: [] });
	if (!settled.ok) return settled;
	const specification = specificationHoldOf(view, request, await specificationActionTrails(deps.services, view, request));
	const gate = correctionFreezeGate(request, { specification, criticalEmptyCount, readingsBehind, staleModels: await deps.staleModels(request) });
	if (!gate.ok) return gate;
	const elements = await readRequestElements(deps.services, view.draft, view.features, request);
	if (!elements) return refuse(ACTIONS_UNREAD, 'The correction is kept and nothing is frozen until the engine answers.');
	const frozen = await deps.baseline(freezeDomain(deps.ctx, request, elements));
	return {
		ok: true,
		request: frozen,
		summary: `Specification corrected as version ${frozen.specVersion}: what the correction changed stands validated, so it is frozen in the Build and the report is built again against it`
	};
}

/**
 * Freeze version N+1 by hand (Freeze version N+1 on the foot, cross_stage on a
 * version in correction): a person's act, as every freeze is; an AI client in a
 * workspace of several members never freezes, under delegation or not.
 */
export async function freezeCorrectionByHand(deps: CorrectionDeps, request: EvolutionRequest): Promise<ActOutcome> {
	const actor = deps.ctx.actor;
	if (actor.role === 'viewer') return refuse('You can read this request but not move it.', 'Freezing is a write on the request.');
	if (actor.kind === 'ai_client' && !deps.ctx.soloWorkspace)
		return refuse('An AI client cannot move a request between stages.', 'Freeze version N+1 is a person\'s act: relay it only when they told you to, as them.');
	return freezeCorrection(deps, request);
}

/**
 * After one act: version N+1 freezes on its own only after a person's
 * validation that leaves no changed item waiting (criterion 2a796b1a), the way
 * version N follows EVO-011's freezeMayFollow (mirrored here, since that one
 * reads the Impact analysis): an AI's validation, delegated or not, never
 * freezes it, and Validate all freezes after its last validation. Null when
 * nothing froze; what holds it is said by the foot.
 */
export async function freezeCorrectionWhenDue(
	deps: CorrectionDeps,
	act: { readonly op: string; readonly later: readonly { readonly raw: unknown }[] },
	requestId: string
): Promise<ActOutcome | null> {
	const request = deps.evolution().requests.find((r) => r.id === requestId);
	if (!request || request.status !== 'open' || !inCorrection(request)) return null;
	if (!validatesSpecification(act.op) || deps.ctx.actor.kind !== 'person' || validatesLater(deps, requestId, act.later)) return null;
	const frozen = await freezeCorrection(deps, request);
	return frozen.ok ? frozen : null;
}

/** Whether a later operation of the batch validates the same request. */
function validatesLater(deps: CorrectionDeps, requestId: string, later: readonly { readonly raw: unknown }[]): boolean {
	const text = (v: unknown) => (typeof v === 'string' ? v : '');
	return later.some(({ raw }) => {
		const op = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
		if (!validatesSpecification(text(op.op) || text(op.kind))) return false;
		const named = findRequestByRef(deps.evolution().requests, text(op.requestId));
		return named.kind === 'found' && named.request.id === requestId;
	});
}
