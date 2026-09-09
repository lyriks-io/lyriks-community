import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsSettingsRepository } from './local-fs-settings-repository.server';

describe('LocalFsSettingsRepository', () => {
	it('persists the settings atomically with owner-only permissions', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-settings-'));
		const path = join(root, 'nested', 'settings.json');
		const repository = new LocalFsSettingsRepository(path);

		await repository.saveAi({ suggestionsEnabled: true });

		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(readFileSync(path, 'utf8')).toContain('suggestionsEnabled');
		expect(await repository.loadAi()).toEqual({ suggestionsEnabled: true });
	});

	it('keeps one concern when saving the other', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-settings-'));
		const repository = new LocalFsSettingsRepository(join(root, 'settings.json'));

		await repository.saveAi({ suggestionsEnabled: true });
		await repository.saveFeedback({ onlineEnabled: false });

		expect(await repository.loadAi()).toEqual({ suggestionsEnabled: true });
		expect(await repository.loadFeedback()).toEqual({ onlineEnabled: false });
	});
});
