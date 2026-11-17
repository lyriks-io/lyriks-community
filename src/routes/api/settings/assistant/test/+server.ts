import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.server';
import { modelOf } from '$domain/settings';
import type { RequestHandler } from './$types';

/** One small call with the stored connection, said in plain words (ac-adm-ai-test). */
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const services = event.locals.services;
	const actor = event.locals.session?.email ?? (event.locals.authRequired ? 'anonymous' : 'dev');
	const outcome = await services.testAssistant.execute();
	services.audit.record({
		action: 'settings.assistant.test',
		actor,
		outcome: outcome.ok && outcome.settings.test === 'works' ? 'success' : 'failure',
		detail: outcome.ok ? `provider=${outcome.settings.provider} model=${modelOf(outcome.settings)} ${outcome.settings.test}` : outcome.reason
	});
	if (!outcome.ok) error(422, outcome.reason);
	return json({ assistant: outcome.settings });
};
