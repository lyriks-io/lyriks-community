import { loadEnv, type Plugin, type ViteDevServer } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Auto-start the companion servers that Lyriks v3 depends on so a single
 * `pnpm dev` boots the whole local stack. Four companions today:
 *
 *   1. Unspaghettit dashboard (port 3001) — the spec UI. Its child also
 *      hosts the Yjs websocket relay at `ws://127.0.0.1:3001/sync` once
 *      its OSS init bug is resolved.
 *   2. y-websocket reference server (port 3002) — pure Yjs relay used as
 *      a stand-in while the OSS dashboard's WS endpoint is down. Toggle
 *      the v3 page's `YJS_WS_URL` between 3001/sync and 3002 depending
 *      on which is healthy.
 *   3. Lyriks-back API (port 3000) — the on-prem REST server that v3
 *      mirrors envelopes to. Sourced from the sibling repo's built
 *      bundle at `<back>/packages/api/dist/lyriks-api.js` (see `backRepo`),
 *      overridable via `LYRIKS_API_BIN`.
 *   4. Lyriks MCP (port 3055) — the wizard read/write surface that Claude
 *      Code connects to (see `.mcp.json`, which targets :3055). Sourced
 *      from the sibling repo's built bundle at
 *      `<back>/packages/mcp/dist/index.js`, overridable via
 *      `LYRIKS_MCP_BIN`. Points V3_BASE_URL at this dev server and
 *      API_BASE_URL at the back companion so it reads/writes the live app.
 *
 * Each companion can be individually disabled with an env flag:
 *   UNSPA_DASHBOARD_DISABLE=1, YJS_SERVER_DISABLE=1, LYRIKS_BACK_DISABLE=1,
 *   LYRIKS_MCP_DISABLE=1
 *
 * Children inherit the parent process group and die when vite exits.
 */
interface Companion {
	readonly name: string;
	readonly enabled: boolean;
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
	readonly color: '31' | '32' | '33' | '34' | '35' | '36';
	readonly skipReason?: string;
	/**
	 * Path of the built bundle this companion runs, when it is compiled from a
	 * sibling repo. Its mtime is logged at spawn so a stale build (edited
	 * sources, forgotten `pnpm build`) is visible instead of silently serving
	 * old behavior.
	 */
	readonly bundlePath?: string;
}

/**
 * Locate the sibling back checkout. Working copies disagree on its spelling —
 * some clone `lyriks-back`, others `Lyriks-back` — and on a case-sensitive
 * filesystem only one resolves, so hardcoding either makes the api and mcp
 * companions silently skip on every machine that uses the other. Probe both,
 * and fall back to the canonical spelling so the skip reason still names a
 * plausible path. `LYRIKS_API_BIN` / `LYRIKS_MCP_BIN` override this entirely.
 */
function backRepo(root: string): string {
	const canonical = resolve(root, '..', 'lyriks-back');
	if (existsSync(canonical)) return canonical;
	const capitalised = resolve(root, '..', 'Lyriks-back');
	return existsSync(capitalised) ? capitalised : canonical;
}

function tag(name: string, color: string): string {
	const padded = `[${name}]`.padEnd(8, ' ');
	return `\x1b[${color}m${padded}\x1b[0m`;
}

