// Maintenance: quarantine orphan Unspaghettit workspace folders under data/unspa.
//
// An orphan is a folder claimed by NEITHER the platform catalog (project_drafts)
// NOR a back link (back_project_links) — left by deletes before the cascade
// existed, or by aborted tests. Canonicality is never inferred from a directory
// name: a folder is only a candidate because the DB truth does not claim it (see
// scripts/lib/unspa-integrity.mjs). Twins and stale links are NOT touched here —
// they need reconciliation, not deletion.
//
// This tool is NON-DESTRUCTIVE by default and NEVER deletes:
//   node scripts/prune-orphan-unspa.mjs               # dry-run: report candidates
//   node scripts/prune-orphan-unspa.mjs --quarantine  # move orphans to data/unspa/.quarantine/<ts>/
//
// Quarantine moves (renameSync) each orphan into a timestamped folder with a
// checksum manifest and prints a copy-paste restore command. Nothing is unlinked.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { QUARANTINE_DIRNAME, auditIntegrity, planQuarantine, scanUnspaTree } from './lib/unspa-integrity.mjs';

const quarantine = process.argv.includes('--quarantine');
const root = resolve('data/unspa');

const connectionString = process.env.LYRIKS_PG_URL;
if (!connectionString) {
	console.error("[quarantine] LYRIKS_PG_URL is required — aborting (won't touch workspaces).");
	process.exit(1);
}
if (!existsSync(root)) {
	console.log('[quarantine] no data/unspa — nothing to do.');
	process.exit(0);
}

const db = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
await db.connect();
const catalogIds = (await db.query('SELECT project_id FROM project_drafts')).rows.map((r) => r.project_id);
const links = (await db.query('SELECT local_project_id, back_project_id, back_workspace_id FROM back_project_links')).rows.map(
	(r) => ({ localProjectId: r.local_project_id, backProjectId: r.back_project_id, backWorkspaceId: r.back_workspace_id })
);
await db.end();

const folders = scanUnspaTree(root);
const report = auditIntegrity({ root, catalogIds, links, folders });
const { candidates } = planQuarantine(report, folders);

console.log(
	`[quarantine] ${catalogIds.length} catalog project(s) · ${links.length} link(s) · ${folders.length} folder(s) · ${candidates.length} orphan(s).`
);
if (report.findings.twins.length > 0) {
	console.log(`[quarantine] note: ${report.findings.twins.length} twin(s) NOT touched — run the auditor + reconciliation for those.`);
}
if (candidates.length === 0) {
	console.log('[quarantine] no orphans — nothing to do.');
	process.exit(0);
}

if (!quarantine) {
	for (const c of candidates) console.log(`  would quarantine: data/unspa/${c.dirName} (${c.files.length} file(s))`);
	console.log('[quarantine] dry-run complete. Re-run with --quarantine to stage these into data/unspa/.quarantine/.');
	process.exit(0);
}

// Destructive-but-reversible: renameSync into a timestamped quarantine dir.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const quarantineDir = join(root, QUARANTINE_DIRNAME, stamp);
mkdirSync(quarantineDir, { recursive: true });
const moved = [];
for (const c of candidates) {
	const dest = join(quarantineDir, c.dirName);
	renameSync(c.path, dest);
	moved.push({ dirName: c.dirName, originalPath: `data/unspa/${c.dirName}`, files: c.files });
	console.log(`  quarantined: data/unspa/${c.dirName} → ${QUARANTINE_DIRNAME}/${stamp}/${c.dirName}`);
}
const manifestPath = join(quarantineDir, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify({ quarantinedAt: stamp, root: 'data/unspa', moved }, null, 2));
console.log(`[quarantine] moved ${moved.length} orphan(s). Manifest: ${QUARANTINE_DIRNAME}/${stamp}/manifest.json`);
console.log('[quarantine] restore with:');
for (const m of moved) console.log(`  mv "${join(quarantineDir, m.dirName)}" "${resolve(m.originalPath)}"`);
