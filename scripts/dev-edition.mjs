import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { linkOverlay, unlinkOverlay } from './ee.mjs';

export const WSL_DEV_PORT = '8173';
export const WSL_UNSPA_DASHBOARD_PORT = '3005';

const PRESETS = Object.freeze({
	community: Object.freeze({
		LYRIKS_EDITION: 'community',
		LYRIKS_BACK_DEV_PLAN: 'free',
		// Community runs without the Back, in development as on the appliance:
		// the companion is not started and the MCP gateway gets no API_BASE_URL.
		LYRIKS_BACK_DISABLE: '1'
	}),
	enterprise: Object.freeze({
		LYRIKS_EDITION: 'enterprise',
		LYRIKS_BACK_DEV_PLAN: 'enterprise'
	})
});

export function devEditionEnvironment(edition) {
	const preset = PRESETS[edition];
	if (!preset) {
		throw new Error(`Unknown development edition "${edition}". Use community or enterprise.`);
	}
	return { ...preset };
}

export function viteArguments(args) {
	return args[0] === '--' ? args.slice(1) : [...args];
}

export function withWslDefaults(args, kernelRelease = release()) {
	const hasPort = args.some((argument) => argument === '--port' || argument.startsWith('--port='));
	if (!/microsoft|wsl/i.test(kernelRelease) || hasPort) return [...args];
	return [...args, '--port', WSL_DEV_PORT];
}

export function devCompanionEnvironment(environment, kernelRelease = release()) {
	if (!/microsoft|wsl/i.test(kernelRelease)) return {};
	return {
		// Port 3001 is used by the appliance MCP container when a packaged stack
		// and the host development server run side by side under WSL.
		UNSPA_DASHBOARD_PORT:
			environment.UNSPA_DASHBOARD_PORT?.trim() || WSL_UNSPA_DASHBOARD_PORT
	};
}

export function envFileValue(contents, key) {
	for (const line of contents.split(/\r?\n/)) {
		const candidate = line.trim().replace(/^export\s+/, '');
		if (!candidate || candidate.startsWith('#')) continue;
		const separator = candidate.indexOf('=');
		if (separator < 0 || candidate.slice(0, separator).trim() !== key) continue;
		const value = candidate.slice(separator + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			return value.slice(1, -1);
		}
		return value;
	}
	return null;
}

export function hostDatabaseUrl(databaseUrl) {
	try {
		const parsed = new URL(databaseUrl);
		if (parsed.hostname === 'postgres') parsed.hostname = '127.0.0.1';
		return parsed.toString();
	} catch {
		return databaseUrl.replace('@postgres:', '@127.0.0.1:');
	}
}

export function resolveDevPgUrl(environment, platformEnvFiles, backEnvContents) {
	const explicit = environment.LYRIKS_PG_URL?.trim();
	if (explicit) return explicit;
	let configured = null;
	for (const contents of platformEnvFiles) {
		configured = envFileValue(contents, 'LYRIKS_PG_URL')?.trim() || configured;
	}
	if (configured) return configured;
	const backDatabaseUrl = envFileValue(backEnvContents, 'DATABASE_URL')?.trim();
	return backDatabaseUrl ? hostDatabaseUrl(backDatabaseUrl) : null;
}

function resolveEnvValue(environment, platformEnvFiles, backEnvContents, key) {
	const explicit = environment[key]?.trim();
	if (explicit) return explicit;
	let configured = null;
	for (const contents of platformEnvFiles) {
		configured = envFileValue(contents, key)?.trim() || configured;
	}
	return configured || envFileValue(backEnvContents, key)?.trim() || null;
}

