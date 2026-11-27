import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SvelteKit refuses, at build time only, a route module that exports a name it
 * does not know: neither the type check nor a test importing the module sees
 * it, and a lab deploy of 2026-11-24 failed on one exported constant. Every
 * route module is read here, so the build is never the first to say.
 */
const ALLOWED: Readonly<Record<string, ReadonlySet<string>>> = {
	'+server.ts': new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'fallback', 'prerender', 'trailingSlash', 'config', 'entries']),
	'+page.server.ts': new Set(['load', 'actions', 'prerender', 'ssr', 'csr', 'trailingSlash', 'config', 'entries']),
	'+layout.server.ts': new Set(['load', 'prerender', 'ssr', 'csr', 'trailingSlash', 'config']),
	'+page.ts': new Set(['load', 'prerender', 'ssr', 'csr', 'trailingSlash', 'config', 'entries']),
	'+layout.ts': new Set(['load', 'prerender', 'ssr', 'csr', 'trailingSlash', 'config'])
};

function routeModules(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return routeModules(path);
		return entry.name in ALLOWED ? [path] : [];
	});
}

/** The names a module exports as values: `export const|let|function|class NAME` and `export { a, b as c }`. */
function exportedNames(source: string): string[] {
	const declared = [...source.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
	const listed = [...source.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((m) =>
		m[1]
			.split(',')
			.map((part) => part.trim())
			.filter((part) => part && !part.startsWith('type '))
			.map((part) => part.split(/\s+as\s+/).pop()!.trim())
	);
	return [...declared, ...listed];
}

describe('route modules', () => {
	it('export only what SvelteKit accepts, or a name starting with _', () => {
		const roots = ['src/routes'];
		const refused = roots.flatMap(routeModules).flatMap((file) => {
			const allowed = ALLOWED[file.split('/').pop()!];
			return exportedNames(readFileSync(file, 'utf8'))
				.filter((name) => !allowed.has(name) && !name.startsWith('_'))
				.map((name) => `${file}: ${name}`);
		});
		expect(refused).toEqual([]);
	});
});
