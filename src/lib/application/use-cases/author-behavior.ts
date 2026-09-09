import type { BehaviorBatchResult, UnspaghettitAdvisorPort } from '$application/ports';
import type { DeleteBehaviorStateUseCase } from './delete-behavior-state';
import { expressionKindErrors } from '$application/validate-behavior-expressions';

/** Op kinds that add an invariant; the engine requires a `condition` predicate. */
const INVARIANT_OP_KINDS = new Set([
	'add_surface_invariant',
	'add_action_invariant',
	'add_feature_invariant',
	'add_project_invariant'
]);

/**
 * An invariant needs a `condition` predicate to be enforceable. Reject a
 * `condition`-less one at the facade rather than persist an incomplete invariant.
 *
 * On unspaghettit 0.10.0 this was a hard store-poison: the lax `apply_batch` path
 * wrote such an invariant, but the cold feature-loader REQUIRED `condition` and
 * dropped the WHOLE feature (and every one resolved alongside it) from the index
 * until it was removed by hand — an app-wide outage that survived restarts. 0.10.1
 * tolerates it (the feature resolves), but the invariant still renders as
 * "undefined" and checks nothing, so it stays worth rejecting up front — and this
 * keeps a compat guard for any store still served by 0.10.0.
 * A valid invariant is `{ name, condition, message, description }`.
 */
function invariantOpsMissingCondition(operations: readonly Record<string, unknown>[]): number[] {
	const bad: number[] = [];
	operations.forEach((op, i) => {
		if (!INVARIANT_OP_KINDS.has(String(op?.kind))) return;
		// The condition may sit on the op directly (flat form) or under `invariant`.
		const inv = (op.invariant && typeof op.invariant === 'object' ? op.invariant : op) as Record<
			string,
			unknown
		>;
		const condition = inv.condition;
		const hasCondition =
			condition != null && (typeof condition !== 'object' || Object.keys(condition).length > 0);
		if (!hasCondition) bad.push(i);
	});
	return bad;
}

/**
 * Every action authored here must declare WHEN it may run. A rule-less action
 * encodes no decision: nothing in the model says whether it is unconditional by
 * design or by omission — and "which rules are active" is the product's core
 * reading. So an `add_action` op is only accepted when the same batch also
 * carries at least one `add_action_rule` targeting it (matched by the `ref` the
 * action was minted with — a new action has no id to reference yet).
 *
 * There is deliberately NO bypass flag. An action that really is unconditional
 * says so *in the model*, as a condition-less `allow_action` rule: the decision
 * then shows up wherever active rules are read, instead of hiding in an
 * out-of-band request field. (Verified against the engine: such a rule validates
 * and does not count as a dead rule.)
 *
 * Scoped to the ops in THIS batch, deliberately: pre-existing rule-less actions
 * in the same feature are not the author's doing and must not block an unrelated
 * edit.
 */
function actionOpsMissingRules(operations: readonly Record<string, unknown>[]): string[] {
	const ruledRefs = new Set<string>();
	for (const op of operations) {
		if (String(op?.kind) !== 'add_action_rule') continue;
		const target = op.actionRef ?? op.actionId;
		if (typeof target === 'string') ruledRefs.add(target);
	}

	const errors: string[] = [];
	operations.forEach((op, i) => {
		if (String(op?.kind) !== 'add_action') return;
		const ref = typeof op.ref === 'string' ? op.ref : null;
		const name = typeof op.name === 'string' ? op.name : `op[${i}]`;
		if (ref && ruledRefs.has(ref)) return;
		errors.push(
			`op[${i}] (add_action "${name}"): no rule declares when this action can or cannot run. ` +
				(ref
					? `Add at least one \`add_action_rule\` with \`actionRef: "${ref}"\` in this same batch`
					: 'Give the action a `ref` and add at least one `add_action_rule` with that `actionRef` in this same batch') +
				` — e.g. { kind: "add_action_rule", surfaceRef: "…", actionRef: "${ref ?? '<ref>'}", ` +
				`rule: { category: "permissions", condition: { left: "user.role", operator: "==", right: "admin" }, ` +
				`effect: { type: "block_action", reason: "…", description: "…" }, description: "…" } }. ` +
				'If the action is genuinely unconditional, state that as a rule too — same op with no `condition` and ' +
				'`effect: { type: "allow_action", description: "…" }` — so the decision is recorded instead of omitted.'
		);
	});
	return errors;
}