function defineCompanions(root: string, devPort: number): readonly Companion[] {
	// Engine development: `UNSPAGHETTIT_MCP_BIN` points the app's advisor at a
	// local unspaghettit checkout (see .env.example). Derive this companion's CLI
	// from the same package so the dashboard is the SAME engine the app talks to —
	// a checkout has the published layout (`mcp-server/bin.cjs`, `cli/unspa.cjs`).
	const unspaPkg = process.env.UNSPAGHETTIT_MCP_BIN
		? resolve(dirname(process.env.UNSPAGHETTIT_MCP_BIN), '..')
		: resolve(root, 'node_modules', 'unspaghettit');
	const unspaBin = resolve(unspaPkg, 'cli', 'unspa.cjs');
	// Kernel store root — `LYRIKS_UNSPA_ROOT` (default `data/unspa`) so a sandbox
	// copy covers the dashboard and Back too, not just the app.
	const unspaSnapshots = resolve(root, process.env.LYRIKS_UNSPA_ROOT || 'data/unspa');
	const yjsBin = resolve(root, 'node_modules', 'y-websocket', 'bin', 'server.cjs');
	const back = backRepo(root);
	const apiBin =
		process.env.LYRIKS_API_BIN ?? resolve(back, 'packages', 'api', 'dist', 'lyriks-api.js');
	const mcpBin = process.env.LYRIKS_MCP_BIN ?? resolve(back, 'packages', 'mcp', 'dist', 'index.js');
	// Every companion port is overridable so the whole stack can run on a
	// conflict-free port map (back: LYRIKS_API_PORT, yjs: YJS_PORT, mcp:
	// LYRIKS_MCP_PORT, dashboard: UNSPA_DASHBOARD_PORT). Defaults are dev-friendly.
	const unspaPort = process.env.UNSPA_DASHBOARD_PORT ?? '3001';

	const unspaPresent = existsSync(unspaBin);
	const yjsPresent = existsSync(yjsBin);
	const apiPresent = existsSync(apiBin);
	const mcpPresent = existsSync(mcpBin);
	// Whether a Back runs beside the app at all (Enterprise dev); Community dev
	// has none, and the MCP gateway must then answer its portfolio from the app.
	const backEnabled = process.env.LYRIKS_BACK_DISABLE !== '1' && apiPresent;

	return [
		{
			name: 'unspa',
			enabled: process.env.UNSPA_DASHBOARD_DISABLE !== '1' && unspaPresent,
			command: process.execPath,
			// unspaghettit 0.4.0: the dashboard discovers its store via --snapshots
			// (it walks up for an `unspa/` folder, else the shared hub — it does NOT
			// read UNSPA_SNAPSHOTS for the dashboard), and dropped the 0.1.x short
			// flags, so pass --snapshots / --port / --host explicitly. Env kept as a
			// belt-and-suspenders for the bundled MCP child.
			args: [
				unspaBin,
				'dashboard',
				'--snapshots',
				unspaSnapshots,
				'--port',
				unspaPort,
				'--host',
				'127.0.0.1'
			],
			// The dashboard is part of Lyriks here, not a standalone install: this
			// tells it so, which is what keeps its Lyriks Community splash out of a
			// deployment that already IS Lyriks (unspaghettit >= 0.19).
			env: { UNSPA_SNAPSHOTS: unspaSnapshots, PUBLIC_UNSPA_HOST_PRODUCT: 'Lyriks', UNSPA_HOST_URL: process.env.UNSPA_HOST_URL ?? `http://127.0.0.1:${devPort}` },
			color: '35',
			skipReason: !unspaPresent ? `unspaghettit CLI not found at ${unspaBin}` : undefined
		},
		{
			name: 'yjs',
			enabled: process.env.YJS_SERVER_DISABLE !== '1' && yjsPresent,
			command: process.execPath,
			args: [yjsBin],
			env: { HOST: '127.0.0.1', PORT: process.env.YJS_PORT ?? '3002' },
			color: '36',
			skipReason: !yjsPresent ? `y-websocket server not found at ${yjsBin}` : undefined
		},
		{
			name: 'back',
			enabled: backEnabled,
			command: process.execPath,
			args: [apiBin, 'start'],
			env: {
				LYRIKS_API_PORT: process.env.LYRIKS_API_PORT ?? '3000',
				LYRIKS_API_HOST: '127.0.0.1',
				// Back is the single writer to the kernel store and the only pinger of
				// the dashboard's /api/sync/reload. Point it at v3's workspace so
				// the OSS dashboard (UNSPA_SNAPSHOTS, see the unspa companion above)
				// reads from the same files back writes to.
				LYRIKS_UNSPA_DATA_DIR: unspaSnapshots,
				// The back pings the dashboard's /api/sync/reload so its project
				// index updates on every write. Honor an override (run-lyriks.sh runs
				// the dashboard on :3005 because the built-in :3001 slot is taken by
				// the Lyriks MCP); fall back to the in-repo companion's :3001.
				LYRIKS_UNSPA_DASHBOARD_URL:
					process.env.LYRIKS_UNSPA_DASHBOARD_URL ?? `http://127.0.0.1:${unspaPort}`
			},
			color: '33',
			skipReason: !apiPresent
				? `lyriks-api bundle not found at ${apiBin} (build lyriks-back or set LYRIKS_API_BIN)`
				: undefined,
			bundlePath: apiPresent ? apiBin : undefined
		},
		{
			name: 'mcp',
			enabled: process.env.LYRIKS_MCP_DISABLE !== '1' && mcpPresent,
			command: process.execPath,
			args: [mcpBin],
			env: {
				// `.mcp.json` targets http://localhost:3055/mcp — keep this in sync.
				PORT: process.env.LYRIKS_MCP_PORT ?? '3055',
				// The MCP is a thin HTTP client over the live app: V3_BASE_URL is the
				// wizard source-of-truth (this dev server), API_BASE_URL the back.
				V3_BASE_URL: `http://127.0.0.1:${devPort}`,
				API_BASE_URL: backEnabled ? `http://127.0.0.1:${process.env.LYRIKS_API_PORT ?? '3000'}` : ''
			},
			color: '34',
			skipReason: !mcpPresent
				? `Lyriks MCP bundle not found at ${mcpBin} (build lyriks-back/packages/mcp or set LYRIKS_MCP_BIN)`
				: undefined,
			bundlePath: mcpPresent ? mcpBin : undefined
		}
	];
}

function streamWithPrefix(child: ChildProcess, prefix: string): void {
	const handle = (data: Buffer) => {
		const lines = data.toString().replace(/\r?\n$/, '').split(/\r?\n/);
		for (const line of lines) {
			if (line.length > 0) console.log(`${prefix} ${line}`);
		}
	};
	child.stdout?.on('data', handle);
	child.stderr?.on('data', handle);
}

