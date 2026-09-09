import type { EnforcementMode, RuleKind, RuleSource, RuleStatus } from './enums';

/* ── Entities — mirror of Unspaghettit feature 133c6adc ─────────────────── */

/**
 * One LiteLLM guardrail rule the compiler derived from the live Lyriks signals.
 * It is a rule *intent* — the on-prem proxy owns the concrete router/YAML; here
 * we only carry what to enforce, why, and its lifecycle.
 */
export interface CompiledRule {
	readonly id: string;
	kind: RuleKind;
	status: RuleStatus;
	/** Which signal produced it (scope readiness / coherence / budget). */
	source: RuleSource;
	/** Plain-language reason, e.g. "Scope readiness 40 < maturity threshold 70". */
	rationale: string;
	/** The scope this rule scopes to (a leaf feature / core / free label). */
	scopeLabel: string;
	/**
	 * For a `budget_cap` rule: the explicit monthly USD ceiling for this scope's
	 * key. `0` means "no explicit cap" — fall back to the project-wide tighten
	 * formula. Ignored for other kinds.
	 */
	capUsd: number;
	/** Best-effort monthly saving in USD this rule protects. */
	estimatedSavingUsd: number;
	createdAt: string;
}

/** The link to the on-prem LiteLLM proxy. Optional in an air-gapped install. */
export interface GatewayLink {
	baseUrl: string;
	connected: boolean;
	/** Approved-but-unpushed rule changes queued for the proxy. */
	pendingPushCount: number;
	/** Whether the last push of active rules to the proxy succeeded. */
	lastPushOk: boolean;
}

/** The persisted content of the AI Cost Governor capability across its three tabs. */
export interface ProjectFinopsDraft {
	projectId: string;

	/* Cost Governor (cockpit) */
	monthlyBudgetUsd: number;
	spentUsd: number;
	enforcementMode: EnforcementMode;

	/* Rule Compiler */
	/** Minimum scope readiness to allow generation; below it, generation is blocked. */
	maturityThreshold: number;
	/** Coherence below which generation is routed to a cheaper model. */
	coherenceThreshold: number;
	/** Spend ratio above which a per-key budget-cap rule is compiled. */
	budgetTightenRatio: number;
	/** The scope currently up for AI generation. */
	scopeLabel: string;
	/** Its readiness (0-100) — the per-scope depth signal. */
	scopeReadiness: number;

	/* Gateway Sync */
	gateway: GatewayLink;

	rules: CompiledRule[];
	lastSavedAt: string | null;
}

export function createEmptyFinopsDraft(projectId: string): ProjectFinopsDraft {
	return {
		projectId,
		monthlyBudgetUsd: 500,
		spentUsd: 0,
		enforcementMode: 'advisory',
		maturityThreshold: 70,
		coherenceThreshold: 80,
		budgetTightenRatio: 0.8,
		scopeLabel: '',
		scopeReadiness: 100,
		gateway: { baseUrl: '', connected: false, pendingPushCount: 0, lastPushOk: false },
		rules: [],
		lastSavedAt: null
	};
}

function newId(): string {
	return crypto.randomUUID();
}

export function createRule(overrides: Partial<CompiledRule> = {}): CompiledRule {
	// Destructure `id` out so an explicit `id: undefined` (e.g. from parsing an
	// untrusted payload with no id) can never clobber the generated one — every
	// rule always carries a stable id (its keyed-each key).
	const { id, ...rest } = overrides;
	return {
		id: typeof id === 'string' && id ? id : newId(),
		kind: 'block_scope',
		status: 'proposed',
		source: 'maturity',
		rationale: '',
		scopeLabel: '',
		capUsd: 0,
		estimatedSavingUsd: 0,
		createdAt: 'just now',
		...rest
	};
}
