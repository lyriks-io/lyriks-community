import { describe, expect, it } from 'vitest';
import { defaultStoredAssistant, normalizeStoredAssistant } from './assistant-settings';
import { defaultOperatorProfile, normalizeOperatorProfile } from './operator-profile';

describe('the stored assistant settings, read back', () => {
	const connected = { enabled: true, provider: 'openai', model: ' gpt-5.5 ', sealedKey: 'sealed', keyHint: '…abcd', test: 'works', testedAt: '2026-11-17T10:00:00.000Z' };

	it('reads a connected assistant as it was stored', () => {
		expect(normalizeStoredAssistant(connected)).toMatchObject({ enabled: true, provider: 'openai', model: 'gpt-5.5', keyHint: '…abcd', sealedKey: 'sealed', test: 'works' });
	});

	it('never reads the switch as on, nor shows a key hint, without a stored key', () => {
		for (const sealedKey of [null, '', 42]) {
			expect(normalizeStoredAssistant({ ...connected, sealedKey })).toMatchObject({ enabled: false, sealedKey: null, keyHint: null });
		}
	});

	it('takes an unknown provider as Claude and an unknown test outcome as untested', () => {
		expect(normalizeStoredAssistant({ ...connected, provider: 'mistral', test: 'maybe' })).toMatchObject({ provider: 'anthropic', test: 'untested' });
	});

	it('reads anything but a document as the defaults, off', () => {
		for (const input of [null, 'on', 3]) expect(normalizeStoredAssistant(input)).toEqual(defaultStoredAssistant());
	});
});

describe('the operator profile, read from a request or the store', () => {
	it('keeps a display name trimmed and at most 80 characters, and nothing that is not text', () => {
		expect(normalizeOperatorProfile({ displayName: '  Ana  ' })).toEqual({ displayName: 'Ana' });
		expect(normalizeOperatorProfile({ displayName: 'x'.repeat(90) }).displayName).toHaveLength(80);
		expect(normalizeOperatorProfile({ displayName: 7 })).toEqual({ displayName: '' });
		expect(normalizeOperatorProfile(null)).toEqual(defaultOperatorProfile());
	});
});
