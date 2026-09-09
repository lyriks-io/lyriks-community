import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/**
 * Step back to the key this install ran on before the current one.
 *
 * The companion of the preview: a key swap is reversible on the box itself, so
 * an operator can accept a renewal, see it in place, and undo it without
 * hunting for the old key in an inbox.
 *
 *   POST /api/license/previous → { ok, view } | { ok: false, reason, view }
 */
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const services = getServices();
	const result = await services.restorePreviousLicense.execute(event.locals.session?.email ?? 'api');
	if (result.ok) {
		// The seat gate must follow the key that is actually in force, or the Back
		// keeps enforcing the licence that was just stepped away from.
		await services.syncBackLicence.execute(true);
	}
	return json(result, { status: result.ok ? 200 : 400 });
};
