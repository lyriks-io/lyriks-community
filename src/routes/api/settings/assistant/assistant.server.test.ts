import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuditEvent, LanguageModelConnection, LanguageModelPort } from '$application/ports';
import { ConnectAssistantUseCase } from '$application/operations/connect-assistant';
import { LoadAssistantSettingsUseCase } from '$application/operations/load-assistant-settings';
import { RemoveAssistantKeyUseCase } from '$application/operations/remove-assistant-key';
import { SwitchAssistantUseCase } from '$application/operations/switch-assistant';
import { TestAssistantUseCase } from '$application/operations/test-assistant';
import { LocalFsSettingsRepository } from '$infrastructure/settings/local-fs-settings-repository.server';
import { AesGcmSecretCipher } from '$infrastructure/settings/aes-gcm-secret-cipher.server';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

import { DELETE, GET, PUT } from './+server';
import { POST as TEST } from './test/+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * The built-in assistant's settings, over the shipped settings file and secret
 * cipher in a temporary folder. The provider key goes in once and never comes
 * back out: not in an answer, not in the audit trail, not in clear on disk.
 * Only the language model, faked here, is handed it.
 */

const ADMIN = 'root@example.test';
const API_KEY = 'sk-ant-SECRET-0123456789-WXYZ';

let dir: string;
let settingsFile: string;
let audit: AuditEvent[];
let modelCalls: LanguageModelConnection[];
let modelWorks: boolean;

function services() {
	const repo = new LocalFsSettingsRepository(settingsFile);
	const cipher = new AesGcmSecretCipher({ secret: 'night-test-secret' });
	const clock = { nowIso: () => '2026-11-18T03:00:00.000Z' };
	const model = {
		complete: async (connection) => {
			modelCalls.push(connection);
			return modelWorks ? { ok: true, text: 'OK' } : { ok: false, failure: 'key_refused', detail: '401 invalid x-api-key' };
		}
	} satisfies LanguageModelPort;
	return servicesWith({
		loadAssistantSettings: new LoadAssistantSettingsUseCase(repo),
		connectAssistant: new ConnectAssistantUseCase(repo, cipher, clock),
		switchAssistant: new SwitchAssistantUseCase(repo, clock),
		removeAssistantKey: new RemoveAssistantKeyUseCase(repo, clock),
		testAssistant: new TestAssistantUseCase(repo, cipher, model, clock),
		audit: { record: (event) => void audit.push(event) }
	});
}

function call(method: string, body?: unknown, email = ADMIN) {
	return requestEvent({
		path: '/api/settings/assistant',
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
		authRequired: true,
		session: { isAuthenticated: true, email },
		services: services()
	});
}

async function outcome(run: Response | Promise<Response>): Promise<{ status: number; text: string }> {
	return Promise.resolve(run).then(
		async (response) => ({ status: response.status, text: await response.text() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, text: failure.body.message } : Promise.reject(failure))
	);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'night-assistant-'));
	settingsFile = join(dir, 'settings.json');
	audit = [];
	modelCalls = [];
	modelWorks = true;
	privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete privateEnv.LYRIKS_ADMIN_EMAILS;
});

