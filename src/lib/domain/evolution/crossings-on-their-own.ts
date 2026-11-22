import { crossStageAct, gateFor, type ActContext, type ActOutcome } from './acts';
import { verificationCodeRefusal } from './code-branch-acts';
import type { Actor, EvolutionRequest } from './draft';
import { firstRefusal, type Guarded } from './guard';
import { REPORT_NOT_REBUILT } from './engine-silence';
import { attributeTo } from './history';

/**
 * The crossings a computation can settle are no longer clicks (EVO-011): the
 * freeze follows the validation of a person that leaves nothing of the
 * Specification waiting, and the Build moves into Approval once its report and
 * its branch are settled. A waiver stays a person's act, and so does the
 * approval, which alone fixes the commit that goes live.
 *
 * Pure: the operations server reads the Specification and crosses with what
 * these functions say.
 */

/** The acts that may complete the Specification. */
const SPECIFICATION_VALIDATIONS: readonly string[] = ['validate_field', 'validate_step'];

/** The acts after which the report of the Build may stand settled: its build, a line decided, the readings an adoption waits for. */
const REPORT_SETTLERS: readonly string[] = ['build_implementation_report', 'decide_line', 'run_coherence'];

/** What the page says once the Build moved into Approval, on its own or not. */
export const VERIFICATION_CLOSED = 'Verification closed: the evolution moves to acceptance testing';

/** The toast once a version is frozen, by the last validation or by hand. */
export const versionFrozenToast = (version: number): string => `Version ${version} frozen: the evolution moves into development`;

/**
 * Whether this act may freeze the version in the same act (criteria
 * b84841c8, 16778a7e): a validation given by a person, on a request open at
 * the Impact analysis. A validation an AI gives, under delegation or not, never
 * freezes: Freeze version N waits for a person.
 */
export function freezeMayFollow(op: string, actor: Pick<Actor, 'kind'>, request: Pick<EvolutionRequest, 'stage' | 'status'>): boolean {
	return SPECIFICATION_VALIDATIONS.includes(op) && actor.kind === 'person' && request.status === 'open' && request.stage === 'coherence';
}

/** Whether `op` is a validation of the Specification: a batch freezes after its last one, never in the middle (Validate all). */
export const validatesSpecification = (op: string): boolean => SPECIFICATION_VALIDATIONS.includes(op);

/**
 * Why nothing froze after the person's validation that left nothing of the
 * Specification waiting (criterion c39cfe76, the failures of the Functional
 * spec): the validation is kept, and the foot says what holds the freeze while
 * the request stands at the Impact analysis. What the gate reads (the readings,
 * a blocking finding, a critical answer) it says itself; this says what only the
 * freeze reads: a drafted behaviour that no longer applies, the engine silent.
 */
export interface FreezeHeld {
	readonly reason: string;
	readonly at: string;
	readonly by: string;
}

export function withFreezeHeld(request: EvolutionRequest, held: FreezeHeld): EvolutionRequest {
	return { ...request, freezeHeld: held };
}

export function withoutFreezeHeld(request: EvolutionRequest): EvolutionRequest {
	if (!request.freezeHeld) return request;
	const { freezeHeld: _gone, ...rest } = request;
	return rest;
}

/** What holds the freeze as the foot says it: only while the request stands open at the Impact analysis. */
export function freezeHeldOf(request: Pick<EvolutionRequest, 'stage' | 'status' | 'freezeHeld'>): FreezeHeld | null {
	return request.status === 'open' && request.stage === 'coherence' ? (request.freezeHeld ?? null) : null;
}

/** The note as stored; one with no reason or no date says nothing. */
export function parseFreezeHeld(value: unknown): { freezeHeld?: FreezeHeld } {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const src = value as Record<string, unknown>;
	const text = (v: unknown) => (typeof v === 'string' ? v : '');
	const reason = text(src.reason).slice(0, 2000);
	const at = text(src.at);
	return reason && at ? { freezeHeld: { reason, at, by: text(src.by) } } : {};
}

/**
 * The gate of the Build as the crossing into Approval reads it (criterion
 * 21b6ca55): no undecided line of the request, no line sent back, no adoption
 * waiting for a check, and, where the project names a deployment branch, no
 * uncommitted code nor proofs taken on another commit. Start acceptance testing
 * is offered only while it holds, saying what holds it (criterion 3cf58130).
 */
export function buildGate(request: EvolutionRequest, deploymentBranch: string): Guarded {
	return firstRefusal(verificationCodeRefusal(request, deploymentBranch), gateFor(request, 'acceptance', 0));
}

/** The next gate as the page and the coach read it, the Build's with its code checks. */
export function withBuildCodeGate<G extends { readonly next: string | null; readonly verdict: Guarded }>(
	gate: G,
	request: EvolutionRequest,
	deploymentBranch: string
): G {
	if (request.stage !== 'implementation' || !gate.verdict.ok) return gate;
	return { ...gate, verdict: verificationCodeRefusal(request, deploymentBranch) };
}

/** One act of a batch, as it was answered. */
export interface SettledAct {
	readonly op: string;
	readonly said: string;
}

/**
 * The Build moves into Approval on its own once its report and its branch are
 * settled (criterion 21b6ca55), after the acts that settle a report. Nobody
 * decides it, so the crossing is lent a person's standing to pass the guard and
 * the history keeps who actually acted: a sync is an AI's act and names no
 * person. It fixes no commit: the approval does (criterion b8d393ea). A report
 * the engine could not build again stands on code it did not read, and moves
 * nothing (rule a540a11e). Null when the request does not move.
 */
export function crossIntoApprovalOnItsOwn(ctx: ActContext, act: SettledAct, request: EvolutionRequest, deploymentBranch: string): ActOutcome | null {
	if (!REPORT_SETTLERS.includes(act.op) || act.said === REPORT_NOT_REBUILT) return null;
	if (request.status !== 'open' || request.stage !== 'implementation') return null;
	// The very path cross_stage takes into acceptance: the branch's checks, then crossStageAct and the gate it
	// reads, gateFor(request, 'acceptance'), so whatever that gate refuses holds this move too.
	if (!verificationCodeRefusal(request, deploymentBranch).ok) return null;
	const crossed = crossStageAct({ ...ctx, actor: { ...ctx.actor, kind: 'person' }, soloWorkspace: true }, request, { criticalEmptyCount: 0 });
	if (!crossed.ok) return null;
	return { ok: true, request: attributeTo(crossed.request, request.history.length, ctx.actor.kind), summary: VERIFICATION_CLOSED };
}
