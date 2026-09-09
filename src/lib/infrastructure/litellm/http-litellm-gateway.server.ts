import type {
	LiteLLMGatewayPort,
	LiteLLMKeyConfig,
	LiteLLMKeyState,
	LiteLLMSpendLog
} from '$application/ports';

interface KeyInfoResponse {
	info?: {
		spend?: number;
		max_budget?: number | null;
		models?: string[];
		blocked?: boolean;
		key_alias?: string | null;
	};
}

interface SpendLogRow {
	model?: string;
	spend?: number;
	total_tokens?: number;
	startTime?: string;
	endTime?: string;
}

/**
 * Real adapter to the on-prem LiteLLM proxy admin API. Maps a project's compiled
 * guardrail rules onto a single budgeted, model-scoped virtual key:
 *   • blocked            → `blocked: true`   (proxy answers 401 "Key is blocked")
 *   • models allow-list  → `models: [...]`   (proxy answers 403 on other models)
 *   • budget cap         → `max_budget`      (proxy answers 429 when spend ≥ budget)
 * Create-or-update is decided by a `/key/info` probe (404 ⇒ create). Talks to the
 * proxy with the master key; never handles any real provider credentials.
 */
export class HttpLiteLLMGateway implements LiteLLMGatewayPort {
	readonly available: boolean;

	constructor(
		readonly baseUrl: string,
		private readonly masterKey: string,
		private readonly timeoutMs = 6000
	) {
		this.available = Boolean(baseUrl && masterKey);
	}

	async applyKey(config: LiteLLMKeyConfig): Promise<LiteLLMKeyState> {
		const existing = await this.readKey(config.key);
		const body: Record<string, unknown> = {
			key: config.key,
			key_alias: config.alias,
			models: config.models,
			max_budget: config.maxBudgetUsd,
			blocked: config.blocked
		};
		// Recurring cap: the proxy auto-resets spend each window (e.g. monthly).
		if (config.budgetDuration) body.budget_duration = config.budgetDuration;
		await this.#post(existing ? '/key/update' : '/key/generate', body);
		// /key/generate may ignore `blocked`; re-assert it on a freshly minted key.
		if (!existing && config.blocked) {
			await this.#post('/key/update', { key: config.key, blocked: true });
		}
		const state = await this.readKey(config.key);
		if (!state) throw new Error('LiteLLM key vanished right after apply');
		return state;
	}

	async readKey(key: string): Promise<LiteLLMKeyState | null> {
		const res = await this.#fetch(`/key/info?key=${encodeURIComponent(key)}`, { method: 'GET' });
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(`LiteLLM /key/info failed (${res.status})`);
		const data = (await res.json()) as KeyInfoResponse;
		const info = data.info ?? {};
		return {
			alias: info.key_alias ?? '',
			spendUsd: typeof info.spend === 'number' ? info.spend : 0,
			maxBudgetUsd: typeof info.max_budget === 'number' ? info.max_budget : null,
			models: Array.isArray(info.models) ? info.models : [],
			blocked: info.blocked === true
		};
	}

	async readSpendLogs(key: string, limit = 50): Promise<LiteLLMSpendLog[]> {
		const res = await this.#fetch(`/spend/logs?api_key=${encodeURIComponent(key)}`, {
			method: 'GET'
		});
		// No logs table / unknown key / endpoint disabled: degrade to empty.
		if (res.status === 404) return [];
		if (!res.ok) return [];
		const rows = (await res.json().catch(() => [])) as SpendLogRow[];
		if (!Array.isArray(rows)) return [];
		return rows
			.map((r) => ({
				model: typeof r.model === 'string' ? r.model : 'unknown',
				spendUsd: typeof r.spend === 'number' ? r.spend : 0,
				totalTokens: typeof r.total_tokens === 'number' ? r.total_tokens : 0,
				at: r.startTime ?? r.endTime ?? ''
			}))
			// Newest first, bounded — this is a display/attribution feed, not the ledger.
			.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
			.slice(0, limit);
	}

	async #post(path: string, body: unknown): Promise<void> {
		const res = await this.#fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const detail = await res.text().catch(() => '');
			throw new Error(`LiteLLM ${path} failed (${res.status}): ${detail.slice(0, 200)}`);
		}
	}

	#fetch(path: string, init: RequestInit): Promise<Response> {
		const headers = new Headers(init.headers);
		headers.set('authorization', `Bearer ${this.masterKey}`);
		return fetch(`${this.baseUrl}${path}`, {
			...init,
			headers,
			signal: AbortSignal.timeout(this.timeoutMs)
		});
	}
}
