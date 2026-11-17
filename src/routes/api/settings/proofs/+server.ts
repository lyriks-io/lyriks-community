import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/** What Settings, Proofs reads: the switch, the machine and what proofs ask of it (criterion 46637972). */
export const GET: RequestHandler = async ({ locals }) => json({ proofs: await locals.services.loadProofSettings.execute() });

/**
 * Turn proofs on or off for the installation (action 0d29aee8): an
 * administrator only, Enterprise only, never against the environment's
 * UNSPA_SOLVER=off. The engine follows without a restart (criterion 50fb0ae2).
 */
export const PUT: RequestHandler = async (event) => {
	requireAdmin(event);
	const services = event.locals.services;
	const result = await services.saveProofSettings.execute(await event.request.json().catch(() => ({})));
	if (!result.ok) return json({ refusal: result.refusal }, { status: 422 });
	services.audit.record({
		action: 'settings.update',
		actor: event.locals.session?.email ?? (event.locals.authRequired ? 'anonymous' : 'dev'),
		outcome: 'success',
		detail: `proofs=${result.on ? 'on' : 'off'}`
	});
	return json({ proofs: await services.loadProofSettings.execute() });
};
