import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Serve the behavior dashboard (unspaghettit) on the app's own origin, under
 * /behavior, the way /mcp already serves the gateway.
 *
 * Why this exists: the dashboard has no login of its own, and every layout
 * that gave it an origin of its own (another port, a subdomain) fought the
 * browser's cookie scoping: gates switching themselves off, cookie-domain
 * widening, per-client ingress rules and DNS entries. Proxying it here ends
 * that class of problem: the iframe is same-origin by construction, THIS
 * app's session wall in hooks.server.ts guards every request before it is
 * forwarded, and the dashboard container no longer needs to be published at
 * all. A client's ingress needs exactly the one rule it already has: the one
 * that reaches this app.
 *
 * The dashboard serves under the prefix itself (PUBLIC_UNSPA_BASE_PATH, set
 * in the appliance compose), so the path is forwarded unchanged and assets,
 * API calls and deep links all resolve without rewriting. Realtime (the
 * /behavior/sync WebSocket) cannot go through hooks; the production entry
 * (server.mjs) proxies those upgrades with the same session check.
 */

const UNSPA_PREFIX = '/behavior';

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

/** True for the behavior dashboard's path space on this origin. */
export function isUnspaPath(pathname: string): boolean {
	return pathname === UNSPA_PREFIX || pathname.startsWith(`${UNSPA_PREFIX}/`);
}

/**
 * Internal address of the dashboard (`http://dashboard:3000` in the
 * appliance), or null when none is wired; /behavior then simply 404s like any
 * unknown route, which is the standalone platform's behavior.
 */
export function unspaTarget(): string | null {
	const configured = (env.LYRIKS_UNSPA_URL ?? '').trim().replace(/\/$/, '');
	return configured.length > 0 ? configured : null;
}

/** Refuse callers without installation-wide authority over the shared editor store. */
export function editorForbidden(pathname: string): Response {
	const machine =
		pathname.startsWith(`${UNSPA_PREFIX}/api/`) || pathname.startsWith(`${UNSPA_PREFIX}/sync/`);
	if (machine) {
		return new Response(
			JSON.stringify({ error: 'forbidden', message: EDITOR_FORBIDDEN_MESSAGE }),
			{ status: 403, headers: { 'content-type': 'application/json' } }
		);
	}
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Behavior editor</title>
<style>body{margin:0;font:14px/1.5 system-ui,sans-serif;color:#334155;background:#f8fafc}main{max-width:40rem;margin:4rem auto;padding:0 1.5rem}</style>
</head><body><main><p>${EDITOR_FORBIDDEN_MESSAGE}</p></main></body></html>`;
	return new Response(html, {
		status: 403,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
}

/**
 * Framed in Lyriks (`embed=1`), the editor is a detour from the page that opened
 * it, and that page owns the browser history: Back must return to it in one
 * press. The editor's own routing would add entries the reader has to step back
 * through first, so in embed mode its `pushState` becomes `replaceState` before
 * any of its scripts run. Its navigation still works, it just never grows the
 * history.
 */
const EMBED_HISTORY_SCRIPT =
	'(function(){var h=window.history;h.pushState=function(s,t,u){return h.replaceState(s,t,u);};})();';
const EMBED_HISTORY_HASH = `'sha256-${createHash('sha256').update(EMBED_HISTORY_SCRIPT).digest('base64')}'`;

/** The embed page with the history script first in its head, and its CSP letting it run. */
export function injectEmbedHistory(html: string, headers: Headers): string {
	const head = /<head[^>]*>/i.exec(html);
	if (!head) return html;
	const at = head.index + head[0].length;
	const csp = headers.get('content-security-policy');
	if (csp && /script-src/i.test(csp)) {
		headers.set(
			'content-security-policy',
			csp.replace(/script-src([^;]*)/i, (_, sources: string) => `script-src${sources} ${EMBED_HISTORY_HASH}`)
		);
	}
	return `${html.slice(0, at)}<script>${EMBED_HISTORY_SCRIPT}</script>${html.slice(at)}`;
}

const EDITOR_FORBIDDEN_MESSAGE =
	'The shared behavior editor requires an installation administrator. Continue editing your authorized projects in Lyriks.';

/**
 * Forward one request to the dashboard and return its answer unchanged. Body
 * buffered (model edits are small JSON), response streamed (SSE reaches the
 * client incrementally). Redirects are the browser's to act on.
 */
export async function proxyToUnspa(
	event: RequestEvent,
	target: string,
	fetchImpl: typeof fetch = fetch
): Promise<Response> {
	const upstream = new URL(event.url.pathname + event.url.search, target);

	const headers = new Headers(event.request.headers);
	for (const name of HOP_BY_HOP) headers.delete(name);
	// The dashboard resolves its own URLs from PUBLIC_UNSPA_BASE_PATH; our Host
	// names an origin it does not serve, and undici sets the target's instead.
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
		console.error('[lyriks][unspa] behavior dashboard unreachable:', cause);
		return new Response(JSON.stringify({ error: 'behavior_dashboard_unavailable' }), {
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

	const embedPage =
		event.request.method === 'GET' &&
		event.url.searchParams.get('embed') === '1' &&
		(out.get('content-type') ?? '').includes('text/html');
	if (embedPage) {
		const html = injectEmbedHistory(await response.text(), out);
		return new Response(html, { status: response.status, statusText: response.statusText, headers: out });
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: out
	});
}
