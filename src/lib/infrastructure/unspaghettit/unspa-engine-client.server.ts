import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'node:fs';
import { unspaghettitSubprocessEnv } from './subprocess-env.server';

export interface UnspaEngineConfig {
	/** Absolute path to the Unspaghettit MCP server bin (typically `…/unspaghettit/mcp-server/bin.cjs`). */
	readonly mcpBinPath: string;
	/** Absolute path to the snapshot root — the directory that contains per-project folders. */
	readonly snapshotsRoot: string;
	/** Deployed platform version advertised during the MCP handshake. */
	readonly platformVersion?: string;
	/** Ceiling for a single engine call; see `DEFAULT_CALL_TIMEOUT_MS`. */
	readonly callTimeoutMs?: number;
}

/** What a single engine call may override on the connection defaults. */
export interface EngineCallOptions {
	/** Ceiling for THIS call, in milliseconds. */
	readonly timeoutMs?: number;
}

/**
 * Ceiling for one engine call. The MCP SDK applies 60 s when a caller passes
 * none, which is exactly the budget the platform itself has to answer a request
 * in: one call that eats all of it leaves nothing for the rest of the report.
 *
 * The ceiling also has to KILL, not just stop waiting. The engine explores state
 * space in a synchronous loop, so the SDK's cancellation notification is only
 * read once that loop ends: an abandoned call keeps a core busy for minutes
 * after the caller gave up, and the next attempt queues behind it. Recycling the
 * subprocess on timeout is what actually frees the machine.
 */
export const DEFAULT_CALL_TIMEOUT_MS = 45_000;

/** JSON-RPC code the SDK raises locally when the caller stops waiting. */
const REQUEST_TIMEOUT_CODE = -32001;

/** True when a failure is our own deadline rather than an engine answer. */
export function isRequestTimeout(e: unknown): boolean {
	if (typeof e === 'object' && e !== null && (e as { code?: unknown }).code === REQUEST_TIMEOUT_CODE)
		return true;
	return e instanceof Error && e.message.includes('Request timed out');
}

/**
 * The single stdio connection to the Unspaghettit engine.
 *
 * The engine is a first-party but runtime-OPTIONAL subprocess: it is spawned on
 * the first call, stays warm for the life of the SvelteKit process, and every
 * failure is swallowed here so the platform keeps working without it (the
 * Minimal Autonomous Product runs with no engine at all). Callers get `null` and
 * degrade; they never see a transport error.
 *
 * This is deliberately transport-only — it knows how to reach the engine and
 * nothing about behavior, maturity or provenance. Adapters layer meaning on top
 * (`McpUnspaghettitAdvisor` for assessment, `McpCodeAdoption` for code → spec),
 * which is what keeps either of them from growing into a god-object holding both
 * its own domain AND a subprocess lifecycle.
 *
 * The engine's MCP is never exposed as a network surface: this client is the
 * only thing that talks to it, and every caller comes in through an
 * authenticated platform route.
 */
export class UnspaEngineClient {
	#cfg: UnspaEngineConfig;
	#client: Client | null = null;
	#connecting: Promise<Client | null> | null = null;
	/** Epoch ms of the last connect failure; gates a short retry cooldown. */
	#lastFailAt = 0;
	/** Don't spawn-storm a broken engine, but DO retry after this window. */
	static readonly #RETRY_COOLDOWN_MS = 10_000;
	/** Log prefix, so a message names the adapter that made the call. */
	#label: string;

	constructor(cfg: UnspaEngineConfig, label = 'unspa-engine') {
		this.#cfg = cfg;
		this.#label = label;
	}

	get snapshotsRoot(): string {
		return this.#cfg.snapshotsRoot;
	}

