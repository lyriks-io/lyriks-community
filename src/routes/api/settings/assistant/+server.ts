import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.server';
import { modelOf, type AssistantSettings } from '$domain/settings';
import type { RequestHandler } from './$types';

/**
 * The built-in assistant's settings (ac-adm-ai-central, -key, -readonly).
 *
 *   GET    -> { assistant }  what anyone signed in may read: never the key.
 *   PUT    { provider, model, apiKey? } connects it; { enabled } switches it.
 *   DELETE -> removes the key, which switches it off.
 *
 * Every write is an administrator's, and the audit trail names who made it,
 * never the key.
 */
const actorOf = (locals: App.Locals) => locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev');
const describe = (a: AssistantSettings) => `${a.enabled ? 'on' : 'off'} provider=${a.provider} model=${modelOf(a)} key=${a.keyHint ? 'stored' : 'none'}`;

export const GET: RequestHandler = async ({ locals }) => json({ assistant: await locals.services.loadAssistantSettings.execute() });

export const PUT: RequestHandler = async (event) => {
	requireAdmin(event);
	const body = ((await event.request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
	const services = event.locals.services;
	const by = actorOf(event.locals);
	const outcome =
		typeof body.enabled === 'boolean'
			? await services.switchAssistant.execute(body.enabled, by)
			: await services.connectAssistant.execute({ provider: body.provider, model: body.model, apiKey: body.apiKey, by });
	services.audit.record({
		action: typeof body.enabled === 'boolean' ? 'settings.assistant.switch' : 'settings.assistant.connect',
		actor: by,
		outcome: outcome.ok ? 'success' : 'failure',
		detail: outcome.ok ? describe(outcome.settings) : outcome.reason
	});
	if (!outcome.ok) error(422, outcome.reason);
	return json({ assistant: outcome.settings });
};

export const DELETE: RequestHandler = async (event) => {
	requireAdmin(event);
	const services = event.locals.services;
	const by = actorOf(event.locals);
	const assistant = await services.removeAssistantKey.execute(by);
	services.audit.record({ action: 'settings.assistant.remove_key', actor: by, outcome: 'success', detail: describe(assistant) });
	return json({ assistant });
};
