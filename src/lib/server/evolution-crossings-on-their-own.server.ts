import {
	crossIntoApprovalOnItsOwn,
	freezeMayFollow,
	specificationLeft,
	validatesSpecification,
	withFreezeHeld,
	withoutFreezeHeld,
	type ActContext,
	type ActOutcome,
	type EvolutionRequest,
	type Guarded,
	type SettledAct,
	type SpecificationHold
} from '$domain/evolution';

/**
 * The crossings a computation settles, taken in the batch of the act that
 * settles them (EVO-011): the freeze after the validation of a person that
 * leaves nothing of the Specification waiting, as cross_stage would freeze it
 * with that person as author; the move into Approval once the report and the
 * branch of the Build are settled, naming no person. The act itself always
 * stands: a crossing that does not happen is said, never a refusal of the act.
 */
export interface CrossingsOnTheirOwn {
	readonly ctx: ActContext;
	readonly deploymentBranch: () => string;
	/** The Specification as cross_stage reads it at the freeze: its answers, its journey, its changes and its actions read with the engine's graph. */
	readonly specificationOf: (request: EvolutionRequest) => Promise<SpecificationHold>;
	/** The gate into the Build as the dossier reads it, with that Specification. */
	readonly freezeGate: (request: EvolutionRequest, specification: SpecificationHold) => Guarded;
	/** One gate crossed, as cross_stage crosses it: the freeze checks every drafted behaviour on the way. */
	readonly crossOnce: (request: EvolutionRequest) => Promise<ActOutcome>;
	/** A request named by an operation, as the batch resolves it. */
	readonly resolve: (ref: string) => EvolutionRequest | null;
}

/** The request as the crossings that followed an act leave it, and what they said (empty when they only tidied it). */
export interface Followed {
	readonly request: EvolutionRequest;
	readonly summary: string;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Whether a later operation of the batch validates the same request: Validate all freezes after its last validation, never in the middle. */
function validatesLater(deps: CrossingsOnTheirOwn, request: EvolutionRequest, later: readonly { readonly raw: unknown }[]): boolean {
	return later.some(({ raw }) => {
		const op = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
		return validatesSpecification(text(op.op) || text(op.kind)) && deps.resolve(text(op.requestId))?.id === request.id;
	});
}

/** Nothing froze: the validation is kept and the foot says why while the request stands at the Impact analysis. */
function held(deps: CrossingsOnTheirOwn, request: EvolutionRequest, reason: string, kept: boolean): Followed {
	const noted = kept ? withFreezeHeld(request, { reason, at: deps.ctx.at, by: deps.ctx.actor.id }) : withoutFreezeHeld(request);
	return { request: noted, summary: `Nothing was frozen: ${reason}` };
}

async function freezeAfterValidation(deps: CrossingsOnTheirOwn, request: EvolutionRequest): Promise<Followed | null> {
	const specification = await deps.specificationOf(request);
	// Items still wait: the validation completed nothing, and the gate says so itself.
	if (!specification.unread && specificationLeft(specification) > 0) return null;
	const gate = deps.freezeGate(request, specification);
	// The readings, a blocking finding or a critical answer: the gate says what holds the freeze. The engine silent: only this note does.
	if (!gate.ok) return held(deps, request, gate.reason, !!specification.unread);
	const frozen = await deps.crossOnce(request);
	if (frozen.ok) return { request: withoutFreezeHeld(frozen.request), summary: frozen.summary };
	// A drafted behaviour that no longer applies: only the freeze reads it, so the note keeps it.
	return held(deps, request, frozen.reason, true);
}

/**
 * After one act of the batch on `request`, as it was answered: the crossings it
 * settled, or null when nothing moved. `later` is what the batch still holds after the act.
 */
export async function crossingsAfter(
	deps: CrossingsOnTheirOwn,
	act: SettledAct,
	request: EvolutionRequest | null,
	later: readonly { readonly raw: unknown }[]
): Promise<Followed | null> {
	if (!request) return null;
	if (freezeMayFollow(act.op, deps.ctx.actor, request) && !validatesLater(deps, request, later)) return freezeAfterValidation(deps, request);
	const approval = crossIntoApprovalOnItsOwn(deps.ctx, act, request, deps.deploymentBranch());
	if (approval?.ok) return { request: approval.request, summary: approval.summary };
	// What held a freeze is said only while the request stands at the Impact analysis.
	if (request.freezeHeld && request.stage !== 'coherence') return { request: withoutFreezeHeld(request), summary: '' };
	return null;
}
