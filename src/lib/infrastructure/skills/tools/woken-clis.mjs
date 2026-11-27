// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Not run
// directly: the AI CLIs the person's waker can start without a window, one
// entry each (feat-ai-session, criterion 72220b6f "The waker starts the AI I
// work with"): how it is started with read-only access to the code and the
// Lyriks MCP allowed, through its own controls (criterion 47d4a354); the
// variables that would bill an API key instead of the plan it is signed in with
// (criterion 2c01fb5f); how it says it is signed in; and where its own
// configuration names the Lyriks MCP server.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const run = (command, args, env = process.env) => spawnSync(command, args, { encoding: 'utf8', env, timeout: 120_000 });
const sameUrl = (a, b) => typeof a === 'string' && a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
const readJson = (path) => {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
};

/** The name an MCP configuration `{ name: { url | httpUrl } }` gives the server at this address. */
function serverNamedIn(servers, url) {
	for (const [name, server] of Object.entries(servers ?? {})) if (sameUrl(server?.url, url) || sameUrl(server?.httpUrl, url)) return name;
	return null;
}

/** The name `claude mcp list` gives the server at this address, from its `name: url (HTTP) - …` lines. */
function serverListedIn(listing, url) {
	for (const line of listing.split('\n')) {
		const match = /^([^:\s][^:]*):\s+(\S+)/.exec(line.trim());
		if (match && sameUrl(match[2], url)) return match[1].trim();
	}
	return null;
}

/** Gemini CLI reads the person's settings, then the repository's. */
const geminiSettings = () => {
	const user = readJson(join(homedir(), '.gemini', 'settings.json')) ?? {};
	const project = readJson(join(process.cwd(), '.gemini', 'settings.json')) ?? {};
	return { ...user, ...project, mcpServers: { ...user.mcpServers, ...project.mcpServers } };
};

/** The git commands that only read: the history of the code, never a change to it. */
const READ_GIT = ['log', 'show', 'diff', 'status', 'ls-files', 'blame'];

export const CLIS = {
	claude: {
		name: 'Claude Code',
		command: 'claude',
		apiKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
		args: (prompt, server) => [
			'-p',
			prompt,
			'--permission-mode',
			'dontAsk',
			'--allowedTools',
			`mcp__${server}`,
			'Read',
			'Grep',
			'Glob',
			...READ_GIT.map((verb) => `Bash(git ${verb}:*)`),
			...['attach-source', 'mcp-call', 'apply-batch'].map((script) => `Bash(node .lyriks/tools/${script}.mjs:*)`),
			'--disallowedTools',
			'Edit',
			'Write',
			'NotebookEdit',
			'WebFetch',
			'WebSearch'
		],
		signIn(command, env) {
			try {
				const read = JSON.parse(run(command, ['auth', 'status', '--json'], env).stdout ?? '');
				return { loggedIn: read.loggedIn === true, apiKeyOnly: false, method: `${read.authMethod ?? 'unknown'}${read.subscriptionType ? ` (${read.subscriptionType} plan)` : ''}` };
			} catch {
				return { loggedIn: false, apiKeyOnly: false, method: 'unknown' };
			}
		},
		server: (command, url) => serverListedIn(run(command, ['mcp', 'list']).stdout ?? '', url)
	},
	codex: {
		name: 'Codex',
		command: 'codex',
		apiKeys: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
		// exec rejects every approval request, so the Lyriks MCP tools are approved up front; the ChatGPT sign-in is held unless an API key is allowed.
		args: (prompt, server, allowApiKey) => [
			'exec',
			'--sandbox',
			'read-only',
			'--ephemeral',
			'-c',
			'approval_policy="never"',
			...(allowApiKey ? [] : ['-c', 'forced_login_method="chatgpt"']),
			'-c',
			`mcp_servers.${server}.default_tools_approval_mode="approve"`,
			prompt
		],
		signIn(command, env) {
			const status = run(command, ['login', 'status'], env);
			const said = `${status.stderr ?? ''}${status.stdout ?? ''}`.trim().split('\n')[0] ?? '';
			return { loggedIn: status.status === 0, apiKeyOnly: /API key/i.test(said), method: said.replace(/ - .*$/, '') || 'unknown' };
		},
		server(command, url) {
			try {
				const listed = JSON.parse(run(command, ['mcp', 'list', '--json']).stdout ?? '');
				return listed.find((server) => sameUrl(server?.transport?.url, url))?.name ?? null;
			} catch {
				return null;
			}
		}
	},
	gemini: {
		name: 'Gemini CLI',
		command: 'gemini',
		apiKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI', 'GOOGLE_GEMINI_BASE_URL', 'GOOGLE_APPLICATION_CREDENTIALS'],
		// Headless, the default approval mode denies the shell and every write; the Lyriks MCP server is the one allowed.
		args: (prompt, server) => ['-p', prompt, '--skip-trust', '--approval-mode', 'default', '--allowed-mcp-server-names', server],
		signIn() {
			const type = geminiSettings().security?.auth?.selectedType;
			return { loggedIn: true, apiKeyOnly: type === 'gemini-api-key' || type === 'vertex-ai', method: type ?? 'as its settings choose' };
		},
		server: (_command, url) => serverNamedIn(geminiSettings().mcpServers, url)
	},
	copilot: {
		name: 'GitHub Copilot CLI',
		command: 'copilot',
		apiKeys: ['COPILOT_PROVIDER_API_KEY', 'COPILOT_PROVIDER_API_KEY_COMMAND', 'COPILOT_PROVIDERS_CONFIG'],
		args: (prompt, server) => ['-p', prompt, '--no-ask-user', `--allow-tool=${server}`, ...READ_GIT.map((verb) => `--allow-tool=shell(git ${verb})`), '--deny-tool=write'],
		signIn: () => ({ loggedIn: true, apiKeyOnly: false, method: 'its GitHub sign-in' }),
		server: (_command, url) => serverNamedIn(readJson(join(homedir(), '.copilot', 'mcp-config.json'))?.mcpServers, url)
	}
};
