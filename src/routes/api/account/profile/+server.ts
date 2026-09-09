import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { IdentityError } from '$application/ports';
import { SESSION_COOKIE } from '$lib/server/session-cookie.server';
import type { RequestHandler } from './$types';

/** Read the single operator's profile (Community / solo editions). */
export const GET: RequestHandler = async () => {
	const profile = await getServices().loadOperatorProfile.execute();
	return json({ profile });
};

/**
 * Update the caller's own display name.
 *
 * In Enterprise the name is owned by lyriks-back, so this forwards to its
 * self-service endpoint rather than refusing. It used to fail closed on the
 * grounds that "identity is managed there" — true, but the conclusion was
 * wrong: the back has always let an account edit itself, and denying it here
 * left the appliance's first admin with a name only somebody else could set,
 * when no somebody else exists.
 */
export const PUT: RequestHandler = async (event) => {
	const services = getServices();
	if (services.identity.multiUser) {
		const body = (await event.request.json().catch(() => ({}))) as {
			firstName?: string;
			lastName?: string;
		};
		try {
			await services.identity.updateProfile(event.cookies.get(SESSION_COOKIE) ?? '', {
				firstName: body.firstName ?? '',
				lastName: body.lastName ?? ''
			});
		} catch (e) {
			error(e instanceof IdentityError ? e.status : 502, 'Could not reach the identity service.');
		}
		services.audit.record({
			action: 'account.profile.update',
			actor: event.locals.session?.email ?? 'anonymous',
			outcome: 'success',
			detail: 'self-service via lyriks-back'
		});
		return json({ profile: { displayName: [body.firstName, body.lastName].filter(Boolean).join(' ') } });
	}
	const body = await event.request.json().catch(() => ({}));
	const profile = await services.saveOperatorProfile.execute(body);
	services.audit.record({
		action: 'account.profile.update',
		actor: event.locals.session?.email ?? (event.locals.authRequired ? 'anonymous' : 'dev'),
		outcome: 'success',
		detail: `displayName=${profile.displayName ? 'set' : 'cleared'}`
	});
	return json({ profile });
};
