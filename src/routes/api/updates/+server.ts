import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/**
 * Whether a newer appliance release exists. Admin-only: an install's version and
 * currency are operator information, not something every user needs.
 *
 * Advisory only — there is no companion POST. Applying an update is a deliberate
 * action on the host (`./lyriks update`); the platform container has no Docker
 * socket and must never be given one to update itself.
 *
 * `?force=1` re-checks past the cache for an operator who just published a release.
 */
export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const force = event.url.searchParams.get('force') === '1';
	const status = await getServices().checkForUpdate.execute(force);
	return json(status);
};
