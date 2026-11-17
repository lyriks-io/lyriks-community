import { error, json } from '@sveltejs/kit';
import { parseInstallChoices } from '$domain/settings';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/**
 * Records the configuration of the installation: the first answer right after
 * the password, and every change made later in Settings. Admin-only, because
 * what leaves an installation is decided for everybody on it (action 8b4118e5).
 */
export const PUT: RequestHandler = async (event) => {
	requireAdmin(event);
	const choices = parseInstallChoices(await event.request.json().catch(() => null));
	if (!choices) error(400, 'Answer every question of the configuration.');
	const { locals } = event;
	const services = event.locals.services;
	const actor = locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev');
	await services.saveInstallConfiguration.execute(choices, actor);
	services.audit.record({
		action: 'settings.update',
		actor,
		outcome: 'success',
		detail: `configuration update-check=${choices.updateCheck} feedback-online=${choices.feedbackOnline} online-help=${choices.onlineHelp} spec-language=${choices.specLanguage}`
	});
	return json(await services.loadInstallConfiguration.execute());
};
