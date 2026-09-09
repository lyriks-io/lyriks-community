import { describe, it, expect } from 'vitest';
import { defaultAiSettings, normalizeAiSettings } from './ai-settings';

describe('normalizeAiSettings', () => {
	it('defaults to blocked', () => {
		expect(defaultAiSettings().suggestionsEnabled).toBe(false);
		expect(normalizeAiSettings(null).suggestionsEnabled).toBe(false);
		expect(normalizeAiSettings('nope').suggestionsEnabled).toBe(false);
		expect(normalizeAiSettings({}).suggestionsEnabled).toBe(false);
	});

	it('keeps an explicit boolean', () => {
		expect(normalizeAiSettings({ suggestionsEnabled: true }).suggestionsEnabled).toBe(true);
		expect(normalizeAiSettings({ suggestionsEnabled: false }).suggestionsEnabled).toBe(false);
	});

	it('ignores non-boolean values', () => {
		expect(normalizeAiSettings({ suggestionsEnabled: 'yes' }).suggestionsEnabled).toBe(false);
	});

	it('maps legacy provider documents: LLM-backed → authorized, offline → blocked', () => {
		expect(normalizeAiSettings({ provider: 'byok', byokApiKey: 'sk' }).suggestionsEnabled).toBe(true);
		expect(normalizeAiSettings({ provider: 'lyriks-mcp' }).suggestionsEnabled).toBe(true);
		expect(normalizeAiSettings({ provider: 'offline' }).suggestionsEnabled).toBe(false);
	});

	it('never carries legacy secrets forward', () => {
		const normalized = normalizeAiSettings({ provider: 'byok', byokApiKey: 'sk-ant-secret' });
		expect(JSON.stringify(normalized)).not.toContain('sk-ant-secret');
	});
});
