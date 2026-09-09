import { authEnforced } from '$lib/server/auth-policy.server';
import { canUseSharedEditor } from '$lib/server/shared-editor-access.server';
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { getServices } from '$composition/container.server';
import { isLicenseValid } from '$domain/licensing';
import { runWithRequestContext } from '$lib/server/request-context.server';
import { enforceTrustedOrigin } from '$lib/server/csrf.server';
import { isMcpPath, mcpTarget, proxyToMcp } from '$lib/server/mcp-proxy.server';
import {
	editorForbidden,
	isUnspaPath,
	proxyToUnspa,
	unspaTarget
} from '$lib/server/unspa-proxy.server';
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

// Start migrations during process bootstrap instead of making the first user
// request pay the upgrade cost. A failure is logged; `ready()` resets its
// rejected promise so readiness or a later request can retry.
void getServices()
	.pingDatastore()
	.catch((error) =>
		console.error(
			'[lyriks][datastore] startup migration/readiness failed:',
			error instanceof Error ? error.message : error
		)
	);

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
 * Let the policy name the behaviour dashboard, in both directives that reach it.
 *
 * It is a separate origin (the app's host on its own port), so `'self'` covers
 * neither embedding it nor being redirected to it:
 *
 *  - `frame-src`, or the tab that shows it renders nothing.
 *  - `form-action`, because signing in RETURNS there. That directive is enforced
 *    across the whole redirect chain of a submission, so the 303 out of /login
 *    is blocked at the last hop and the browser simply sits on the login page,
 *    reporting a violation against a same-origin URL. Exactly the failure the
 *    MCP loopback callback hit, and the reason that one is listed too.
 *
 * The address is per-deployment while SvelteKit's csp config is compiled in, so
 * the one origin this install is configured for is added at runtime rather than
 * widening the policy at build time for every install. Directives are rewritten
 * in place: SvelteKit builds them with the nonces and hashes the page needs, and
 * replacing the policy would drop those and break every script on it.
 */
function allowDashboardOrigin(res: Response): void {
	const configured = (publicEnv.PUBLIC_UNSPA_DASHBOARD_URL ?? '').trim();
	if (!configured) return;
	const csp = res.headers.get('content-security-policy');
	if (!csp) return;
	let origin: string;
	try {
		origin = new URL(configured).origin;
	} catch {
		return;
	}
	let next = csp;
	for (const directive of ['frame-src', 'form-action']) {
		const pattern = new RegExp(`${directive} ([^;]*)`);
		const match = next.match(pattern);
		if (!match || match[1].includes(origin)) continue;
		next = next.replace(pattern, `${directive} ${match[1].trim()} ${origin}`);
	}
	if (next !== csp) res.headers.set('content-security-policy', next);
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
	// The behavior dashboard is proxied on this origin precisely to be FRAMED
	// by the project page (frame-src 'self' in the CSP); DENY on those
	// responses would blank the iframe. Everything else stays unframeable.
	res.headers.set('x-frame-options', isUnspaPath(event.url.pathname) ? 'SAMEORIGIN' : 'DENY');
	res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	res.headers.set('cross-origin-opener-policy', 'same-origin');
	res.headers.set(
		'permissions-policy',
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'
	);
	if (event.url.pathname.startsWith('/api/') || res.headers.get('content-type')?.includes('text/html')) {
		res.headers.set('cache-control', 'private, no-store');
	}
	allowDashboardOrigin(res);
	allowFeedbackOrigin(res);
	const proto =
		event.request.headers.get('x-forwarded-proto') ?? event.url.protocol.replace(':', '');
	if (proto === 'https') {
		res.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
	}
	return res;
}

export const handle: Handle = async ({ event, resolve }) => {
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
		// Behavior dashboard on this origin (see unspa-proxy.server.ts). Placed
		// after the licence gate so /behavior obeys activation like any app page.
		const devEditor = unspaTarget();
		if (devEditor && isUnspaPath(event.url.pathname)) {
			return withSecurityHeaders(event, await proxyToUnspa(event, devEditor));
		}
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

	if (!session.isAuthenticated && !PUBLIC_PATHS.has(event.url.pathname)) {
		// The dashboard's own data plane gets the same JSON 401 as ours: its
		// in-frame fetches must surface auth expiry, not follow a redirect into
		// login HTML they cannot render.
		if (event.url.pathname.startsWith('/api/') || event.url.pathname.startsWith('/behavior/api/')) {
			return withSecurityHeaders(
				event,
				new Response(JSON.stringify({ error: 'unauthenticated' }), {
					status: 401,
					headers: { 'content-type': 'application/json' }
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

	// Behavior dashboard on this origin: forwarded only past the session wall
	// and licence gate above, so the platform's own login is what guards it
	// (see unspa-proxy.server.ts). Same-origin by construction, so the iframe
	// always frames and no cookie ever has to cross a host boundary.
	const editor = unspaTarget();
	if (editor && isUnspaPath(event.url.pathname)) {
		// Global editor operations require installation-wide authority.
		const canOpenEditor = canUseSharedEditor(event);
		if (!canOpenEditor) return withSecurityHeaders(event, editorForbidden(event.url.pathname));
		return withSecurityHeaders(event, await proxyToUnspa(event, editor));
	}

	// Propagate the caller's identity + selected workspace through the request so
	// the back mirror acts AS this user, in their active team, and every use-case
	// reading the session port sees the real caller (not an anonymous placeholder).
	// Read by the back HTTP adapter and the session adapter. (The token never
	// leaves the cookie; the session and workspace id are client-safe.)
	const workspaceId = event.cookies.get('lyriks_active_ws') ?? null;
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
