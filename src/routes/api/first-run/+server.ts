import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { RequestHandler } from './$types';

/**
 * Whether this install still waits for its first operator: no account exists
 * and the claim screen on /login is open. Public on purpose (listed in the
 * hook's PUBLIC_PATHS): the appliance installer asks it to decide what to tell
 * the operator at the end of an install or update, on a Community install
 * that has no Back to ask. It reveals nothing a visit to /login would not.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const services = getServices();
	const unclaimed =
		locals.authRequired && services.licenseRequired() && (await services.identity.installUnclaimed());
	return json({ unclaimed });
};
