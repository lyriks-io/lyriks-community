#!/usr/bin/env node
/**
 * Build the runnable MCP server bundle (dist/index.js).
 *
 * We use esbuild (not tsc) for the same reason as packages/api: the shipped
 * artifact runs on-prem inside an appliance the customer can open, so it must
 * not be trivially reversible to source. tsc emitted one readable .js per source
 * file (identifiers and structure intact) plus a .js.map beside each, i.e. the
 * original TypeScript. esbuild instead produces a single minified bundle with no
 * sourcemap.
 *
 * `packages: 'external'` keeps every npm dependency (hono, jose, zod,
 * @modelcontextprotocol/sdk, @hono/node-server) OUT of the bundle: they are
 * resolved at runtime from node_modules that `pnpm deploy --prod` ships beside
 * dist/. Only our own source is inlined and minified. Type-checking still runs
 * via the `typecheck` script (tsc --noEmit), which esbuild does not do.
 */

import { build } from 'esbuild';
import { rmSync } from 'node:fs';

// Start clean so the old per-file tsc output (index.js, *.js.map, *.d.ts) from a
// previous build can never linger beside, or be shipped instead of, the bundle.
rmSync('dist', { recursive: true, force: true });

const result = await build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	platform: 'node',
	target: 'node20',
	format: 'esm',
	outfile: 'dist/index.js',
	tsconfig: 'tsconfig.json',
	// Only our source is bundled; every npm dependency stays external and is
	// required from node_modules at runtime (node: builtins are external too).
	packages: 'external',
	// On-prem opacity: mangle local identifiers, emit no sourcemap.
	minify: true,
	sourcemap: false,
	logLevel: 'info'
});

if (result.errors.length > 0) {
	console.error(result.errors);
	process.exit(1);
}
