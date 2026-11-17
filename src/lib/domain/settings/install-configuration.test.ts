import { describe, expect, it } from 'vitest';
import {
	defaultInstallConfiguration,
	normalizeInstallConfiguration,
	outboundAllowance,
	parseInstallChoices
} from './install-configuration';

const validated = { ...defaultInstallConfiguration(), validatedAt: '2026-11-08T10:00:00.000Z', validatedBy: 'a@b.c' };

describe('outboundAllowance', () => {
	it('allows nothing before an administrator validated, whatever is stored', () => {
		const stored = { ...defaultInstallConfiguration(), updateCheck: true, onlineHelp: true };
		expect(outboundAllowance(stored, { onlineEnabled: true })).toEqual({
			updateCheck: false,
			feedbackOnline: false,
			onlineHelp: false
		});
	});

	it('allows each thing on its own once validated', () => {
		expect(outboundAllowance({ ...validated, updateCheck: true }, { onlineEnabled: false })).toEqual({
			updateCheck: true,
			feedbackOnline: false,
			onlineHelp: false
		});
		expect(outboundAllowance(validated, { onlineEnabled: true }).feedbackOnline).toBe(true);
	});
});

describe('normalizeInstallConfiguration', () => {
	it('reads a malformed document as nobody decided', () => {
		expect(normalizeInstallConfiguration(null)).toEqual(defaultInstallConfiguration());
		expect(normalizeInstallConfiguration({ updateCheck: 'yes', specLanguage: 'klingon', validatedAt: 3 })).toEqual(
			defaultInstallConfiguration()
		);
	});

	it('keeps a stored decision', () => {
		expect(normalizeInstallConfiguration({ ...validated, updateCheck: true, specLanguage: 'fr' })).toEqual({
			...validated,
			updateCheck: true,
			specLanguage: 'fr'
		});
	});
});

describe('parseInstallChoices', () => {
	const answers = { updateCheck: true, feedbackOnline: false, onlineHelp: false, specLanguage: 'fr' };

	it('takes a complete answer', () => {
		expect(parseInstallChoices(answers)).toEqual(answers);
	});

	it('refuses a missing answer or a language out of the list', () => {
		expect(parseInstallChoices({ ...answers, onlineHelp: undefined })).toBeNull();
		expect(parseInstallChoices({ ...answers, specLanguage: 'klingon' })).toBeNull();
		expect(parseInstallChoices({ ...answers, specLanguage: 'constructor' })).toBeNull();
		expect(parseInstallChoices(null)).toBeNull();
	});
});
