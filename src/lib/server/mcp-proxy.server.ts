import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/session-cookie.server';
import { tokenHasRole } from '$lib/server/writer-gate.server';

/**
 * Serve the MCP gateway on the app's own origin.
 *
 * Why this exists: the gateway authenticates MCP clients with OAuth and delegates
 * the login to this app's `/login` page. That only works when both answer on ONE
 * origin — the browser must carry the same `lyriks_session` cookie to the login
 * page and to the authorization endpoint. Published on its own loopback port the
 * gateway sends clients to a `/login` it does not serve, so every install had to
 * grow a reverse-proxy rule (server) or hand the user a copied session token
 * (workstation). Proxying the three paths below removes both workarounds: the
 * MCP endpoint is `<app origin>/mcp` everywhere, local install included.
 *
 * These paths deliberately bypass the session, licence and CSRF guards: the
 * gateway runs its own bearer authentication, and each tool call it makes comes
 * back to `/api/*` carrying the caller's identity — where those guards do apply.
 *
 * One guard does live here: a reader gets no gateway at all (see
 * `refuseReader`). The gateway hands every tool to any signed-in account, and
 * its portfolio reads go through the back, which knows workspace membership
 * but nothing of the per-project scope a viewer is confined to.
 */

/** Path prefixes the gateway owns: the endpoint itself and OAuth discovery. */
const MCP_PREFIXES = [
	'/mcp',
	'/.well-known/oauth-protected-resource',
	'/.well-known/oauth-authorization-server'
];

/** Headers that describe one hop and must not be forwarded to the next. */
const HOP_BY_HOP = [
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
];

/** True for the MCP endpoint and its OAuth discovery paths. */
export function isMcpPath(pathname: string): boolean {
	return MCP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Internal address of the gateway (`http://mcp:3055` in the appliance), or null
 * when no gateway is wired — a standalone platform serves nothing on /mcp.
 */
export function mcpTarget(): string | null {
	const configured = (env.LYRIKS_MCP_URL ?? '').trim().replace(/\/$/, '');
	return configured.length > 0 ? configured : null;
}

/**
 * Forward one request to the gateway and return its answer unchanged.
 *
 * The request body is buffered (JSON-RPC calls are small, and the gateway caps
 * them at 8 MB anyway) while the response is streamed, so a tool call answered
 * as an event stream reaches the client incrementally. Redirects are NOT
 * followed: `/mcp/oauth/authorize` answers `302 → /login?redirect=…`, which is
 * the browser's to act on.
 */
export async function proxyToMcp(
	event: RequestEvent,
	target: string,
	fetchImpl: typeof fetch = fetch
): Promise<Response> {
	const refusal = await refuseReader(event);
	if (refusal) return refusal;

	const upstream = new URL(event.url.pathname + event.url.search, target);

	const headers = new Headers(event.request.headers);
	for (const name of HOP_BY_HOP) headers.delete(name);
	// The gateway reads its public origin from PUBLIC_BASE_URL, so it has no use
	// for our Host — and forwarding it would make its own URL parsing lie.
	headers.delete('host');
	headers.delete('content-length');

	const body =
		event.request.method === 'GET' || event.request.method === 'HEAD'
			? undefined
			: await event.request.arrayBuffer();

	let response: Response;
	try {
		response = await fetchImpl(upstream, {
			method: event.request.method,
			headers,
			body,
			redirect: 'manual'
		});
	} catch (cause) {
		console.error('[lyriks][mcp] gateway unreachable:', cause);
		return new Response(JSON.stringify({ error: 'mcp_unavailable' }), {
			status: 502,
			headers: { 'content-type': 'application/json' }
		});
	}

	const out = new Headers(response.headers);
	for (const name of HOP_BY_HOP) out.delete(name);
	// fetch already decoded the payload; leaving the header would make the client
	// decode it a second time and fail on the first byte.
	out.delete('content-encoding');
	out.delete('content-length');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: out
	});
}

const READER_MESSAGE =
	'MCP access is reserved to designers and above in this workspace. As a viewer, you read your projects in the app.';

/**
 * Browser authorization is role-gated before proxying. Opaque bearer grants
 * are checked inside the MCP gateway through the platform session endpoint.
 */
async function refuseReader(event: RequestEvent): Promise<Response | null> {
	// Opaque MCP bearer tokens are resolved by the gateway, which validates
	// their backing session and role through /api/auth/session on every call.
	const path = event.url.pathname;

	if (path === '/mcp/oauth/authorize') {
		const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(
			event.request.headers.get('cookie') ?? ''
		);
		const token = match ? match[1] : '';
		if (!token) return null;
		if (await tokenHasRole(token, 'mcp', null)) return null;
		return new Response(READER_MESSAGE, {
			status: 403,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}
	return null;
}
