import { error, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Parse the comma-separated LYRIKS_TRUSTED_ORIGINS allowlist. */
function allowlist(): string[] {
	return (env.LYRIKS_TRUSTED_ORIGINS ?? '')
		.split(',')
		.map((o) => o.trim().replace(/\/$/, ''))
		.filter((o) => o.length > 0);
}

/**
 * Runtime CSRF origin check for every state-changing request.
 *
 * The build-time SvelteKit guard is disabled (`trustedOrigins:['*']`) because an
 * appliance is reached from unknown hosts. The request's own origin is therefore
 * always trusted: a request whose Origin names the very host it was sent to
 * (the Host header) is same-origin by construction, and a browser cannot forge
 * that pair. The comparison is on the host alone because the runtime does not
 * know the scheme a request arrived on: adapter-node assumes https unless
 * PROTOCOL_HEADER says otherwise, so `event.url.origin` reads https://platform:3000
 * for a plain-http call inside the appliance network. Operators behind a proxy
 * or serving several public names add them through LYRIKS_TRUSTED_ORIGINS; that
 * list extends the request's own origin, it never replaces it. The behaviour
 * dashboard depends on this: it calls the platform on the internal service name
 * (UNSPA_HOST_URL) to run a checked state deletion, and an appliance names only
 * its public origin in the allowlist. A missing Origin is allowed for
 * non-browser clients, except when Fetch Metadata identifies the request as
 * cross-site.
 */
export function enforceTrustedOrigin(event: RequestEvent): void {
	if (!MUTATING.has(event.request.method)) return;
	const allowed = [event.url.origin, ...allowlist()];

	const origin = event.request.headers.get('origin');
	if (!origin) {
		if (event.request.headers.get('sec-fetch-site') === 'cross-site') {
			error(403, 'cross-origin request blocked');
		}
		return;
	}
	if (allowed.includes(origin.replace(/\/$/, ''))) return;
	if (originHost(origin) === event.request.headers.get('host')) return;
	error(403, 'cross-origin request blocked');
}

/** The host[:port] an Origin header names, or null when it is not a URL. */
function originHost(origin: string): string | null {
	try {
		return new URL(origin).host || null;
	} catch {
		return null;
	}
}
