import { describe, expect, it } from 'vitest';
import {
	defaultFeedbackSettings,
	defaultInstallConfiguration,
	type FeedbackSettings,
	type InstallConfiguration
} from '$domain/settings';
import { LoadInstallConfigurationUseCase } from './load-install-configuration';
import { SaveInstallConfigurationUseCase } from './save-install-configuration';

function fakeRepo() {
	const state: { configuration: InstallConfiguration; feedback: FeedbackSettings } = {
		configuration: defaultInstallConfiguration(),
		feedback: defaultFeedbackSettings()
	};
	return {
		state,
		loadInstallConfiguration: async () => state.configuration,
		saveInstallConfiguration: async (c: InstallConfiguration) => void (state.configuration = c),
		loadFeedback: async () => state.feedback,
		saveFeedback: async (f: FeedbackSettings) => void (state.feedback = f)
	};
}

const clock = { nowIso: () => '2026-11-08T10:00:00.000Z' };

describe('the configuration of the installation', () => {
	it('opens unticked and in English on a fresh installation', async () => {
		const view = await new LoadInstallConfigurationUseCase(fakeRepo(), false).execute();
		expect(view).toMatchObject({
			validated: false,
			updateCheck: false,
			feedbackOnline: false,
			onlineHelp: false,
			specLanguage: 'en'
		});
	});

	it('ticks the update check a host prepared, without allowing it', async () => {
		const load = new LoadInstallConfigurationUseCase(fakeRepo(), true);
		expect((await load.execute()).updateCheck).toBe(true);
		expect((await load.allowance()).updateCheck).toBe(false);
	});

	it('keeps an administrator who unticked it against the host preset', async () => {
		const repo = fakeRepo();
		await new SaveInstallConfigurationUseCase(repo, clock).execute(
			{ updateCheck: false, feedbackOnline: false, onlineHelp: false, specLanguage: 'en' },
			'admin@acme.io'
		);
		expect((await new LoadInstallConfigurationUseCase(repo, true).execute()).updateCheck).toBe(false);
	});

	it('records who validated and allows what was ticked, and only that', async () => {
		const repo = fakeRepo();
		const load = new LoadInstallConfigurationUseCase(repo, false);
		await new SaveInstallConfigurationUseCase(repo, clock).execute(
			{ updateCheck: true, feedbackOnline: false, onlineHelp: true, specLanguage: 'fr' },
			'admin@acme.io'
		);
		expect(await load.execute()).toMatchObject({
			validated: true,
			validatedAt: '2026-11-08T10:00:00.000Z',
			validatedBy: 'admin@acme.io',
			specLanguage: 'fr'
		});
		expect(await load.allowance()).toEqual({ updateCheck: true, feedbackOnline: false, onlineHelp: true });
		expect(await load.preferredSpecLanguage()).toBe('fr');
	});

	it('writes the validation last, so a failure leaves the installation shut', async () => {
		const repo = fakeRepo();
		repo.saveFeedback = async () => {
			throw new Error('store down');
		};
		await expect(
			new SaveInstallConfigurationUseCase(repo, clock).execute(
				{ updateCheck: true, feedbackOnline: true, onlineHelp: true, specLanguage: 'en' },
				'admin@acme.io'
			)
		).rejects.toThrow('store down');
		expect(repo.state.configuration.validatedAt).toBeNull();
	});
});
