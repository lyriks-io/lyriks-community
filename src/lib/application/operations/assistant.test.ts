import { describe, expect, it } from 'vitest';
import { ASSISTANT_PROVIDERS, defaultModelOf, defaultStoredAssistant, modelOf, offeredModel, type StoredAssistant } from '$domain/settings';
import type { LanguageModelAnswer, LanguageModelPort, LanguageModelRequest, SecretCipherPort, SettingsRepositoryPort } from '../ports';
import { ConnectAssistantUseCase } from './connect-assistant';
import { DrawDiagramWithAssistantUseCase } from '../evolution/draw-diagram-with-assistant';
import { LoadAssistantSettingsUseCase } from './load-assistant-settings';
import { RemoveAssistantKeyUseCase } from './remove-assistant-key';
import { SwitchAssistantUseCase } from './switch-assistant';
import { TestAssistantUseCase } from './test-assistant';

/**
 * The built-in assistant, connected once by an administrator for everybody,
 * its key sealed and never read back, and drawing a step's diagram only once
 * it is on (ac-adm-ai-off, -central, -key, -test, ac-evo-diagram-assistant).
 */
function memoryRepo(start: StoredAssistant = defaultStoredAssistant()) {
	let stored = start;
	const repo = {
		loadAssistant: async () => stored,
		saveAssistant: async (s: StoredAssistant) => {
			stored = s;
		}
	} as unknown as SettingsRepositoryPort;
	return { repo, stored: () => stored };
}
const cipher: SecretCipherPort = { seal: (plain) => `sealed(${[...plain].reverse().join('')})`, open: (s) => (s.startsWith('sealed(') ? [...s.slice(7, -1)].reverse().join('') : null) };
const clock = { nowIso: () => '2026-10-20T12:00:00.000Z' };
function scriptedModel(answers: LanguageModelAnswer[]) {
	const asked: { apiKey: string; model: string; request: LanguageModelRequest }[] = [];
	const model: LanguageModelPort = {
		complete: async (connection, request) => {
			asked.push({ apiKey: connection.apiKey, model: connection.model, request });
			return answers.shift() ?? { ok: false, failure: 'other', detail: 'no more answers' };
		}
	};
	return { model, asked };
}
const KEY = 'sk-ant-api03-secret-1234';

describe('the built-in assistant is off until an administrator connects it [criterion:ac-leaf-ac-adm-ai-off]', () => {
	it('reads off on a new installation, and cannot be switched on before it has a key', async () => {
		const { repo } = memoryRepo();
		expect(await new LoadAssistantSettingsUseCase(repo).execute()).toMatchObject({ enabled: false, keyHint: null });
		expect(await new SwitchAssistantUseCase(repo, clock).execute(true, 'admin@x')).toEqual({ ok: false, reason: 'Connect it first: the provider, the model and an API key.' });
	});

	it('calls no provider while it is off, whatever is connected', async () => {
		const { repo } = memoryRepo();
		await new ConnectAssistantUseCase(repo, cipher, clock).execute({ provider: 'anthropic', model: '', apiKey: KEY, by: 'admin@x' });
		const { model, asked } = scriptedModel([]);
		const outcome = await new DrawDiagramWithAssistantUseCase(repo, cipher, model).execute({ step: 'functional_spec', texts: { description: 'x' }, current: '', productName: 'P', lang: 'en' });
		expect(outcome).toMatchObject({ ok: false, kind: 'unavailable' });
		expect(asked).toHaveLength(0);
	});
});

describe('one connection, set by an administrator for everybody [criterion:ac-leaf-ac-adm-ai-central]', () => {
	it('offers Sonnet first for Claude, then Haiku, Opus and Fable, takes Sonnet when none is picked, and reads any other name as typed', () => {
		expect(ASSISTANT_PROVIDERS[0].models.map((m) => m.id)).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-fable-5-1']);
		expect(defaultModelOf('anthropic')).toBe('claude-sonnet-5-5');
		expect(modelOf({ provider: 'anthropic', model: '' })).toBe('claude-sonnet-5-5');
		expect(offeredModel('anthropic', 'claude-haiku-5-5')?.label).toBe('Haiku 5.5');
		expect(offeredModel('anthropic', 'claude-sonnet-5')).toBeNull();
		for (const p of ASSISTANT_PROVIDERS) for (const m of p.models) expect(m.hint).not.toBe('');
	});

	it('keeps the provider and the model, asks the default model when none is named, and keeps the stored key when none is typed', async () => {
		const { repo, stored } = memoryRepo();
		const connect = new ConnectAssistantUseCase(repo, cipher, clock);
		expect(await connect.execute({ provider: 'openai', model: 'gpt-5.5', apiKey: '', by: 'admin@x' })).toEqual({ ok: false, reason: 'Paste an API key: none is stored yet.' });
		expect(await connect.execute({ provider: 'mistral', model: '', apiKey: KEY, by: 'admin@x' })).toMatchObject({ ok: false });
		await connect.execute({ provider: 'anthropic', model: '', apiKey: KEY, by: 'admin@x' });
		await connect.execute({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: '', by: 'admin@x' });
		expect(stored()).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', keyHint: '…1234', updatedBy: 'admin@x', test: 'untested' });
		await new SwitchAssistantUseCase(repo, clock).execute(true, 'admin@x');
		const { model, asked } = scriptedModel([{ ok: true, text: 'OK' }]);
		await new TestAssistantUseCase(repo, cipher, model, clock).execute();
		expect(asked[0]).toMatchObject({ apiKey: KEY, model: 'claude-sonnet-5-5' });
	});
});