/**
 * A handler runs on a cascade, and a cascade carries no input: "Handlers must
 * NOT have required parameters (they receive no input from the cascade, read
 * state directly)" is the engine's own rule, and its validator enforces exactly
 * that word, `required`. So the way through is to make the parameter optional
 * with a default, and then every cascade silently applies that default. An
 * effect that writes state from it overwrites whatever the emitter had just
 * computed, and the failure surfaces far away, as a scenario whose assertions
 * look like a modelling mistake.
 *
 * That is not an error to refuse: an in-feature cascade is a designed pattern,
 * and a handler may legitimately carry a parameter it never writes from. So say
 * it as a warning, naming the action and, when the batch shows it, the effect
 * that will write the default.
 *
 * Scoped to the ops in THIS batch, like the rule guard: what an author did not
 * touch is not theirs to be warned about.
 */
function handlerParameterWarnings(operations: readonly Record<string, unknown>[]): string[] {
	const target = (op: Record<string, unknown>): string | null => {
		const ref = op.actionRef ?? op.actionId;
		return typeof ref === 'string' ? ref : null;
	};

	const handlers = new Map<string, string>(); // ref -> action name
	for (const op of operations) {
		const kind = String(op?.kind);
		if (kind !== 'add_action' && kind !== 'update_action') continue;
		const patch = (op.patch && typeof op.patch === 'object' ? op.patch : op) as Record<string, unknown>;
		const event = patch.triggeredByEvent;
		if (typeof event !== 'string' || event.length === 0) continue;
		const ref = (typeof op.ref === 'string' ? op.ref : null) ?? target(op);
		if (ref) handlers.set(ref, typeof op.name === 'string' ? op.name : ref);
	}
	if (handlers.size === 0) return [];

	const parameters = new Map<string, string[]>();
	const writesFromParam = new Set<string>();
	for (const op of operations) {
		const ref = target(op);
		if (!ref || !handlers.has(ref)) continue;
		const kind = String(op?.kind);
		if (kind === 'add_parameter') {
			const name = typeof op.name === 'string' ? op.name : '<unnamed>';
			parameters.set(ref, [...(parameters.get(ref) ?? []), name]);
		} else if (kind === 'add_effect' && readsAParameter(op.value ?? op.effect)) {
			writesFromParam.add(ref);
		}
	}

	const warnings: string[] = [];
	for (const [ref, name] of handlers) {
		const params = parameters.get(ref);
		if (!params || params.length === 0) continue;
		warnings.push(
			`Action "${name}" is an event handler and declares ${params.length === 1 ? 'a parameter' : 'parameters'} ` +
				`(${params.join(', ')}). A cascade passes no input, so ${params.length === 1 ? 'it takes its' : 'they take their'} ` +
				'default on every run' +
				(writesFromParam.has(ref)
					? ', and an effect in this batch writes state from a parameter: each cascade will overwrite that state with the default. '
					: '. ') +
				'Read the state directly instead of taking it as a parameter, or drop `triggeredByEvent` and let a scenario call the action.'
		);
	}
	return warnings;
}

/** Does this effect payload read a parameter anywhere in its expression tree? */
function readsAParameter(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(readsAParameter);
	if (!value || typeof value !== 'object') return false;
	const node = value as Record<string, unknown>;
	if (node.kind === 'param') return true;
	return Object.values(node).some(readsAParameter);
}

export interface AuthorBehaviorInput {
	readonly projectId?: string;
	/** The feature the ops target (a leaf id, or `<projectId>__experience|__data_model`). */
	readonly featureId: string;
	/** Unspaghettit ops, exactly as `apply_batch` expects them. */
	readonly operations: readonly Record<string, unknown>[];
	/** Validate + score without saving. */
	readonly dryRun?: boolean;
	/**
	 * A `commitToken` from a prior `dryRun` — commits that exact validated batch
	 * without resending the ops (Fix #8). When set, `operations` may be empty and
	 * `dryRun` is ignored.
	 */
	readonly commit?: string;
	/**
	 * Include the engine's full per-issue verification report (under
	 * `batch.raw.maturity`) instead of aggregate counts only. Ignored on commit.
	 */
	readonly verbose?: boolean;
}

