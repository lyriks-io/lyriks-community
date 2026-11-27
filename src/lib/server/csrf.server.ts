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
 *
 * A refusal says why and what to do, and logs one line for the operator: a bare
 * 403 on a sign-in or a claim reads as wrong credentials (criterion 02e6912b).
 */
export function enforceTrustedOrigin(event: RequestEvent): void {
	if (!MUTATING.has(event.request.method)) return;
	const allowed = [event.url.origin, ...allowlist()];
	const host = event.request.headers.get('host');

	const origin = event.request.headers.get('origin');
	if (!origin) {
		if (event.request.headers.get('sec-fetch-site') === 'cross-site') refuse(event, null, host);
		return;
	}
	if (allowed.includes(origin.replace(/\/$/, ''))) return;
	if (originHost(origin) === host) return;
	refuse(event, origin, host);
}

/** Refuse the request: the operator's log line, then the page the person reads. */
function refuse(event: RequestEvent, origin: string | null, host: string | null): never {
	const reached = shown(host ?? event.url.host);
	const from = origin === null ? 'no Origin, marked cross-site' : shown(origin);
	console.warn(`cross-origin request blocked: ${event.request.method} ${event.url.pathname} from ${from} to ${reached}`);
	error(403, blockedChangeMessage(origin, reached));
}

/**
 * What a blocked change tells the person: where the form came from, where it
 * arrived, and what to do. `origin` is the Origin header (null when the browser
 * sent none but marked the request cross-site); the page escapes it.
 */
export function blockedChangeMessage(origin: string | null, reached: string): string {
	const what =
		origin === null
			? `Your browser marked this form as sent from another site, and it reached this installation as ${reached}.`
			: origin === 'null'
				? `This form was sent from a page whose address the browser hides, and it reached this installation as ${reached}.`
				: `This form was sent from ${shown(origin)}, but it reached this installation as ${reached}.`;
	const operator =
		origin === null || origin === 'null'
			? ''
			: ` If ${shown(origin)} is an address of this installation, its operator adds it to LYRIKS_TRUSTED_ORIGINS or has the reverse proxy forward the Host header.`;
	return (
		`Cross-origin request blocked. ${what} Lyriks accepts a change only from its own address, so that no other site` +
		` can act in your name. Open the installation at its own address in an ordinary browser, then send the form again.` +
		operator
	);
}

/** A header value as the page and the log show it: never longer than a line. */
function shown(value: string): string {
	return value.length > 200 ? `${value.slice(0, 200)}...` : value;
}

/** The host[:port] an Origin header names, or null when it is not a URL. */
function originHost(origin: string): string | null {
	try {
		return new URL(origin).host || null;
	} catch {
		return null;
	}
}