export function resolveDevDpoEnvironment(
	edition,
	environment,
	platformEnvFiles,
	backEnvContents
) {
	if (edition !== 'enterprise') return {};
	return {
		ENGINE_GRPC_ADDR:
			resolveEnvValue(environment, platformEnvFiles, backEnvContents, 'ENGINE_GRPC_ADDR') ??
			'127.0.0.1:50051',
		// Fallback only: an engine built from the canonical source REFUSES a token
		// under 32 characters, so a real run takes the value configured in
		// lyriks-back/.env — the same file compose passes to the engine container,
		// which is what keeps both ends of the credential identical.
		ENGINE_AUTH_TOKEN:
			resolveEnvValue(environment, platformEnvFiles, backEnvContents, 'ENGINE_AUTH_TOKEN') ??
			'lyriks-local-development',
		// Where Back reads the engine's VERSION (its HTTP gateway, published on the
		// host by docker-compose.hostengine.yml). Back would otherwise derive the
		// gRPC host on port 8080, which in a WSL dev box usually answers with a local
		// appliance instead of the engine.
		ENGINE_HTTP_URL:
			resolveEnvValue(environment, platformEnvFiles, backEnvContents, 'ENGINE_HTTP_URL') ??
			'http://127.0.0.1:8081'
	};
}

function readIfPresent(path) {
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function loadDevEnvironment(edition) {
	const root = fileURLToPath(new URL('../', import.meta.url));
	const platformEnvFiles = ['.env', '.env.local', '.env.development', '.env.development.local'].map(
		(name) => readIfPresent(`${root}/${name}`)
	);
	// Working copies disagree on the sibling's spelling (lyriks-back vs
	// Lyriks-back) and a case-sensitive filesystem resolves only one, so read
	// whichever is there rather than silently loading no back env at all.
	const backEnv =
		readIfPresent(fileURLToPath(new URL('../../lyriks-back/.env', import.meta.url))) ||
		readIfPresent(fileURLToPath(new URL('../../Lyriks-back/.env', import.meta.url)));
	const pgUrl = resolveDevPgUrl(process.env, platformEnvFiles, backEnv);
	return {
		pgUrl,
		dpo: resolveDevDpoEnvironment(edition, process.env, platformEnvFiles, backEnv)
	};
}

function databaseTarget(databaseUrl) {
	try {
		const parsed = new URL(databaseUrl);
		return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
	} catch {
		return 'configured endpoint';
	}
}

function run() {
	const [, , edition, ...rawViteArgs] = process.argv;
	const viteArgs = withWslDefaults(viteArguments(rawViteArgs));
	const companionEnvironment = devCompanionEnvironment(process.env);
	let preset;
	try {
		preset = devEditionEnvironment(edition);
		// The Enterprise overlay is compiled in for the enterprise edition only.
		if (edition === 'enterprise') linkOverlay();
		else unlinkOverlay();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 2;
		return;
	}
	const { pgUrl, dpo } = loadDevEnvironment(edition);
	if (!pgUrl) {
		console.error(
			'PostgreSQL is required. Set LYRIKS_PG_URL, configure it in .env, or use ~/Lyriks/run-lyriks.sh to prepare the full local stack.'
		);
		process.exitCode = 2;
		return;
	}

	const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
	const portIndex = viteArgs.findIndex((argument) => argument === '--port');
	const portNotice = portIndex >= 0 ? ` on port ${viteArgs[portIndex + 1]}` : '';
	console.log(`Starting Lyriks in ${edition} development mode${portNotice}.`);
	console.log(`Using PostgreSQL at ${databaseTarget(pgUrl)}.`);
	if (dpo.ENGINE_GRPC_ADDR) {
		console.log(`Using the formal DPO engine at ${dpo.ENGINE_GRPC_ADDR}.`);
	}
	const child = spawn(process.execPath, [viteBin, 'dev', ...viteArgs], {
		stdio: 'inherit',
		env: {
			...process.env,
			...preset,
			...dpo,
			...companionEnvironment,
			LYRIKS_PG_URL: pgUrl,
			// The platform and Back use different names for the same PostgreSQL.
			// Supplying both wires Back's formal graph-store adapter as well.
			DATABASE_URL: pgUrl
		}
	});
	child.on('error', (error) => {
		console.error(`Could not start the ${edition} development server:`, error);
		process.exitCode = 1;
	});
	child.on('exit', (code, signal) => {
		process.exitCode = code ?? (signal ? 1 : 0);
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