/** A batch refused by this facade, shaped exactly like an engine rejection. */
function reject(input: AuthorBehaviorInput, errors: string[]): AuthorBehaviorResult {
	return {
		available: true,
		warnings: [],
		batch: {
			ok: false,
			dryRun: input.dryRun === true,
			appliedCount: 0,
			refs: {},
			errors,
			maturityPercentage: null,
			commitToken: null,
			raw: { rejectedBy: 'author-behavior', errors }
		}
	};
}

export interface AuthorBehaviorResult {
	/** False only when the engine is unreachable (distinct from a rejected batch). */
	readonly available: boolean;
	/** The engine's batch outcome, or null when unreachable. */
	readonly batch: BehaviorBatchResult | null;
	/**
	 * Shapes that applied cleanly and will still bite later, in plain words.
	 * Never a reason to refuse a batch: a warning the author can read and
	 * dismiss beats a rule that forbids a pattern the engine supports.
	 */
	readonly warnings: readonly string[];
}

/**
 * Author behavior depth through the one kernel-side engine (Fix #1): apply a batch
 * of Unspaghettit ops to a feature. The write half that lets an authenticated
 * surface — the Lyriks MCP — fold in the full unspa vocabulary instead of leaving
 * for the standalone, unauthenticated engine. Deliberately thin: authorization
 * (which project owns the feature) is enforced at the HTTP edge, so this use-case
 * only depends on the authoring capability of the advisor port.
 */
export class AuthorBehaviorUseCase {
	constructor(private readonly advisor: Pick<UnspaghettitAdvisorPort, 'applyBehaviorBatch'>,
		private readonly deleteState?: Pick<DeleteBehaviorStateUseCase, 'execute'>) {}

	async execute(input: AuthorBehaviorInput): Promise<AuthorBehaviorResult> {
		if (!input.commit && input.operations.some((op) => op.kind === 'remove_state_definition')) {
			const op = input.operations[0];
			if (!this.deleteState || !input.projectId || input.operations.length !== 1 ||
				typeof op.surfaceId !== 'string' || typeof op.stateDefinitionId !== 'string')
				return reject(input, ['State deletion must use the checked deletion command. Detach dependencies first, then submit one remove_state_definition with projectId, surfaceId and stateDefinitionId.']);
			const result = await this.deleteState.execute({ projectId: input.projectId, featureId: input.featureId,
				surfaceId: op.surfaceId, stateDefinitionId: op.stateDefinitionId, dryRun: input.dryRun });
			return { available: true, warnings: [], batch: { ok: result.ok, dryRun: input.dryRun === true,
				appliedCount: result.ok && !input.dryRun ? 1 : 0, refs: {}, errors: result.ok ? [] : [result.message],
				maturityPercentage: null, commitToken: null, raw: result } };
		}
		// A commit replays an already-validated batch (ops may be empty) — nothing to
		// re-check. Otherwise refuse store-poisoning invariant ops up front so they
		// never reach the engine's lax write path (see `invariantOpsMissingCondition`).
		if (!input.commit) {
			const bad = invariantOpsMissingCondition(input.operations);
			if (bad.length > 0) {
				return reject(
					input,
					bad.map(
						(i) =>
							`op[${i}] (${String(input.operations[i].kind)}): invariant is missing a \`condition\` predicate — ` +
							`expected { name, condition: { left, operator, right? }, message, description }. ` +
							`A condition-less invariant is written but then makes the whole feature unresolvable.`
					)
				);
			}
			const ungated = actionOpsMissingRules(input.operations);
			if (ungated.length > 0) return reject(input, ungated);
			// An unrecognised expression kind is stored as a plain literal by the
			// engine rather than refused, which turns a typo into an inert effect
			// whose scenarios can still pass (see `validate-behavior-expressions`).
			const badKinds = expressionKindErrors(input.operations);
			if (badKinds.length > 0) return reject(input, badKinds);
		}

		const batch = await this.advisor.applyBehaviorBatch(input.featureId, input.operations, {
			dryRun: input.dryRun === true,
			commit: input.commit,
			verbose: input.verbose === true
		});
		// A commit replays ops already warned about on its dry run.
		const warnings = input.commit ? [] : handlerParameterWarnings(input.operations);
		return { available: batch !== null, batch, warnings };
	}
}
