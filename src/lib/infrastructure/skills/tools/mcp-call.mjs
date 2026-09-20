#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/mcp-call.mjs <tool> <args.json | -> [--url URL] [--token TOKEN] [--out FILE]
// Calls one Lyriks MCP tool with arguments read from a file (or stdin with
// `-`), for the calls whose arguments are too large to type as a tool call.
// Prints the text of the tool result, or writes it to --out when the answer is
// itself too large to read in one go. URL from --url or LYRIKS_MCP_URL, bearer
// from --token or LYRIKS_MCP_TOKEN where the deployment enforces sign-in.
import { readFileSync, writeFileSync } from 'node:fs';
import { ENDPOINT_FLAGS, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';

const USAGE = 'Usage: mcp-call.mjs <tool> <args.json | -> [--url URL] [--token TOKEN] [--out FILE]';

function readArguments(source) {
	// No file at all means a tool without arguments.
	if (source === undefined) return {};
	const text = readFileSync(source === '-' ? 0 : source, 'utf8');
	let args;
	try {
		args = JSON.parse(text);
	} catch (error) {
		throw new Error(`${source === '-' ? 'stdin' : source} is not valid JSON: ${error.message}`);
	}
	if (!args || typeof args !== 'object' || Array.isArray(args)) {
		throw new Error('The tool arguments must be a JSON object.');
	}
	return args;
}

runScript(async () => {
	const { positional, flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'out']);
	const [tool, source] = positional;
	if (!tool) throw new Error(USAGE);
	const args = readArguments(source);
	const session = await openSession(resolveEndpoint(flags));
	const text = await session.callTool(tool, args);
	if (typeof flags.out === 'string') {
		writeFileSync(flags.out, text);
		console.log(`${tool}: ${Buffer.byteLength(text)} bytes written to ${flags.out}`);
	} else {
		console.log(text);
	}
	return 0;
});
