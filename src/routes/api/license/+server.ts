import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/**
 * Headless activation API for enterprise provisioning (an appliance install
 * script can activate at first boot without the UI). Air-gap safe: the key is
 * verified locally, nothing is called out. Mutations require an app administrator
 * in authenticated mode and always remain reachable through the licence wall.
 *
 *   GET    /api/license            → current activation status
 *   POST   /api/license { key }    → activate from a signed key
 *   DELETE /api/license            → clear the stored key
 */
export const GET: RequestHandler = async () => {
	const view = await getServices().loadActivation.execute();
	return json(view);
};

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const { request, locals } = event;
	const body = (await request.json().catch(() => ({}))) as { key?: unknown };
	const key = typeof body.key === 'string' ? body.key : '';
	const actor = locals.session?.email ?? 'api';
	const services = getServices();
	const result = await services.activateLicense.execute(key, actor);
	// A fresh licence is the install's best identity default (operator name from
	// the customer field). Seeding is best-effort and never overwrites.
	if (result.ok) {
		await services.seedActivationDefaults.execute(result.view.entitlements);
		// Deliver the key to the Back's seat gate immediately.
		await services.syncBackLicence.execute(true);
	}
	return json(result, { status: result.ok ? 200 : 400 });
};

export const DELETE: RequestHandler = async (event) => {
	requireAdmin(event);
	const { locals } = event;
	await getServices().deactivateLicense.execute(locals.session?.email ?? 'api');
	return json({ ok: true });
};