export function autoCompanions(): Plugin {
	const children: ChildProcess[] = [];
	let booted = false;

	// `.env` is read by SvelteKit (for `$env/dynamic/private`) but NOT by Vite
	// plugins, so the engine-development overrides would apply to the app and
	// silently not to the companions below — the dashboard would keep editing the
	// real store while the app used the sandbox. Hoist just those two keys into
	// process.env, letting a real shell variable win.
	{
		const fileEnv = loadEnv('development', process.cwd(), '');
		for (const key of ['UNSPAGHETTIT_MCP_BIN', 'LYRIKS_UNSPA_ROOT'] as const) {
			if (!process.env[key] && fileEnv[key]) process.env[key] = fileEnv[key];
		}
	}

	// Set LYRIKS_BACK_URL at plugin-construction time — the EARLIEST point, before
	// Vite resolves config and SvelteKit snapshots `$env/dynamic/private`. Doing
	// this in `configureServer` (below) is too late: the SvelteKit server process
	// has already captured its env, so the back mirror would stay disabled.
	{
		// devPort doesn't matter here — the early pass only reads back/unspa.
		const early = defineCompanions(process.cwd(), 5173);
		const earlyBack = early.find((c) => c.name === 'back');
		if (earlyBack?.enabled && !process.env.LYRIKS_BACK_URL) {
			process.env.LYRIKS_BACK_URL = `http://127.0.0.1:${process.env.LYRIKS_API_PORT ?? '3000'}`;
		}
		// Point the sidebar's "Open Unspa dashboard" link at the dev companion
		// dashboard (port 3001), which reads v3's local data/unspa. Without this
		// the Sidebar falls back to its appliance default (port 3003) — and if a
		// Docker appliance is also running locally, the link opens that container's
		// empty volume instead of the dev dashboard that holds the data.
		// Serve the MCP gateway on the app's own origin (/mcp), as the appliance
		// does, so a client configured for the app URL works in development too.
		const earlyMcp = early.find((c) => c.name === 'mcp');
		if (earlyMcp?.enabled && !process.env.LYRIKS_MCP_URL) {
			process.env.LYRIKS_MCP_URL = `http://127.0.0.1:${process.env.LYRIKS_MCP_PORT ?? '3055'}`;
		}
		const earlyUnspa = early.find((c) => c.name === 'unspa');
		if (earlyUnspa?.enabled && !process.env.PUBLIC_UNSPA_DASHBOARD_URL) {
			process.env.PUBLIC_UNSPA_DASHBOARD_URL = `http://127.0.0.1:${process.env.UNSPA_DASHBOARD_PORT ?? '3001'}`;
		}
	}

	function shutdown(): void {
		for (const child of children) {
			if (!child.killed && child.exitCode === null) {
				try {
					child.kill();
				} catch {
					/* already gone */
				}
			}
		}
	}

	return {
		name: 'lyriks-auto-companions',
		apply: 'serve',
		configureServer(server: ViteDevServer) {
			if (booted) return;
			// Vitest runs in serve mode too — don't spawn dev companions (and fight
			// over ports 3000/3001/3002) during tests.
			if (process.env.VITEST) return;
			booted = true;

			const root = server.config.root;
			const devPort = server.config.server.port ?? 5173;
			const companions = defineCompanions(root, devPort);
			// LYRIKS_BACK_URL is set at plugin-construction time (see top) so the
			// SvelteKit process sees it before capturing env.

			console.log('\n  Lyriks companions:');
			for (const c of companions) {
				const t = tag(c.name, c.color);
				if (!c.enabled) {
					console.log(`  ${t} skipped — ${c.skipReason ?? 'disabled via env'}`);
					continue;
				}
				const child = spawn(c.command, [...c.args], {
					cwd: c.cwd ?? root,
					env: { ...process.env, ...c.env },
					stdio: ['ignore', 'pipe', 'pipe'],
					windowsHide: true
				});
				children.push(child);
				let built = '';
				if (c.bundlePath) {
					try {
						built = ` — bundle built ${statSync(c.bundlePath).mtime.toISOString()}`;
					} catch {
						/* stat is informational only */
					}
				}
				console.log(`  ${t} starting (pid ${child.pid ?? '?'})${built}`);
				streamWithPrefix(child, `  ${t}`);
				child.on('exit', (code, signal) => {
					console.log(
						`  ${t} exited (code=${code}, signal=${signal}). Restart vite to relaunch.`
					);
				});
			}
			console.log('');

			// Vite's `configureServer` hook doesn't auto-tear-down children on
			// Ctrl+C, so we hook the dev server's close event and the parent's
			// exit signals.
			server.httpServer?.on('close', shutdown);
			process.once('SIGINT', () => {
				shutdown();
				process.exit(130);
			});
			process.once('SIGTERM', () => {
				shutdown();
				process.exit(143);
			});
			process.once('exit', shutdown);
		},
		closeBundle() {
			shutdown();
		}
	};
}
