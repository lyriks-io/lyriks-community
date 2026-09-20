// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). A minimal
// MCP client over Streamable HTTP, shared by mcp-call, sync-index and
// apply-batch. It exists because some tool arguments cannot be typed by an
// agent as a tool call (an implementation index weighs megabytes, a behavior
// batch tens of kilobytes): a script reads them from disk and sends them.
// No dependencies, Node 18+ (global fetch), no network except the endpoint.

/** The revision this client asks for; the server answers with the one it settles on. */
const PROTOCOL_VERSION = '2025-06-18';

/**
 * Split argv into positionals and flags. `valueFlags` names the flags that
 * take a value (`--url X`); any other `--flag` is a boolean. A lone `-` is a
 * positional (stdin).
 */
export function parseArgs(argv, valueFlags = []) {
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg.startsWith('--')) {
			positional.push(arg);
			continue;
		}
		const name = arg.slice(2);
		if (!valueFlags.includes(name)) {
			flags[name] = true;
			continue;
		}
		const value = argv[i + 1];
		if (value === undefined) throw new Error(`--${name} needs a value.`);
		flags[name] = value;
		i += 1;
	}
	return { positional, flags };
}

/** The flags every networked script accepts. */
export const ENDPOINT_FLAGS = ['url', 'token'];

/** Where to call and with what bearer: the flags win over the environment. */
export function resolveEndpoint(flags = {}) {
	const url = flags.url || process.env.LYRIKS_MCP_URL;
	if (!url) {
		throw new Error(
			'No MCP endpoint: pass --url or set LYRIKS_MCP_URL (the Lyriks MCP address your agent is connected to, ending in /mcp).'
		);
	}
	return { url, token: flags.token || process.env.LYRIKS_MCP_TOKEN || null };
}

/**
 * The JSON-RPC messages of an SSE body. Comment lines (the gateway writes
 * `: keep-alive` while a long report computes) and non-JSON events are skipped;
 * a multi-line `data:` field is joined as the SSE format says.
 */
export function readSseMessages(body) {
	const messages = [];
	for (const event of body.split(/\r?\n\r?\n/)) {
		const data = event
			.split(/\r?\n/)
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).replace(/^ /, ''))
			.join('\n');
		if (!data) continue;
		try {
			messages.push(JSON.parse(data));
		} catch {
			// Not a JSON-RPC message: nothing this client can use.
		}
	}
	return messages;
}

async function post({ url, token }, sessionHeaders, message) {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			// The Streamable HTTP transport refuses (406) a client that does not
			// accept BOTH: it picks JSON or an event stream per answer.
			Accept: 'application/json, text/event-stream',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...sessionHeaders
		},
		body: JSON.stringify(message)
	});
	const text = await response.text();
	if (response.status === 401 || response.status === 403) {
		throw new Error(
			`The MCP endpoint refused the call (${response.status}): this deployment enforces sign-in. Pass --token or set LYRIKS_MCP_TOKEN; an expired token is refused the same way.`
		);
	}
	if (!response.ok) {
		throw new Error(`The MCP endpoint answered ${response.status}: ${text.slice(0, 300)}`);
	}
	// A notification has no id and gets no answer (202, empty body).
	if (message.id === undefined) return { result: null, sessionId: null };
	const type = response.headers.get('content-type') || '';
	let messages;
	if (type.includes('text/event-stream')) messages = readSseMessages(text);
	else {
		try {
			messages = [JSON.parse(text)].flat();
		} catch {
			throw new Error(`The MCP endpoint answered something that is not JSON: ${text.slice(0, 300)}`);
		}
	}
	const answer = messages.find((candidate) => candidate && candidate.id === message.id);
	if (!answer) throw new Error(`The MCP endpoint never answered request ${message.id} (${message.method}).`);
	if (answer.error) {
		const code = answer.error.code === undefined ? '' : ` ${answer.error.code}`;
		throw new Error(`MCP error${code}: ${answer.error.message ?? 'unknown error'}`);
	}
	return { result: answer.result, sessionId: response.headers.get('mcp-session-id') };
}

/**
 * Open a session (initialize, then notifications/initialized) and return a
 * `callTool`. A stateless gateway hands out no session id; a stateful one
 * does, and then expects it on every later request.
 */
export async function openSession(endpoint) {
	const sessionHeaders = {};
	const init = await post(endpoint, sessionHeaders, {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: 'lyriks-tools', version: '1' }
		}
	});
	if (init.sessionId) sessionHeaders['Mcp-Session-Id'] = init.sessionId;
	sessionHeaders['MCP-Protocol-Version'] = init.result?.protocolVersion || PROTOCOL_VERSION;
	await post(endpoint, sessionHeaders, { jsonrpc: '2.0', method: 'notifications/initialized' });

	let nextId = 2;
	return {
		/** Call one tool and return the text of its result; a tool-level error throws with that text. */
		async callTool(name, args = {}) {
			const { result } = await post(endpoint, sessionHeaders, {
				jsonrpc: '2.0',
				id: nextId++,
				method: 'tools/call',
				params: { name, arguments: args }
			});
			const text = (Array.isArray(result?.content) ? result.content : [])
				.filter((item) => item && item.type === 'text' && typeof item.text === 'string')
				.map((item) => item.text)
				.join('\n');
			if (result?.isError) throw new Error(`${name} failed: ${text || 'no detail given'}`);
			return text;
		}
	};
}

/** Call one tool whose answer is JSON text (every Lyriks tool) and parse it. */
export async function callToolJson(session, name, args) {
	const text = await session.callTool(name, args);
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`${name} answered text that is not JSON: ${text.slice(0, 300)}`);
	}
}

/** Run a script body, print a failure as one line on stderr, and exit 1 on it. */
export async function runScript(body) {
	try {
		process.exitCode = (await body()) ?? 0;
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
