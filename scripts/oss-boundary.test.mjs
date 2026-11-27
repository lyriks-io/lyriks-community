/**
 * The open-source boundary, enforced.
 *
 * With the Enterprise overlay unlinked, nothing under `src/` may import the
 * overlay or carry an Enterprise-only construct. The rules name constructs,
 * not words: a comment that explains what Enterprise adds is fine, a call
 * into it is not.
 *
 * Run with `pnpm test:oss-boundary` (it unlinks the overlay first and restores
 * whatever state it found).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { linkOverlay, overlayLinked, unlinkOverlay } from './ee.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src');

/** Always refused: a direct path into the overlay. */
const GENERIC = [{ name: 'overlay import', re: /['"](\$lib\/ee|\/src\/lib\/ee|\.\.?\/ee)\// }];

/**
 * A private tree that carries the overlay also carries the list of its
 * constructs (ee/oss-boundary.rules.mjs) and refuses each of them outside the
 * seams; the public tree has no such list because it has nothing to leak.
 */
async function forbidden() {
	const rulesFile = join(root, 'ee/oss-boundary.rules.mjs');
	if (!existsSync(rulesFile)) return GENERIC;
	const { rules } = await import(pathToFileURL(rulesFile).href);
	return [...GENERIC, ...rules];
}

/** The seams: the files that discover the overlay by design may name it. */
const ALLOWED = [
	'src/lib/composition/enterprise-overlay.server.ts',
	'src/lib/ui/shell/capabilities.ts',
	'src/routes/+layout.svelte',
	'src/routes/settings/+page.svelte'
];

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) yield* walk(path);
		else if (/\.(ts|svelte|js|mjs)$/.test(entry)) yield path;
	}
}

test('the open-source tree carries no Enterprise construct', async () => {
	const rules = await forbidden();
	const wasLinked = overlayLinked();
	unlinkOverlay();
	try {
		const leaks = [];
		for (const file of walk(SRC)) {
			const rel = relative(root, file);
			const text = readFileSync(file, 'utf8');
			for (const rule of rules) {
				if (ALLOWED.includes(rel)) continue;
				const lines = text.split('\n');
				lines.forEach((line, i) => {
					// A comment may explain what Enterprise adds; only code counts.
					const trimmed = line.trim();
					if (/^(\/\/|\*|\/\*|<!--)/.test(trimmed)) return;
					if (rule.re.test(line)) leaks.push(`${rel}:${i + 1} [${rule.name}] ${trimmed.slice(0, 100)}`);
				});
			}
		}
		assert.deepEqual(leaks, [], `Enterprise constructs found in the open-source tree:\n${leaks.join('\n')}`);
	} finally {
		if (wasLinked) linkOverlay();
	}
});

test('the overlay, when this tree carries one, lives outside src/', (t) => {
	// The exported open-source repository has no overlay at all, which is the point.
	if (!existsSync(join(root, 'ee'))) return t.skip('no overlay in this tree');
	assert.equal(statSync(join(root, 'ee/lib')).isDirectory(), true);
	assert.equal(statSync(join(root, 'ee/routes')).isDirectory(), true);
});

test('nothing private reaches the exported sources: the export refuses what this finds', (t) => {
	// The export stops on a person's name, a customer or a private host anywhere in the public tree (its
	// FORBIDDEN list). Found only at release time, it held 2026.11-76 back on test fixtures written weeks
	// before; read here, a pull request fails on it instead. The list itself never leaves this tree.
	const script = join(root, 'scripts/export-oss.sh');
	if (!existsSync(script)) return t.skip('no export script in this tree');
	const listed = /^FORBIDDEN='(.*)'$/m.exec(readFileSync(script, 'utf8'));
	assert.ok(listed, 'scripts/export-oss.sh defines FORBIDDEN on one line');
	const forbidden = new RegExp(listed[1], 'i');
	const overlay = [join(SRC, 'lib/ee'), join(SRC, 'routes/(ee)')];
	const files = (dir) =>
		readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
			const path = join(dir, entry.name);
			if (overlay.includes(path)) return [];
			return entry.isDirectory() ? files(path) : [path];
		});
	const hits = [];
	for (const file of [...files(SRC), ...files(join(root, 'scripts/oss'))]) {
		const text = readFileSync(file);
		if (text.includes(0)) continue;
		text.toString('utf8').split('\n').forEach((line, i) => {
			if (forbidden.test(line)) hits.push(`${relative(root, file)}:${i + 1} ${line.trim().slice(0, 100)}`);
		});
	}
	assert.deepEqual(hits, [], `private material the export would refuse:\n${hits.join('\n')}`);
});
