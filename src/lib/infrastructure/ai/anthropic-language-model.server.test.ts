import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicLanguageModel } from './anthropic-language-model.server';

/** What the SDK puts on the wire and how each refusal is named (ac-adm-ai-test). */
const connection = { provider: 'anthropic' as const, model: 'claude-opus-5-5', apiKey: 'sk-ant-secret' };
const request = { system: 'You answer connection checks.', prompt: 'Answer with the single word OK.' };

interface Sent {
	readonly url: string;
	readonly headers: Headers;
	readonly body: Record<string, unknown>;
}

const message = (overrides: Record<string, unknown> = {}) => ({
	id: 'msg_1',
	type: 'message',
	role: 'assistant',
	model: 'claude-opus-5-5',
	content: [{ type: 'text', text: 'OK' }],
	stop_reason: 'end_turn',
	stop_sequence: null,
	stop_details: null,
	usage: { input_tokens: 12, output_tokens: 1 },
	...overrides
});

/** A fetch that records each request and answers with the given status and body. */
function answering(status: number, body: unknown, sent: Sent[] = []): typeof fetch {
	return (async (input: string | URL | Request, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		sent.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) });
		// A refusal is final here: the adapter's single retry would only slow the test.
		return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } });
	}) as unknown as typeof fetch;
}

const apiError = (type: string) => ({ type: 'error', error: { type, message: `${type} for this test` } });

async function failureFor(status: number, type: string) {
	const answer = await new AnthropicLanguageModel(answering(status, apiError(type))).complete(connection, request);
	return answer.ok ? null : answer.failure;
}

afterEach(() => vi.unstubAllEnvs());

describe('the Anthropic connection [criterion:ac-leaf-ac-adm-ai-test]', () => {
	it('sends one turn on API version 2026-10-21 with the connected key as the only credential', async () => {
		vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'ambient-token');
		vi.stubEnv('ANTHROPIC_API_KEY', 'ambient-key');
		const sent: Sent[] = [];
		const answer = await new AnthropicLanguageModel(answering(200, message(), sent)).complete(connection, request);

		expect(answer).toEqual({ ok: true, text: 'OK' });
		expect(sent).toHaveLength(1);
		const [{ url, headers, body }] = sent;
		const { origin, pathname } = new URL(url);
		expect(origin + pathname).toBe('https://api.anthropic.com/v1/messages');
		expect(headers.get('anthropic-version')).toBe('2026-10-21');
		expect(headers.get('authorization')).toBe('Bearer sk-ant-secret');
		expect(headers.get('x-api-key')).toBeNull();
		expect(headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01');
		expect(body).toEqual({
			model: 'claude-opus-5-5',
			max_tokens: 16000,
			system: request.system,
			messages: [{ role: 'user', content: request.prompt }],
			output_config: { effort: 'medium' },
			fallbacks: 'default'
		});
	});

	it('asks an older model without effort or fallbacks', async () => {
		const sent: Sent[] = [];
		await new AnthropicLanguageModel(answering(200, message({ model: 'claude-sonnet-4-6' }), sent)).complete({ ...connection, model: 'claude-sonnet-4-6' }, request);
		expect(sent[0].body).not.toHaveProperty('output_config');
		expect(sent[0].body).not.toHaveProperty('fallbacks');
		expect(sent[0].headers.get('anthropic-beta')).toBeNull();
	});

	it('joins the text blocks of the answer', async () => {
		const content = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Hello, ' }, { type: 'text', text: 'world' }];
		const answer = await new AnthropicLanguageModel(answering(200, message({ content }))).complete(connection, request);
		expect(answer).toEqual({ ok: true, text: 'Hello, world' });
	});

	it('reports a declined request with the reason the API gives', async () => {
		const declined = message({ content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'Not this one.' } });
		const answer = await new AnthropicLanguageModel(answering(200, declined)).complete(connection, request);
		expect(answer).toEqual({ ok: false, failure: 'declined', detail: 'Not this one.' });
	});

	it('names what went wrong', async () => {
		expect(await failureFor(401, 'authentication_error')).toBe('key_refused');
		expect(await failureFor(403, 'permission_error')).toBe('forbidden');
		expect(await failureFor(404, 'not_found_error')).toBe('model_unknown');
		expect(await failureFor(429, 'rate_limit_error')).toBe('quota');
		expect(await failureFor(402, 'billing_error')).toBe('quota');
		expect(await failureFor(529, 'overloaded_error')).toBe('overloaded');
		expect(await failureFor(500, 'api_error')).toBe('other');
		const offline = new AnthropicLanguageModel((async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch);
		expect(await offline.complete(connection, request)).toMatchObject({ ok: false, failure: 'unreachable' });
	});
});
