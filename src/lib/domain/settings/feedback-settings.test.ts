import { describe, it, expect } from 'vitest';
import { defaultFeedbackSettings, normalizeFeedbackSettings } from './feedback-settings';

describe('normalizeFeedbackSettings', () => {
	it('defaults to the channel being offered', () => {
		expect(defaultFeedbackSettings().onlineEnabled).toBe(true);
		expect(normalizeFeedbackSettings(null).onlineEnabled).toBe(true);
		expect(normalizeFeedbackSettings('nope').onlineEnabled).toBe(true);
		expect(normalizeFeedbackSettings({}).onlineEnabled).toBe(true);
	});

	it('keeps an explicit boolean', () => {
		expect(normalizeFeedbackSettings({ onlineEnabled: false }).onlineEnabled).toBe(false);
		expect(normalizeFeedbackSettings({ onlineEnabled: true }).onlineEnabled).toBe(true);
	});

	it('ignores non-boolean values', () => {
		expect(normalizeFeedbackSettings({ onlineEnabled: 'no' }).onlineEnabled).toBe(true);
	});
});