describe('the key is written and never read back [criterion:ac-leaf-ac-adm-ai-key]', () => {
	it('stores the key sealed, shows only its last four characters, and switches the assistant off when it is removed', async () => {
		const { repo, stored } = memoryRepo();
		await new ConnectAssistantUseCase(repo, cipher, clock).execute({ provider: 'anthropic', model: '', apiKey: KEY, by: 'admin@x' });
		await new SwitchAssistantUseCase(repo, clock).execute(true, 'admin@x');
		expect(JSON.stringify(stored())).not.toContain(KEY);
		const view = await new LoadAssistantSettingsUseCase(repo).execute();
		expect(JSON.stringify(view)).not.toContain('sealed');
		expect(view).toMatchObject({ keyHint: '…1234', enabled: true });
		expect(await new RemoveAssistantKeyUseCase(repo, clock).execute('admin@x')).toMatchObject({ enabled: false, keyHint: null });
		expect(stored().sealedKey).toBeNull();
	});
});

describe('testing the connection says in plain words what it found [criterion:ac-leaf-ac-adm-ai-test]', () => {
	it('records a refused key as a sentence, and a working one as works', async () => {
		const { repo } = memoryRepo();
		await new ConnectAssistantUseCase(repo, cipher, clock).execute({ provider: 'anthropic', model: '', apiKey: KEY, by: 'admin@x' });
		const refused = scriptedModel([{ ok: false, failure: 'key_refused', detail: '401' }]);
		const failed = await new TestAssistantUseCase(repo, cipher, refused.model, clock).execute();
		expect(failed).toMatchObject({ ok: true, settings: { test: 'failed', testDetail: 'Claude, by Anthropic refused the API key: check it, or paste a new one.' } });
		const works = scriptedModel([{ ok: true, text: 'OK' }]);
		expect(await new TestAssistantUseCase(repo, cipher, works.model, clock).execute()).toMatchObject({ ok: true, settings: { test: 'works', testDetail: null } });
	});

	it("says what to do when the server's secret changed since the key was sealed", async () => {
		const { repo } = memoryRepo({ ...defaultStoredAssistant(), sealedKey: 'from-another-secret', keyHint: '…1234', enabled: true });
		const { model, asked } = scriptedModel([]);
		const outcome = await new TestAssistantUseCase(repo, cipher, model, clock).execute();
		expect(outcome).toMatchObject({ ok: false });
		expect(asked).toHaveLength(0);
	});
});

describe('the built-in assistant draws a diagram that reads, or writes nothing [criterion:ac-leaf-ac-evo-diagram-assistant]', () => {
	async function onAssistant() {
		const { repo } = memoryRepo();
		await new ConnectAssistantUseCase(repo, cipher, clock).execute({ provider: 'anthropic', model: '', apiKey: KEY, by: 'admin@x' });
		await new SwitchAssistantUseCase(repo, clock).execute(true, 'admin@x');
		return repo;
	}
	const input = { step: 'technical_spec' as const, texts: { description: 'The order service asks an SMS sender for a text.' }, current: '', productName: 'P', lang: 'en' as const };

	it('takes a clean drawing at once', async () => {
		const { model, asked } = scriptedModel([{ ok: true, text: 'component Order service\ncomponent SMS sender: new\nlink Order service -> SMS sender: asks for a text' }]);
		const outcome = await new DrawDiagramWithAssistantUseCase(await onAssistant(), cipher, model).execute(input);
		expect(outcome).toMatchObject({ ok: true, tries: 1, provider: 'anthropic', model: 'claude-sonnet-5-5' });
		expect(asked).toHaveLength(1);
		expect(asked[0].request.prompt).toContain('The order service asks an SMS sender for a text.');
	});

	it('asks once more with what was wrong, and writes nothing when the second drawing does not read either', async () => {
		const { model, asked } = scriptedModel([
			{ ok: true, text: 'componnent Order service' },
			{ ok: true, text: 'still not the notation' }
		]);
		const outcome = await new DrawDiagramWithAssistantUseCase(await onAssistant(), cipher, model).execute(input);
		expect(outcome).toMatchObject({ ok: false, kind: 'unreadable' });
		expect(asked).toHaveLength(2);
		expect(asked[1].request.prompt).toContain('<previous>\ncomponnent Order service\n</previous>');
	});

	it('keeps a first drawing that reads when the second try brings nothing better', async () => {
		const { model } = scriptedModel([
			{ ok: true, text: 'component Order service\nlink Order service -> SMS sender: asks' },
			{ ok: false, failure: 'overloaded', detail: '529' }
		]);
		const outcome = await new DrawDiagramWithAssistantUseCase(await onAssistant(), cipher, model).execute(input);
		expect(outcome).toMatchObject({ ok: true, tries: 1 });
	});

	it('says why when the provider does not answer, and writes nothing', async () => {
		const { model } = scriptedModel([{ ok: false, failure: 'quota', detail: '429' }]);
		const outcome = await new DrawDiagramWithAssistantUseCase(await onAssistant(), cipher, model).execute(input);
		expect(outcome).toMatchObject({ ok: false, kind: 'unreachable' });
		expect(outcome.ok ? '' : outcome.reason).toContain('out of credits or quota');
	});
});
