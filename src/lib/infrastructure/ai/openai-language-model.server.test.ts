import { describe, expect, it } from 'vitest';
import { OpenAiLanguageModel } from './openai-language-model.server';

/** A provider's refusal is named, never a bare status code (ac-adm-ai-test). */
const connection = { provider: 'openai' as const, model: 'gpt-5.5', apiKey: 'sk-proj-secret' };
const request = { system: 'You answer connection checks.', prompt: 'Answer with the single word OK.' };
const answering = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('the OpenAI connection [criterion:ac-leaf-ac-adm-ai-test]', () => {
	it('sends the key as a bearer token, the instruction as the system message, and reads the answer', async () => {
		let sent: RequestInit | undefined;
		const model = new OpenAiLanguageModel((async (_url: string, init: RequestInit) => {
			sent = init;
			return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
		}) as unknown as typeof fetch);
		expect(await model.complete(connection, request)).toEqual({ ok: true, text: 'OK' });
		expect((sent?.headers as Record<string, string>).authorization).toBe('Bearer sk-proj-secret');
		expect(JSON.parse(String(sent?.body))).toMatchObject({ model: 'gpt-5.5', messages: [{ role: 'system' }, { role: 'user' }] });
	});

	it('names what went wrong', async () => {
		const failure = async (status: number) => {
			const answer = await new OpenAiLanguageModel(answering(status, { error: { message: 'nope' } })).complete(connection, request);
			return answer.ok ? null : answer.failure;
		};
		expect(await failure(401)).toBe('key_refused');
		expect(await failure(404)).toBe('model_unknown');
		expect(await failure(429)).toBe('quota');
		expect(await failure(500)).toBe('other');
		const offline = new OpenAiLanguageModel((async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch);
		expect(await offline.complete(connection, request)).toMatchObject({ ok: false, failure: 'unreachable' });
	});
});
