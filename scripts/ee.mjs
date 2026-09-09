#!/usr/bin/env node
/**
 * Link or unlink the Enterprise overlay into the SvelteKit tree.
 *
 *   node scripts/ee.mjs link     copy ee/lib -> src/lib/ee, ee/routes -> src/routes/(ee)
 *   node scripts/ee.mjs unlink   remove both generated locations
 *   node scripts/ee.mjs status   print whether the overlay is linked
 *
 * A copy, not a symlink: SvelteKit's route scanner and Vite's file watcher
 * treat a copied tree like any other source, while a symlinked route group
 * has bitten both in the past. The generated locations are git-ignored.
 */
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OVERLAY = {
	lib: { from: resolve(root, 'ee/lib'), to: resolve(root, 'src/lib/ee') },
	routes: { from: resolve(root, 'ee/routes'), to: resolve(root, 'src/routes/(ee)') }
};

export function linkOverlay() {
	for (const { from, to } of Object.values(OVERLAY)) {
		rmSync(to, { recursive: true, force: true });
		if (!existsSync(from)) continue;
		mkdirSync(dirname(to), { recursive: true });
		cpSync(from, to, { recursive: true });
	}
}

export function unlinkOverlay() {
	for (const { to } of Object.values(OVERLAY)) rmSync(to, { recursive: true, force: true });
}

export function overlayLinked() {
	return existsSync(OVERLAY.lib.to) || existsSync(OVERLAY.routes.to);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const command = process.argv[2];
	if (command === 'link') {
		linkOverlay();
		console.log('[ee] overlay linked into src/lib/ee and src/routes/(ee)');
	} else if (command === 'unlink') {
		unlinkOverlay();
		console.log('[ee] overlay unlinked: open-source tree');
	} else if (command === 'status') {
		console.log(overlayLinked() ? 'linked' : 'unlinked');
	} else {
		console.error('usage: node scripts/ee.mjs link|unlink|status');
		process.exit(2);
	}
}
