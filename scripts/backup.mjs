#!/usr/bin/env node
/**
 * Component-level backup of the platform's persistent state.
 * Writes timestamped artifacts into LYRIKS_BACKUP_DIR (default ./backups):
 *
 *   - PostgreSQL: a `pg_dump -Fc` custom-format dump.
 *   - Behavior: a tarball of data/unspa (the shells the engine reads).
 *
 * This is not the multi-component appliance backup. Appliance operators use
 * `./lyriks backup`, which also captures back/DPO databases and API identity.
 * Schedule it (cron / orchestrator CronJob) every N minutes — that interval is
 * your RPO. Pair with restore.mjs and measure the restore time for your RTO.
 *
 *   LYRIKS_PG_URL=… \
 *   [LYRIKS_BACKUP_DIR=./backups] [LYRIKS_UNSPA_DIR=./data/unspa] \
 *   node scripts/backup.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKUP_DIR = resolve(process.env.LYRIKS_BACKUP_DIR ?? 'backups');
const UNSPA_DIR = resolve(process.env.LYRIKS_UNSPA_DIR ?? 'data/unspa');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

mkdirSync(BACKUP_DIR, { recursive: true });

function tarDir(srcDir, dest) {
	if (!existsSync(srcDir)) {
		console.warn(`skip: ${srcDir} does not exist`);
		return;
	}
	const r = spawnSync('tar', ['-czf', dest, '-C', resolve(srcDir, '..'), srcDir.split('/').pop()], {
		stdio: 'inherit'
	});
	if (r.status !== 0) throw new Error(`tar failed for ${srcDir}`);
	console.log(`✓ ${dest}`);
}

function backupPostgres() {
	const url = process.env.LYRIKS_PG_URL;
	if (!url) throw new Error('LYRIKS_PG_URL is required for the postgres profile');
	const dest = resolve(BACKUP_DIR, `lyriks-${stamp}.dump`);
	const r = spawnSync('pg_dump', ['-Fc', '-d', url, '-f', dest], { stdio: 'inherit' });
	if (r.status !== 0) throw new Error('pg_dump failed (is the client installed / reachable?)');
	console.log(`✓ ${dest}`);
}

async function main() {
	console.log(`Backing up PostgreSQL → ${BACKUP_DIR}`);
	backupPostgres();
	tarDir(UNSPA_DIR, resolve(BACKUP_DIR, `unspa-${stamp}.tgz`));
	console.log('Backup complete.');
}

main().catch((e) => {
	console.error('Backup failed:', e.message);
	process.exitCode = 1;
});
