#!/usr/bin/env node
/**
 * Generate an OFFLINE lucide icon subset so the app never fetches icons from
 * api.iconify.design at runtime (air-gap requirement — see
 * docs/deployment/05-architecture-validation.md, finding F1).
 *
 * It scans the source for every `lucide:<name>` reference, extracts just those
 * icons (resolving aliases) from the `@iconify-json/lucide` data package (a
 * devDependency — NOT shipped), and writes a small committed IconifyJSON to
 * src/lib/ui/icons/lucide-offline.json that the client registers at startup.
 *
 * Re-run after adding/removing icons:  node scripts/build-icon-subset.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'scripts'];
const OUT = join(root, 'src', 'lib', 'ui', 'icons', 'lucide-offline.json');
const SOURCE = join(root, 'node_modules', '@iconify-json', 'lucide', 'icons.json');

/** Walk a directory tree, yielding text-file paths. */
function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry.startsWith('.')) continue;
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) yield* walk(full);
		else if (/\.(svelte|ts|tsx|js|mjs|json)$/.test(entry)) yield full;
	}
}

// 1. Collect every lucide:<name> referenced anywhere in the source.
const used = new Set();
for (const base of SCAN_DIRS) {
	const dir = join(root, base);
	try {
		for (const file of walk(dir)) {
			if (file === OUT) continue;
			const text = readFileSync(file, 'utf8');
			for (const m of text.matchAll(/lucide:([a-z0-9-]+)/g)) used.add(m[1]);
		}
	} catch {
		/* dir may not exist */
	}
}

// 2. Load the full lucide data set.
const full = JSON.parse(readFileSync(SOURCE, 'utf8'));
const icons = {};
const aliases = {};
const missing = [];

for (const name of [...used].sort()) {
	if (full.icons?.[name]) {
		icons[name] = full.icons[name];
	} else if (full.aliases?.[name]) {
		// Resolve the alias and pull in its parent icon too.
		aliases[name] = full.aliases[name];
		const parent = full.aliases[name].parent;
		if (parent && full.icons?.[parent]) icons[parent] = full.icons[parent];
	} else {
		missing.push(name);
	}
}

if (missing.length) {
	console.warn(`! ${missing.length} lucide name(s) not found in data set: ${missing.join(', ')}`);
}

// 3. Emit a minimal IconifyJSON (prefix + default dimensions + just our icons).
const out = {
	prefix: full.prefix,
	icons,
	...(Object.keys(aliases).length ? { aliases } : {}),
	width: full.width ?? 24,
	height: full.height ?? 24
};
writeFileSync(OUT, JSON.stringify(out) + '\n');

const bytes = Buffer.byteLength(JSON.stringify(out));
console.log(
	`✓ ${Object.keys(icons).length} icons (+${Object.keys(aliases).length} aliases) → ` +
		`${OUT.replace(root + '/', '')} (${(bytes / 1024).toFixed(1)} KB)`
);
