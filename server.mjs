/**
 * Production entry. The stock adapter-node `build/index.js` serves HTTP but has
 * no hook for WebSocket `upgrade` events, and one surface this app fronts is
 * a WebSocket:
 *
 *   /yjs*             → the realtime relay (LYRIKS_YJS_INTERNAL_URL), which
 *                       otherwise needs its own reverse-proxy rule at every
 *                       install
 *
 * This file wraps the exported `handler` in one http.Server and adds a raw
 * TCP splice for that upgrade. The route only exists when its env var is set,
 * so a standalone platform behaves exactly like `node build` did. The behaviour
 * engine's own editor is not served here: it is launched on the host with
 * `./lyriks editor` (feat-154, criterion ea8894f2).
 */
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { trustedSocketOrigin } from './scripts/lib/socket-origin.mjs';
import { handler } from './build/handler.js';

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

const trim = (value) => (value ?? '').trim().replace(/\/$/, '');

/** Upgrade routes: first matching prefix wins. `auth` = platform session required. */
const upgradeRoutes = [];
{
	const yjs = trim(process.env.LYRIKS_YJS_INTERNAL_URL);
	if (yjs) {
		// HTTP authorization binds each relay room to a writable project.
		upgradeRoutes.push({ prefix: '/yjs', target: new URL(yjs), auth: true });
	}
}

/** The HTTP hook owns edition policy, revocation, licence and project authorization. */
const authorized = async (req) => {
	try {
		const url = new URL('/api/auth/socket', `http://127.0.0.1:${PORT}`);
		url.searchParams.set('path', req.url ?? '');
		const res = await fetch(url, {
			headers: { cookie: req.headers.cookie ?? '' },
			redirect: 'manual',
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) return null;
		const body = await res.json();
		return typeof body.upstreamPath === 'string' && !/[\r\n]/.test(body.upstreamPath) ? body.upstreamPath : null;
	} catch { return null; }
};

/**
 * Splice the upgrade through to the target: replay the request head with the
 * target's Host, hand over the buffered bytes, then pipe both directions. The
 * 101 response comes back through the same pipe, so nothing here needs to
 * speak the WebSocket protocol.
 */
const spliceUpgrade = (req, socket, head, target, upstreamPath) => {
	const upstream = connect(Number(target.port), target.hostname, () => {
		const lines = [`${req.method} ${upstreamPath} HTTP/1.1`];
		for (let i = 0; i < req.rawHeaders.length; i += 2) {
			const name = req.rawHeaders[i];
			if (['host', 'cookie', 'authorization'].includes(name.toLowerCase())) continue;
			lines.push(`${name}: ${req.rawHeaders[i + 1]}`);
		}
		lines.push(`Host: ${target.host}`, '\r\n');
		upstream.write(lines.join('\r\n'));
		if (head?.length) upstream.write(head);
		socket.pipe(upstream);
		upstream.pipe(socket);
	});
	// Recheck long-lived connections: password changes and revoked grants must
	// also terminate sockets that were already open (within 30 seconds).
	let checking = false;
	const timer = setInterval(async () => {
		if (checking) return;
		checking = true;
		try { if (await authorized(req) !== upstreamPath) socket.destroy(); }
		finally { checking = false; }
	}, 30_000);
	timer.unref();
	socket.on('close', () => { clearInterval(timer); upstream.destroy(); });
	upstream.on('close', () => socket.destroy());
	upstream.on('error', () => socket.destroy());
	socket.on('error', () => upstream.destroy());
};

const server = createServer(handler);
// A reverse proxy in front (Caddy keeps idle upstream connections for 2 min,
// nginx for 60 s) reuses a connection Node already closed when Node's own idle
// timeout (5 s by default) is the shorter one: the proxy then answers 502 EOF,
// and it never retries a POST, so a save fails at random. Node keeps its idle
// connections longer than any proxy in front of it, and its headers timeout
// stays above that, as Node requires. KEEP_ALIVE_TIMEOUT (seconds) overrides.
const keepAliveSeconds = Number(process.env.KEEP_ALIVE_TIMEOUT) || 130;
server.keepAliveTimeout = keepAliveSeconds * 1000;
server.headersTimeout = (keepAliveSeconds + 5) * 1000;

server.on('upgrade', (req, socket, head) => {
	const route = upgradeRoutes.find((r) => req.url?.startsWith(r.prefix));
	if (!route || !trustedSocketOrigin(req, process.env)) {
		socket.destroy();
		return;
	}
	void (async () => {
		const upstreamPath = await authorized(req);
		if (!upstreamPath) {
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			socket.destroy();
			return;
		}
		if (!socket.destroyed) spliceUpgrade(req, socket, head, route.target, upstreamPath);
	})();
});

server.listen(PORT, HOST, () => {
	const routes = upgradeRoutes.map((r) => `${r.prefix}→${r.target.host}`).join(', ');
	console.log(
		`[lyriks] listening on ${HOST}:${PORT}${routes ? ` (ws upgrades: ${routes})` : ''}`
	);
});
