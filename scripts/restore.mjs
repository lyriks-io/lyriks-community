#!/usr/bin/env node
/**
 * Component-level restore for a backup produced by backup.mjs. The appliance
 * uses `./lyriks restore` so back/DPO/API state is restored as one set.
 * DESTRUCTIVE — overwrites the current
 * datastore — so it refuses to run unless LYRIKS_RESTORE_CONFIRM=1. Stop the
 * platform (all replicas) before restoring.
 *
 *   LYRIKS_RESTORE_CONFIRM=1 LYRIKS_PG_URL=… \
 *   node scripts/restore.mjs <db-artifact> [unspa-tarball]
 *
 *   - PostgreSQL: <db-artifact> is a .dump → pg_restore --clean --if-exists.
 *   - unspa   : optional behavior-shell tarball → extracted over data/unspa.
 *
 * Run this as a periodic drill against a scratch target and time it — that is
 * your measured RTO; the backup interval is your RPO.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.env.LYRIKS_RESTORE_CONFIRM !== '1') {
	console.error('Refusing to restore: set LYRIKS_RESTORE_CONFIRM=1 to proceed (this overwrites data).');
	process.exit(1);
}

const [dbArtifact, unspaTarball] = process.argv.slice(2);
if (!dbArtifact) {
	console.error('Usage: node scripts/restore.mjs <db-artifact> [unspa-tarball]');
	process.exit(1);
}
const artifact = resolve(dbArtifact);
if (!existsSync(artifact)) {
	console.error(`Artifact not found: ${artifact}`);
	process.exit(1);
}

const UNSPA_DIR = resolve(process.env.LYRIKS_UNSPA_DIR ?? 'data/unspa');

function restorePostgres() {
	const url = process.env.LYRIKS_PG_URL;
	if (!url) throw new Error('LYRIKS_PG_URL is required for the postgres profile');
	const r = spawnSync('pg_restore', ['--clean', '--if-exists', '-d', url, artifact], {
		stdio: 'inherit'
	});
	if (r.status !== 0) throw new Error('pg_restore failed');
	console.log('✓ restored Postgres');
}

function restoreUnspa() {
	if (!unspaTarball) return;
	const tb = resolve(unspaTarball);
	if (!existsSync(tb)) throw new Error(`unspa tarball not found: ${tb}`);
	const parent = resolve(UNSPA_DIR, '..');
	mkdirSync(parent, { recursive: true });
	const r = spawnSync('tar', ['-xzf', tb, '-C', parent], { stdio: 'inherit' });
	if (r.status !== 0) throw new Error('tar extract failed');
	console.log(`✓ restored behavior shells → ${UNSPA_DIR}`);
}

try {
	console.log(`Restoring PostgreSQL from ${artifact}`);
	restorePostgres();
	restoreUnspa();
	console.log('Restore complete. Start the platform and verify /readyz.');
} catch (e) {
	console.error('Restore failed:', e.message);
	process.exitCode = 1;
}
