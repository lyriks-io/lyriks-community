import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/** Read the app-level AI settings. */
export const GET: RequestHandler = async () => {
	const services = getServices();
	const ai = await services.loadSettings.execute();
	return json({ ai });
};

/** Persist the app-level AI settings (normalized server-side). */
export const PUT: RequestHandler = async (event) => {
	const { request, locals } = event;
	// The switch is app-wide, not project-scoped — only an admin may flip it,
	// otherwise any user could authorize or block AI suggestions for everyone.
	requireAdmin(event);
	const body = await request.json().catch(() => ({}));
	const services = getServices();
	const ai = await services.saveSettings.execute(body);
	services.audit.record({
		action: 'settings.update',
		actor: locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev'),
		outcome: 'success',
		detail: `suggestions=${ai.suggestionsEnabled ? 'authorized' : 'blocked'}`
	});
	return json({ ai });
};
