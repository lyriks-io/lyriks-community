/** The desired state of a project's LiteLLM virtual key. */
export interface LiteLLMKeyConfig {
	/** Human-readable key alias, e.g. `lyriks-<projectId>`. */
	alias: string;
	/** Deterministic virtual key value, e.g. `sk-lyriks-<projectId>`. */
	key: string;
	blocked: boolean;
	/** Empty means all models are allowed. */
	models: string[];
	maxBudgetUsd: number;
	/**
	 * Optional budget-reset window (LiteLLM `budget_duration`, e.g. `"30d"`). When
	 * set, the proxy auto-resets the key's spend each window — a real recurring
	 * (e.g. monthly) cost cap, not a one-shot ceiling.
	 */
	budgetDuration?: string;
}

/** The live state of a virtual key as the proxy reports it. */
export interface LiteLLMKeyState {
	alias: string;
	spendUsd: number;
	maxBudgetUsd: number | null;
	models: string[];
	blocked: boolean;
}

/** One real metered AI call as the proxy's spend ledger recorded it. */
export interface LiteLLMSpendLog {
	model: string;
	spendUsd: number;
	totalTokens: number;
	/** ISO timestamp of the call. */
	at: string;
}

/**
 * Outbound port to the on-prem LiteLLM AI Gateway. The ONLY seam Lyriks uses to
 * push compiled guardrail rules (as a budgeted, model-scoped virtual key) and to
 * read spend back. Optional by design: `available` is false on an air-gapped
 * install with no proxy configured, and the use-cases no-op in that case.
 */
export interface LiteLLMGatewayPort {
	/** True only when a proxy URL + master key are configured (opt-in). */
	readonly available: boolean;
	/** The configured proxy base URL (empty when unavailable). */
	readonly baseUrl: string;
	/** Create-or-update the project's virtual key to match `config`. */
	applyKey(config: LiteLLMKeyConfig): Promise<LiteLLMKeyState>;
	/** Read the current state (incl. spend) of a virtual key, or null if absent. */
	readKey(key: string): Promise<LiteLLMKeyState | null>;
	/**
	 * Read the recent per-call spend ledger for one virtual key (newest first,
	 * bounded). Empty when the proxy keeps no logs or the key is unknown. This is
	 * the real audit + token-usage feed behind the per-member cost view.
	 */
	readSpendLogs(key: string, limit?: number): Promise<LiteLLMSpendLog[]>;
}
