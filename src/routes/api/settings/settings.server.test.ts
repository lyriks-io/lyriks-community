import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuditEvent } from '$application/ports';
import { LoadSettingsUseCase } from '$application/operations/load-settings';
import { SaveSettingsUseCase } from '$application/operations/save-settings';
import { LoadDisplaySettingsUseCase } from '$application/operations/load-display-settings';
import { SaveDisplaySettingsUseCase } from '$application/operations/save-display-settings';
import { SaveInstallConfigurationUseCase } from '$application/operations/save-install-configuration';
import { LoadInstallConfigurationUseCase } from '$application/operations/load-install-configuration';
import { LocalFsSettingsRepository } from '$infrastructure/settings/local-fs-settings-repository.server';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

import { GET as readAi, PUT as writeAi } from './+server';
import { GET as readDisplay, PUT as writeDisplay } from './display/+server';
import { PUT as writeConfiguration } from '../install-configuration/+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * The switches that apply to everybody on the installation: the AI
 * suggestions, how long New lasts, what may leave the installation. Every
 * change is an administrator's, over the shipped settings file in a
 * temporary folder.
 */

const ADMIN = 'root@example.test';
let dir: string;
let audit: AuditEvent[];

function services() {
	const repo = new LocalFsSettingsRepository(join(dir, 'settings.json'));
	return servicesWith({
		loadSettings: new LoadSettingsUseCase(repo),
		saveSettings: new SaveSettingsUseCase(repo),
		loadDisplaySettings: new LoadDisplaySettingsUseCase(repo),
		saveDisplaySettings: new SaveDisplaySettingsUseCase(repo),
		saveInstallConfiguration: new SaveInstallConfigurationUseCase(repo, { nowIso: () => '2026-11-18T03:00:00.000Z' }),
		loadInstallConfiguration: new LoadInstallConfigurationUseCase(repo, false),
		audit: { record: (event) => void audit.push(event) }
	});
}

function call(method: string, path: string, body?: unknown, email = ADMIN) {
	return requestEvent({
		path,
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
		authRequired: true,
		session: { isAuthenticated: true, email },
		services: services()
	});
}

async function answer(run: Response | Promise<Response>) {
	return Promise.resolve(run).then(
		async (r) => ({ status: r.status, body: await r.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'night-settings-'));
	audit = [];
	privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete privateEnv.LYRIKS_ADMIN_EMAILS;
});

describe('the AI suggestions switch', () => {
	it('is turned on by an administrator, for everybody, and audited', async () => {
		expect(await answer(writeAi(call('PUT', '/api/settings', { suggestionsEnabled: true })))).toEqual({ status: 200, body: { ai: { suggestionsEnabled: true } } });
		expect((await answer(readAi(call('GET', '/api/settings', undefined, 'member@example.test')))).body).toEqual({ ai: { suggestionsEnabled: true } });
		expect(audit).toMatchObject([{ action: 'settings.update', actor: ADMIN, detail: 'suggestions=authorized' }]);
	});

	it('cannot be flipped by a member, and stays as it was', async () => {
		expect((await answer(writeAi(call('PUT', '/api/settings', { suggestionsEnabled: true }, 'member@example.test')))).status).toBe(403);
		expect((await answer(readAi(call('GET', '/api/settings')))).body).toEqual({ ai: { suggestionsEnabled: false } });
		expect(audit).toEqual([]);
	});
});

describe('how long New lasts', () => {
	it('is set by an administrator within its range', async () => {
		expect(await answer(writeDisplay(call('PUT', '/api/settings/display', { newBadgeDays: 7 })))).toEqual({ status: 200, body: { settings: { newBadgeDays: 7 } } });
		expect((await answer(readDisplay(call('GET', '/api/settings/display')))).body).toEqual({ settings: { newBadgeDays: 7 } });
	});

	it('refuses a value out of range, keeping the one in force', async () => {
		const refused = await answer(writeDisplay(call('PUT', '/api/settings/display', { newBadgeDays: 31 })));
		expect(refused.status).toBe(422);
		expect((await answer(readDisplay(call('GET', '/api/settings/display')))).body).toEqual({ settings: { newBadgeDays: 1 } });
		expect(audit).toEqual([]);
	});

	it('cannot be changed by a member', async () => {
		expect((await answer(writeDisplay(call('PUT', '/api/settings/display', { newBadgeDays: 7 }, 'member@example.test')))).status).toBe(403);
		expect((await answer(readDisplay(call('GET', '/api/settings/display')))).body).toEqual({ settings: { newBadgeDays: 1 } });
	});
});

describe('what may leave the installation', () => {
	const choices = { updateCheck: true, feedbackOnline: false, onlineHelp: true, specLanguage: 'en' };

	it('is answered once by an administrator, who is named as the one who validated it', async () => {
		const saved = await answer(writeConfiguration(call('PUT', '/api/install-configuration', choices)));
		expect(saved.status).toBe(200);
		expect(saved.body).toMatchObject({ validated: true, validatedBy: ADMIN, updateCheck: true, feedbackOnline: false, onlineHelp: true });
		expect(audit).toMatchObject([{ action: 'settings.update', actor: ADMIN }]);
	});

	it('needs every question answered, recording nothing otherwise', async () => {
		expect((await answer(writeConfiguration(call('PUT', '/api/install-configuration', { ...choices, onlineHelp: 'yes' })))).status).toBe(400);
		expect(await services().loadInstallConfiguration.execute()).toMatchObject({ validated: false });
	});

	it('is decided by no member, recording nothing', async () => {
		expect((await answer(writeConfiguration(call('PUT', '/api/install-configuration', choices, 'member@example.test')))).status).toBe(403);
		expect(await services().loadInstallConfiguration.execute()).toMatchObject({ validated: false });
		expect(audit).toEqual([]);
	});
});
