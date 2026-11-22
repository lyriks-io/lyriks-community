import Anthropic from '@anthropic-ai/sdk';

import type { LanguageModelAnswer, LanguageModelConnection, LanguageModelPort, LanguageModelRequest } from '$application/ports';

/** The current models, which all take an effort; an older one the administrator names is asked without it. */
const CURRENT_MODELS = new Set(['claude-fable-5-1', 'claude-fable-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-haiku-5-5']);
/** The models a declined request can fall back from, server-side. */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const MAX_TOKENS = 16000;
/** A person waits on the page: two minutes, one retry, then the card says why. */
const TIMEOUT_MS = 120_000;

/**
 * Claude, through the Anthropic SDK, with the key the administrator connected
 * (ac-adm-ai-central). A key made in a Console organisation linked to a Max or
 * Team subscription draws on the API credits that subscription includes.
 */
export class AnthropicLanguageModel implements LanguageModelPort {
	constructor(private readonly fetcher: typeof fetch = fetch) {}

	async complete(connection: LanguageModelConnection, request: LanguageModelRequest): Promise<LanguageModelAnswer> {
		// The connected key is the client's only credential: the SDK then reads no
		// ANTHROPIC_* variable and no profile from the server's disk.
		const client = new Anthropic({ apiKey: connection.apiKey, timeout: TIMEOUT_MS, maxRetries: 1, fetch: this.fetcher });
		try {
			const response = await client.beta.messages.create({
				model: connection.model,
				max_tokens: MAX_TOKENS,
				system: request.system,
				messages: [{ role: 'user', content: request.prompt }],
				...(CURRENT_MODELS.has(connection.model) ? { output_config: { effort: 'medium' as const } } : {}),
				...(FALLBACK_MODELS.has(connection.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
			});
			if (response.stop_reason === 'refusal') return { ok: false, failure: 'declined', detail: response.stop_details?.explanation ?? '' };
			return { ok: true, text: response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('') };
		} catch (error) {
			return failureOf(error);
		}
	}
}

function failureOf(error: unknown): LanguageModelAnswer {
	const detail = error instanceof Error ? error.message : String(error);
	if (error instanceof Anthropic.AuthenticationError) return { ok: false, failure: 'key_refused', detail };
	if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, failure: 'forbidden', detail };
	if (error instanceof Anthropic.NotFoundError) return { ok: false, failure: 'model_unknown', detail };
	if (error instanceof Anthropic.RateLimitError) return { ok: false, failure: 'quota', detail };
	// A connection error is an APIError too in this SDK: it is told apart first.
	if (error instanceof Anthropic.APIConnectionError) return { ok: false, failure: 'unreachable', detail };
	if (error instanceof Anthropic.APIError) {
		if (error.type === 'billing_error') return { ok: false, failure: 'quota', detail };
		if (error.type === 'overloaded_error') return { ok: false, failure: 'overloaded', detail };
	}
	return { ok: false, failure: 'other', detail };
}
