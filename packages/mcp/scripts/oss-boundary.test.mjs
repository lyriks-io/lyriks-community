/**
 * The open-source boundary, enforced.
 *
 * With the Enterprise overlay unlinked, nothing under `src/` may import the
 * overlay. A private tree that carries the overlay also carries the list of
 * its constructs (ee/oss-boundary.rules.mjs) and refuses each of them outside
 * the seam; the public tree has no such list because it has nothing to leak.
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
const GENERIC = [{ name: 'overlay import', re: /from\s+['"](\.\.?\/)+ee\// }];

/** The seam: the one file that discovers the overlay by design. */
const ALLOWED = ['src/enterprise/index.ts'];

async function forbidden() {
	const rulesFile = join(root, 'ee/oss-boundary.rules.mjs');
	if (!existsSync(rulesFile)) return GENERIC;
	const { rules } = await import(pathToFileURL(rulesFile).href);
	return [...GENERIC, ...rules];
}

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) yield* walk(path);
		else if (/\.(ts|mjs|js)$/.test(entry)) yield path;
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
			if (ALLOWED.includes(rel)) continue;
			const text = readFileSync(file, 'utf8');
			for (const rule of rules) {
				const at = text.search(rule.re);
				if (at >= 0) leaks.push(`${rel}: ${rule.name} (${text.slice(0, at).split('\n').length})`);
			}
		}
		assert.deepEqual(leaks, [], `Enterprise constructs in the open-source tree:\n  ${leaks.join('\n  ')}`);
	} finally {
		if (wasLinked) linkOverlay();
	}
});

test('the stub overlay is what the open-source tree builds from', () => {
	const wasLinked = overlayLinked();
	unlinkOverlay();
	try {
		const stub = readFileSync(join(SRC, 'ee/index.ts'), 'utf8');
		assert.match(stub, /overlay: EnterpriseOverlay \| null = null/);
		assert.equal(existsSync(join(SRC, 'ee/register.ts')), false);
	} finally {
		if (wasLinked) linkOverlay();
	}
});
