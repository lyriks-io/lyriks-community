import type { LanguageModelAnswer, LanguageModelConnection, LanguageModelPort, LanguageModelRequest } from '$application/ports';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MAX_TOKENS = 16000;
/** A person waits on the page: two minutes, then the card says why. */
const TIMEOUT_MS = 120_000;

interface ChatCompletion {
	readonly choices?: readonly { readonly message?: { readonly content?: string | null; readonly refusal?: string | null } }[];
	readonly error?: { readonly message?: string; readonly code?: string | null; readonly type?: string };
}

/** OpenAI's Chat Completions endpoint, with the key the administrator connected (ac-adm-ai-central). */
export class OpenAiLanguageModel implements LanguageModelPort {
	constructor(private readonly fetcher: typeof fetch = fetch) {}

	async complete(connection: LanguageModelConnection, request: LanguageModelRequest): Promise<LanguageModelAnswer> {
		let res: Response;
		try {
			res = await this.fetcher(ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${connection.apiKey}` },
				body: JSON.stringify({
					model: connection.model,
					max_completion_tokens: MAX_TOKENS,
					messages: [
						{ role: 'system', content: request.system },
						{ role: 'user', content: request.prompt }
					]
				}),
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
		} catch (error) {
			return { ok: false, failure: 'unreachable', detail: error instanceof Error ? error.message : String(error) };
		}
		const body = (await res.json().catch(() => ({}))) as ChatCompletion;
		if (!res.ok) {
			const detail = body.error?.message ?? `HTTP ${res.status}`;
			if (res.status === 401) return { ok: false, failure: 'key_refused', detail };
			if (res.status === 403) return { ok: false, failure: 'forbidden', detail };
			if (res.status === 404) return { ok: false, failure: 'model_unknown', detail };
			if (res.status === 429) return { ok: false, failure: 'quota', detail };
			if (res.status === 503) return { ok: false, failure: 'overloaded', detail };
			return { ok: false, failure: 'other', detail };
		}
		const message = body.choices?.[0]?.message;
		if (message?.refusal) return { ok: false, failure: 'declined', detail: message.refusal };
		return { ok: true, text: message?.content ?? '' };
	}
}
