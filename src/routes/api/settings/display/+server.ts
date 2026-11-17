import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/** Read how the app reads to everyone: how long New lasts (criterion 8c1e9288). */
export const GET: RequestHandler = async ({ locals }) => json({ settings: await locals.services.loadDisplaySettings.execute() });

/** Change it: app-wide, so admin-only like the other switches; a value out of range is refused with it. */
export const PUT: RequestHandler = async (event) => {
	requireAdmin(event);
	const services = event.locals.services;
	const result = await services.saveDisplaySettings.execute(await event.request.json().catch(() => ({})));
	if (!result.ok) return json({ refusal: result.refusal }, { status: 422 });
	services.audit.record({
		action: 'settings.update',
		actor: event.locals.session?.email ?? (event.locals.authRequired ? 'anonymous' : 'dev'),
		outcome: 'success',
		detail: `new-badge-days=${result.settings.newBadgeDays}`
	});
	return json({ settings: result.settings });
};
