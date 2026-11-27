import { authEnforced } from '$lib/server/auth-policy.server';
import { isAdmin } from '$lib/server/admin.server';
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getServices } from '$composition/container.server';
import { isLicenseValid } from '$domain/licensing';
import { runWithRequestContext } from '$lib/server/request-context.server';
import { enforceTrustedOrigin } from '$lib/server/csrf.server';
import { isMcpPath, mcpTarget, proxyToMcp } from '$lib/server/mcp-proxy.server';
import { followAiProjectCalls } from '$lib/server/retrospec-ai.server';
import { slowRequestLine } from '$lib/server/slow-requests.server';
import { startStallWatch, trackRequest } from '$lib/server/event-loop-stalls.server';
import { WARM_UP_DELAY_MS, warmUp, warmUpEnabled } from '$lib/server/startup-warm-up.server';
import { building, dev } from '$app/environment';
import { rememberRequestIdentity } from '$lib/server/request-identity.server';
import { inactiveProjectResponse } from '$lib/server/active-project.server';
import {
	SESSION_COOKIE,
	deleteSessionCookie,
	refreshSessionCookieDomain
} from '$lib/server/session-cookie.server';

/**
 * Per-request session + access guard.
 *
 * Two modes. Every declared edition (`LYRIKS_EDITION`) runs the real one, and
 * `LYRIKS_AUTH_REQUIRED=1` switches it on for a build that declares nothing;
 * the flag can never switch it off (see `isAuthEnforced`):
 *
 *  - **off**: the development fallback. Every request is the implicit dev
 *    session (`{ isAuthenticated: true }`, no email), so plain `pnpm dev` keeps
 *    "just opening" with no login wall.
 *  - **on**: real auth. Read the httpOnly `lyriks_session` cookie (a session
 *    JWT), validate it through the identity provider, and populate
 *    `locals.session`. Unauthenticated page requests are redirected to
 *    `/login`; unauthenticated `/api/*` requests get a 401.
 *
 * The bearer token never leaves the cookie — `locals.session` is client-safe.
 */
// Public paths bypass the auth wall — login flow + the orchestrator health probes.
const PUBLIC_PATHS = new Set(['/login', '/logout', '/healthz', '/readyz', '/api/first-run']);

/**
 * Pages a signed-out visitor must reach besides PUBLIC_PATHS: the page a password
 * reset link opens is for someone who cannot sign in (their password was taken
 * away); the token in its address is the secret, checked by the account service.
 * An installation without that page answers 404 there, like any unknown address.
 */
function isSessionlessPath(path: string): boolean {
	return PUBLIC_PATHS.has(path) || path.startsWith('/reset-password/');
}

// Start migrations during process bootstrap instead of making the first user
// request pay the upgrade cost. A failure is logged; `ready()` resets its
// rejected promise so readiness or a later request can retry. Once the store
// answers, the projects worked on last are read ahead (see startup-warm-up),
// so the first pages after a deploy do not compute everything at once.
const datastoreReady = getServices()
	.pingDatastore()
	.then(() => true)
	.catch((error) => {
		console.error(
			'[lyriks][datastore] startup migration/readiness failed:',
			error instanceof Error ? error.message : error
		);
		return false;
	});
if (!building && !dev && warmUpEnabled(env.LYRIKS_WARM_UP)) {
	void datastoreReady.then((ready) => {
		if (!ready) return;
		setTimeout(() => {
			void warmUp(getServices(), { log: (line) => console.log(line) }).catch(() => {});
		}, WARM_UP_DELAY_MS).unref?.();
	});
}

// Re-deliver the activated licence to the Back's seat gate at boot, so an
// existing licensed install (including one just updated) refreshes the Back's
// in-memory seat count without waiting for a re-activation. Best-effort.
void getServices()
	.syncBackLicence.execute(true)
	.catch(() => {});

function isAssetPath(path: string): boolean {
	return (
		path.startsWith('/_app/') ||
		path === '/favicon.ico' ||
		path === '/favicon.png' ||
		path === '/favicon.svg' ||
		path.startsWith('/.well-known/')
	);
}