	/**
	 * Optimistic reachability. A connected client is obviously available; with
	 * none, we report available UNLESS a connect just failed (cooldown). Crucial
	 * that this NOT latch false forever: the engine is a lazily-spawned
	 * subprocess that can die (e.g. a dependency upgrade deletes the previously
	 * resolved bin, or the process is OOM-killed). Latching false meant one
	 * hiccup silently disabled every feature's maturity score until a full app
	 * restart. Now the next call after the cooldown reconnects.
	 */
	get available(): boolean {
		if (this.#client) return true;
		return Date.now() - this.#lastFailAt >= UnspaEngineClient.#RETRY_COOLDOWN_MS;
	}

	/** The currently connected client without triggering a connect, for recycle paths. */
	get connected(): Client | null {
		return this.#client;
	}

	/**
	 * The engine's own version, from the MCP handshake — so the components
	 * screen shows what is RUNNING (a local development build included), not
	 * what package.json asked for. Connecting is enough; no tool call is made.
	 */
	async version(): Promise<string | null> {
		const client = await this.client();
		return client?.getServerVersion()?.version ?? null;
	}

	/** Drop the warm subprocess so the next call transparently respawns a clean one. */
	recycle(): void {
		const client = this.#client;
		this.#client = null;
		this.#connecting = null;
		try {
			// `close()` is async (it ends stdin, then SIGTERMs): fire it and swallow
			// the rejection so a dead pipe can't surface as an unhandled rejection.
			void Promise.resolve(
				(client as { close?: () => unknown } | null)?.close?.()
			).catch(() => {});
		} catch {
			// best-effort — a dead pipe may already be gone
		}
	}

	/**
	 * Call a tool and return its parsed JSON payload, or null on any failure
	 * (engine unreachable, non-JSON text, tool error). Centralizes the
	 * connect → callTool → extractText → safeJson chain every read shares.
	 */
	async callJson(
		name: string,
		args: Record<string, unknown>,
		opts?: EngineCallOptions
	): Promise<unknown | null> {
		const client = await this.client();
		if (!client) return null;
		try {
			const res = await client.callTool({ name, arguments: args }, undefined, this.#requestOptions(opts));
			const text = extractText(res);
			if (!text) return null;
			const parsed = safeJson(text);
			if (parsed === null) {
				console.warn(`[${this.#label}] ${name} non-JSON: ${text.slice(0, 240)}`);
				return null;
			}
			if (typeof parsed === 'object' && (parsed as { error?: unknown }).error) {
				console.warn(`[${this.#label}] ${name} error: ${text.slice(0, 240)}`);
				return null;
			}
			return parsed;
		} catch (e) {
			this.#onCallFailure(name, e);
			return null;
		}
	}

	/**
	 * Like `callJson`, but keeps a tool-reported error instead of flattening it
	 * to null. Write paths need the reason (a refused `finalize_analysis` names
	 * the untraced elements, and that IS the answer the caller must act on),
	 * whereas reads are happy to degrade silently.
	 */
	async callJsonOrError(
		name: string,
		args: Record<string, unknown>,
		opts?: EngineCallOptions
	): Promise<{ ok: true; value: unknown } | { ok: false; error: string } | null> {
		const client = await this.client();
		if (!client) return null;
		try {
			const res = await client.callTool({ name, arguments: args }, undefined, this.#requestOptions(opts));
			const text = extractText(res);
			if (!text) return { ok: false, error: `${name} returned no content` };
			if (res && typeof res === 'object' && (res as { isError?: unknown }).isError === true) {
				return { ok: false, error: text };
			}
			const parsed = safeJson(text);
			// A tool that answers in prose rather than JSON is reporting a refusal
			// (the engine's `errorText` envelope) — surface the prose verbatim.
			if (parsed === null) return { ok: false, error: text };
			if (typeof parsed === 'object' && (parsed as { error?: unknown }).error) {
				return { ok: false, error: text };
			}
			return { ok: true, value: parsed };
		} catch (e) {
			this.#onCallFailure(name, e);
			return null;
		}
	}

	/** The deadline this call runs under: its own, else the connection's. */
	#requestOptions(opts?: EngineCallOptions): { timeout: number } {
		return { timeout: opts?.timeoutMs ?? this.#cfg.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS };
	}

	/**
	 * One failed call. A deadline we set ourselves is not just a lost answer: the
	 * engine is still computing it, single-threaded, and every later call queues
	 * behind that. Dropping the subprocess is the only way to stop it, so we do,
	 * and the next call transparently respawns a clean one.
	 *
	 * The cost is that a call running CONCURRENTLY on this connection dies with
	 * it. That is the right trade: the runaway call was starving it anyway.
	 */
	#onCallFailure(name: string, e: unknown): void {
		if (isRequestTimeout(e)) {
			console.warn(
				`[${this.#label}] ${name} exceeded its budget; dropping the engine subprocess so it stops computing`
			);
			this.recycle();
			return;
		}
		console.warn(`[${this.#label}] ${name} failed:`, msg(e));
	}

	/** Read an MCP resource's text payload (e.g. `unspa://operations`). */
	async readResourceText(uri: string): Promise<string | null> {
		const client = await this.client();
		if (!client) return null;
		try {
			const resource = await client.readResource({ uri });
			const text = resource.contents.find(
				(content): content is Extract<(typeof resource.contents)[number], { text: string }> =>
					'text' in content
			)?.text;
			return typeof text === 'string' ? text : null;
		} catch (e) {
			console.warn(`[${this.#label}] readResource ${uri} failed:`, msg(e));
			return null;
		}
	}

	async client(): Promise<Client | null> {
		if (this.#client) return this.#client;
		if (this.#connecting) return this.#connecting;
		// Recent failure → stay quiet until the cooldown elapses, then retry.
		if (Date.now() - this.#lastFailAt < UnspaEngineClient.#RETRY_COOLDOWN_MS) return null;

		this.#connecting = this.#connect()
			.then((client) => {
				// Clear the cached client if the subprocess ever closes, so the next
				// call transparently respawns instead of hammering a dead pipe.
				client.onclose = () => {
					this.#client = null;
				};
				this.#client = client;
				this.#connecting = null;
				return client;
			})
			.catch((e) => {
				console.warn(`[${this.#label}] subprocess connect failed:`, msg(e));
				this.#lastFailAt = Date.now();
				this.#client = null;
				this.#connecting = null;
				return null;
			});
		return this.#connecting;
	}

	async #connect(): Promise<Client> {
		if (!existsSync(this.#cfg.mcpBinPath)) {
			throw new Error(`Unspaghettit MCP bin not found at ${this.#cfg.mcpBinPath}`);
		}
		// This first-party-but-isolated optional process must not inherit platform
		// secrets (BYOK keys, database URLs, auth configuration or signing material).
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [this.#cfg.mcpBinPath],
			env: unspaghettitSubprocessEnv(process.env, this.#cfg.snapshotsRoot)
		});
		const client = new Client(
			{ name: 'lyriks-platform', version: this.#cfg.platformVersion || 'dev' },
			{ capabilities: {} }
		);
		await client.connect(transport);
		console.log(`[${this.#label}] connected (snapshots=${this.#cfg.snapshotsRoot})`);
		return client;
	}
}

export function msg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

export function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** First text block of an MCP tool result, or null when it carried none. */
export function extractText(res: unknown): string | null {
	if (typeof res !== 'object' || res === null) return null;
	const content = (res as { content?: unknown }).content;
	if (!Array.isArray(content)) return null;
	for (const part of content) {
		if (
			typeof part === 'object' &&
			part !== null &&
			(part as { type?: unknown }).type === 'text' &&
			typeof (part as { text?: unknown }).text === 'string'
		) {
			return (part as { text: string }).text;
		}
	}
	return null;
}