describe('connecting the built-in assistant', () => {
	it('stores the key sealed and answers with its last four characters only', async () => {
		const put = await outcome(PUT(call('PUT', { provider: 'anthropic', model: '', apiKey: API_KEY })));
		expect(put.status).toBe(200);
		const assistant = JSON.parse(put.text).assistant;
		expect(assistant).toMatchObject({ provider: 'anthropic', updatedBy: ADMIN });
		expect(assistant.keyHint).toMatch(/WXYZ$/);
		expect(assistant.keyHint.length).toBeLessThan(8);
		expect(put.text).not.toContain(API_KEY);
		expect(readFileSync(settingsFile, 'utf8')).not.toContain(API_KEY);
		expect(JSON.stringify(audit)).not.toContain(API_KEY);
		expect(audit).toMatchObject([{ action: 'settings.assistant.connect', actor: ADMIN, outcome: 'success' }]);
	});

	it('lets any signed-in person read the settings, never the key', async () => {
		await PUT(call('PUT', { provider: 'anthropic', model: '', apiKey: API_KEY }));
		const read = await outcome(GET(call('GET', undefined, 'member@example.test')));
		expect(read.status).toBe(200);
		expect(JSON.parse(read.text).assistant.keyHint).toMatch(/WXYZ$/);
		expect(read.text).not.toContain(API_KEY);
		expect(read.text).not.toContain('sealedKey');
	});

	it('refuses an unknown provider with 422, storing nothing and auditing the failure', async () => {
		const put = await outcome(PUT(call('PUT', { provider: 'acme-ai', apiKey: API_KEY })));
		expect(put.status).toBe(422);
		expect(JSON.parse((await outcome(GET(call('GET')))).text).assistant.keyHint).toBeNull();
		expect(audit).toMatchObject([{ action: 'settings.assistant.connect', outcome: 'failure' }]);
	});

	it('refuses a member who is not an administrator, storing nothing', async () => {
		const put = await outcome(PUT(call('PUT', { provider: 'anthropic', apiKey: API_KEY }, 'member@example.test')));
		expect(put.status).toBe(403);
		expect(JSON.parse((await outcome(GET(call('GET')))).text).assistant.keyHint).toBeNull();
		expect(audit).toEqual([]);
	});
});

describe('testing the connection', () => {
	it('hands the stored key to the model and reports that it works, without echoing it', async () => {
		await PUT(call('PUT', { provider: 'anthropic', model: '', apiKey: API_KEY }));
		const tested = await outcome(TEST(call('POST')));
		expect(tested.status).toBe(200);
		expect(JSON.parse(tested.text).assistant.test).toBe('works');
		expect(modelCalls.map((c) => c.apiKey)).toEqual([API_KEY]);
		expect(tested.text).not.toContain(API_KEY);
		expect(JSON.stringify(audit)).not.toContain(API_KEY);
		expect(audit.at(-1)).toMatchObject({ action: 'settings.assistant.test', outcome: 'success' });
	});

	it('records a refused key as a failed test in plain words', async () => {
		modelWorks = false;
		await PUT(call('PUT', { provider: 'anthropic', model: '', apiKey: API_KEY }));
		const tested = await outcome(TEST(call('POST')));
		expect(JSON.parse(tested.text).assistant.test).not.toBe('works');
		expect(audit.at(-1)).toMatchObject({ action: 'settings.assistant.test', outcome: 'failure' });
	});

	it('cannot be run by a member who is not an administrator', async () => {
		await PUT(call('PUT', { provider: 'anthropic', model: '', apiKey: API_KEY }));
		expect((await outcome(TEST(call('POST', undefined, 'member@example.test')))).status).toBe(403);
		expect(modelCalls).toEqual([]);
	});
});

describe('switching and removing', () => {
	it('removes the stored key, which switches the assistant off', async () => {
		await PUT(call('PUT', { provider: 'anthropic', model: '', apiKey: API_KEY }));
		const removed = await outcome(DELETE(call('DELETE')));
		expect(JSON.parse(removed.text).assistant).toMatchObject({ keyHint: null, enabled: false });
		expect(readFileSync(settingsFile, 'utf8')).not.toMatch(/"sealedKey":\s*"/);
	});

	it('switches the assistant on once connected', async () => {
		await PUT(call('PUT', { provider: 'anthropic', model: '', apiKey: API_KEY }));
		const on = await outcome(PUT(call('PUT', { enabled: true })));
		expect(JSON.parse(on.text).assistant.enabled).toBe(true);
		expect(audit.at(-1)).toMatchObject({ action: 'settings.assistant.switch', outcome: 'success' });
	});

	it('lets no member remove the key or switch the assistant', async () => {
		await PUT(call('PUT', { provider: 'anthropic', model: '', apiKey: API_KEY }));
		await PUT(call('PUT', { enabled: true }));
		expect((await outcome(DELETE(call('DELETE', undefined, 'member@example.test')))).status).toBe(403);
		expect((await outcome(PUT(call('PUT', { enabled: false }, 'member@example.test')))).status).toBe(403);
		expect(JSON.parse((await outcome(GET(call('GET')))).text).assistant).toMatchObject({ keyHint: expect.stringMatching(/WXYZ$/), enabled: true });
	});
});