// Paths reachable without a valid licence: the activation screen + its API, plus
// the always-public health/login paths. Everything else is walled until activated.
function isLicensePublicPath(path: string): boolean {
	return (
		PUBLIC_PATHS.has(path) ||
		path === '/activate' ||
		path === '/api/license' ||
		path.startsWith('/api/license/')
	);
}

/**
 * Offline product-activation gate. OFF by default (LYRIKS_LICENSE_REQUIRED unset)
 * so the standalone MAP / `pnpm dev` boot keeps running unlicensed — matching the
 * air-gap posture where nothing is enforced without an operator opting in. When
 * ON, the licence key is re-verified locally (no egress) and the app is walled
 * behind `/activate` until a valid, unexpired key is present. Returns a blocking
 * Response for `/api/*`, throws a redirect for pages, or null to let the request
 * through. Always sets `event.locals.license` for the shell to read.
 */
async function enforceActivation(
	event: Parameters<Handle>[0]['event']
): Promise<Response | null> {
	const services = getServices();
	event.locals.licenseRequired = services.licenseRequired();
	if (!event.locals.licenseRequired) {
		event.locals.license = null;
		return null;
	}

	const view = await services.loadActivation.execute();
	event.locals.license = view;
	// Throttled re-delivery to the Back's seat gate (at most once a minute), so a
	// Back that restarted picks the seat count back up within a minute. No back
	// call on the hot path most of the time; never blocks the request.
	void services.syncBackLicence.execute().catch(() => {});
	if (isLicenseValid(view) || isLicensePublicPath(event.url.pathname)) return null;

	if (event.url.pathname.startsWith('/api/')) {
		// 402 Payment Required — the honest status for "not licensed".
		return new Response(JSON.stringify({ error: 'not_activated', status: view.status }), {
			status: 402,
			headers: { 'content-type': 'application/json' }
		});
	}
	redirect(303, '/activate');
}

/**
 * The feedback dialog's online channel posts from the BROWSER straight to the
 * configured relay (never through this server), and the build-time CSP cannot
 * know that runtime origin. Sanction exactly that one destination in
 * connect-src; every other cross-origin fetch stays forbidden. With the
 * channel off (`LYRIKS_FEEDBACK_URL=off`) nothing is added at all.
 */
function allowFeedbackOrigin(res: Response): void {
	let endpoint = '';
	try {
		endpoint = getServices().feedbackEndpoint();
	} catch {
		return; // container not ready: a header nicety must never break a response
	}
	if (!endpoint) return;
	const csp = res.headers.get('content-security-policy');
	if (!csp) return;
	let origin: string;
	try {
		origin = new URL(endpoint).origin;
	} catch {
		return;
	}
	const pattern = /connect-src ([^;]*)/;
	const match = csp.match(pattern);
	if (!match || match[1].includes(origin)) return;
	res.headers.set('content-security-policy', csp.replace(pattern, `connect-src ${match[1].trim()} ${origin}`));
}


/**
 * Defense-in-depth response headers, safe to set unconditionally (clickjacking,
 * MIME-sniffing, referrer leakage, cross-origin isolation, HSTS over TLS). The
 * nonce/hash-aware Content-Security-Policy is configured through SvelteKit.
 */
function withSecurityHeaders(event: Parameters<Handle>[0]['event'], res: Response): Response {
	res.headers.set('x-content-type-options', 'nosniff');
	res.headers.set('x-frame-options', 'DENY');
	res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	res.headers.set('cross-origin-opener-policy', 'same-origin');
	res.headers.set(
		'permissions-policy',
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'
	);
	if (event.url.pathname.startsWith('/api/') || res.headers.get('content-type')?.includes('text/html')) {
		res.headers.set('cache-control', 'private, no-store');
	}
	allowFeedbackOrigin(res);
	const proto =
		event.request.headers.get('x-forwarded-proto') ?? event.url.protocol.replace(':', '');
	if (proto === 'https') {
		res.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
	}
	return res;
}

// A computation that holds the one thread holds every request: each stall is logged with the requests it fell in.
startStallWatch();

