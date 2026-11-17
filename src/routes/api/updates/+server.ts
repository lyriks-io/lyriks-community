import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/**
 * Whether a newer appliance release exists. Admin-only: an install's version and
 * currency are operator information, not something every user needs.
 *
 * Advisory only. Applying an update is a deliberate action on the host
 * (`./lyriks update`); the platform container has no Docker socket and must
 * never be given one to update itself.
 *
 * `?force=1` re-checks past the cache for an operator who just published a release.
 */
export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const force = event.url.searchParams.get('force') === '1';
	const status = await event.locals.services.checkForUpdate.execute(force);
	return json(status);
};

/**
 * Check now in Settings, Versions: always past the cache. `{ once: true }` is the
 * administrator's confirmation, in the dialog, to ask a single time while the
 * automatic check is off (criterion a5e298ca). A POST, not a GET, so no link on
 * another site can make an administrator's browser send the installation out.
 * A confirmed check is written to the audit trail with what came back.
 */
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const body = (await event.request.json().catch(() => null)) as { once?: unknown } | null;
	const once = body?.once === true;
	const services = event.locals.services;
	const status = await services.checkForUpdate.execute(true, once);
	if (once) {
		const { locals } = event;
		services.audit.record({
			action: 'updates.check_once',
			actor: locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev'),
			outcome: 'success',
			detail: `asked ${services.checkForUpdate.destination} once: ${status.state}${status.latest ? ` ${status.latest}` : ''}${status.reason ? ` (${status.reason})` : ''}`
		});
	}
	return json(status);
};