// The MCP's calls on a project are announced as the AI's activity there (retrospec-ai.server.ts); a slow request is logged.
export const handle: Handle = async (input) => {
	// The one place a request receives the composition root: routes read it from here.
	input.event.locals.services = getServices();
	const started = performance.now();
	// A page's data fetched on navigation is told apart from a whole page served.
	const path = input.event.isDataRequest ? `${input.event.url.pathname} (data)` : input.event.url.pathname;
	const ended = trackRequest(`${input.event.request.method} ${path}`);
	try {
		const res = await followAiProjectCalls(input, handleRequest);
		const slow = slowRequestLine(input.event.request.method, path, performance.now() - started);
		if (slow) console.warn(slow);
		return res;
	} finally {
		ended();
	}
};

const handleRequest: Handle = async ({ event, resolve }) => {
	// Vite folds `dev` to false in the shipped build: no appliance reaches the exemption.
	const authRequired = authEnforced();
	event.locals.authRequired = authRequired;

	// The MCP gateway answers on this origin so its OAuth login can share this
	// app's session cookie. It authenticates its own callers and comes back
	// through /api/* for everything else, so it runs ahead of the guards below.
	const gateway = mcpTarget();
	if (gateway && isMcpPath(event.url.pathname)) return proxyToMcp(event, gateway);

	// Runtime CSRF origin check. Runs before auth so it covers /login too.
	enforceTrustedOrigin(event);

	// Asset requests never read session or the licence — keep them fast.
	if (isAssetPath(event.url.pathname)) {
		event.locals.session = { isAuthenticated: !authRequired };
		event.locals.licenseRequired = false;
		event.locals.license = null;
		return withSecurityHeaders(event, await resolve(event));
	}

	if (!authRequired) {
		// Dev fallback — implicit dev session, no auth guard. Still pinned in the
		// request context so the session port answers identically on both paths.
		const devSession = { isAuthenticated: true };
		event.locals.session = devSession;
		const licenseBlock = await enforceActivation(event);
		if (licenseBlock) return withSecurityHeaders(event, licenseBlock);
		const inactive = await inactiveProjectResponse(event);
		if (inactive) return withSecurityHeaders(event, inactive);
		return runWithRequestContext({ token: null, workspaceId: null, session: devSession }, async () =>
			withSecurityHeaders(event, await resolve(event))
		);
	}

	// ── Real auth path ────────────────────────────────────────────────────────
	// Whichever source holds the account: lyriks-back, or the platform's own
	// operator account on a Community install that runs without a Back.
	const identity = getServices().identity;
	const token = event.cookies.get(SESSION_COOKIE);
	let session = { isAuthenticated: false } as App.Locals['session'];
	let backUnreachable = false;

	if (token && identity.configured) {
		const account = await identity.verify(token);
		if (account === 'unreachable') {
			// Fail closed (unauthenticated) but keep the cookie so a transient
			// outage does not force a re-login. The login page explains the outage
			// via the `reason` flag added to the redirect below.
			backUnreachable = true;
		} else if (account) {
			rememberRequestIdentity(event.request, token, account);
			session = {
				isAuthenticated: true,
				email: account.email,
				mustChangePassword: account.mustChangePassword
			};
			// Widens pre-existing host-only sessions when LYRIKS_COOKIE_DOMAIN is
			// configured; no-op otherwise (see session-cookie.server.ts).
			refreshSessionCookieDomain(event.cookies, token);
		} else {
			// Invalid/expired token: drop it so the user re-authenticates.
			deleteSessionCookie(event.cookies);
		}
	}

	event.locals.session = session;

	if (!session.isAuthenticated && !isSessionlessPath(event.url.pathname)) {
		if (event.url.pathname.startsWith('/api/')) {
			// An outage is not a verdict on the session, and 401 reads as one: the
			// MCP gateway checks its clients' sessions through /api/auth/session and
			// ends their sign-in on a 401, which sends every client process to the
			// browser whenever the account service restarts or runs slow.
			return withSecurityHeaders(
				event,
				new Response(JSON.stringify({ error: backUnreachable ? 'account service unavailable' : 'unauthenticated' }), {
					status: backUnreachable ? 503 : 401,
					headers: backUnreachable
						? { 'content-type': 'application/json', 'retry-after': '5' }
						: { 'content-type': 'application/json' }
				})
			);
		}
		// Carry the intended destination so post-login returns there (e.g. an invite
		// link /join/<token>). Only the local path+query is passed; /login validates it.
		const target = event.url.pathname + event.url.search;
		const reason = backUnreachable ? '&reason=unreachable' : '';
		redirect(303, `/login?redirect=${encodeURIComponent(target)}${reason}`);
	}

	// An account still on the installer's generated password is walled into
	// changing it: every page except Settings (where the change lives) redirects
	// there. Pages only; /api/* stays open so Settings can do its work, because
	// the flag is provisioning hygiene, not a security boundary: the caller DOES
	// hold the credential, they just never chose it.
	//
	// The #account fragment is load-bearing: Settings is a closed accordion that
	// only opens a panel from a hash deep-link, and the password form lives in
	// the Account panel. Without it the wall drops the user on a page of closed
	// panels with no hint of where the change lives. The query marker stays as
	// the machine-readable signal (fragments never reach the server), and the
	// page opens the panel from either one.
	//
	// /activate must pass this wall: the licence gate below walls /settings (it
	// exempts only its own paths), so on an unactivated install a must-change
	// account got ping-ponged /settings -> /activate -> /settings forever and
	// was locked out of the whole product. That is every fresh Community
	// install whose operator signs in before pasting a key (found in the
	// field, 2026-08). Activation therefore comes first, the password change
	// right after; /api/license/* is already covered by the /api/* exemption.
	if (
		session.isAuthenticated &&
		session.mustChangePassword &&
		!event.url.pathname.startsWith('/settings') &&
		!event.url.pathname.startsWith('/api/') &&
		event.url.pathname !== '/activate' &&
		!PUBLIC_PATHS.has(event.url.pathname)
	) {
		redirect(303, '/settings?password=change#account');
	}

	// Authenticated — now gate on product activation (if enforced).
	const licenseBlock = await enforceActivation(event);
	if (licenseBlock) return withSecurityHeaders(event, licenseBlock);

	// The password was the last thing the install asked for itself: an administrator
	// now decides what may leave it, before the product opens (action d431d906).
	// Behind the two walls above so the three never bounce a request between them;
	// pages only, so the form can save. Everybody else goes through: the installation
	// simply stays shut until an administrator comes.
	if (
		session.isAuthenticated &&
		!session.mustChangePassword &&
		!event.url.pathname.startsWith('/api/') &&
		event.url.pathname !== '/first-configuration' &&
		event.url.pathname !== '/activate' &&
		!PUBLIC_PATHS.has(event.url.pathname) &&
		isAdmin(event) &&
		!(await getServices().loadInstallConfiguration.execute()).validated
	) {
		redirect(303, '/first-configuration');
	}

	// Propagate the caller's identity + selected workspace through the request so
	// the back mirror acts AS this user, in their active team, and every use-case
	// reading the session port sees the real caller (not an anonymous placeholder).
	// Read by the back HTTP adapter and the session adapter. (The token never
	// leaves the cookie; the session and workspace id are client-safe.)
	const workspaceId = event.cookies.get('lyriks_active_ws') ?? null;
	// Community works on its active project alone (EVO-001).
	const inactive = await inactiveProjectResponse(event);
	if (inactive) return withSecurityHeaders(event, inactive);
	return runWithRequestContext({ token: token ?? null, workspaceId, session }, async () =>
		withSecurityHeaders(event, await resolve(event))
	);
};

/**
 * Unexpected server errors: log the full error server-side, hand the client
 * only SvelteKit's safe status message so internals (stack traces, connection
 * strings, back URLs) never leak into the rendered error page.
 */
export const handleError: HandleServerError = ({ error, status, message, event }) => {
	if (status !== 404) {
		console.error(
			`[lyriks][error] ${event.request.method} ${event.url.pathname} → ${status}:`,
			error
		);
	}
	return { message };
};
