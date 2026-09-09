// Read-only integrity auditor for the Unspaghettit kernel store (`data/unspa`).
//
// Cross-references three truth sources — the platform catalog (project_drafts),
// the back links (back_project_links) and the on-disk kernel tree — and reports
// broken/obsolete links, slug↔UUID twins, orphan folders, and manifest ↔ feature
// inconsistencies. It NEVER writes and NEVER calls the back API; safe to run at
// any time, including as a CI fixture check.
//
//   LYRIKS_PG_URL=... node scripts/audit-unspa-integrity.mjs           # human report
//   LYRIKS_PG_URL=... node scripts/audit-unspa-integrity.mjs --json    # machine report
//   LYRIKS_PG_URL=... node scripts/audit-unspa-integrity.mjs --strict  # exit 1 on findings (CI)
import { resolve } from 'node:path';
import pg from 'pg';
import { auditIntegrity, scanUnspaTree } from './lib/unspa-integrity.mjs';

const asJson = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
const root = resolve('data/unspa');

const connectionString = process.env.LYRIKS_PG_URL;
if (!connectionString) {
	console.error('[audit] LYRIKS_PG_URL is required (read-only, but the catalog + links live in Postgres).');
	process.exit(1);
}

const db = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
await db.connect();
const catalogIds = (await db.query('SELECT project_id FROM project_drafts')).rows.map((r) => r.project_id);
const links = (
	await db.query('SELECT local_project_id, back_project_id, back_workspace_id FROM back_project_links')
).rows.map((r) => ({
	localProjectId: r.local_project_id,
	backProjectId: r.back_project_id,
	backWorkspaceId: r.back_workspace_id
}));
await db.end();

const folders = scanUnspaTree(root);
const report = auditIntegrity({ root, catalogIds, links, folders });

if (asJson) {
	console.log(JSON.stringify(report, null, 2));
} else {
	printHuman(report);
}

const findingCount = Object.values(report.findings).reduce((n, list) => n + list.length, 0);
process.exit(strict && findingCount > 0 ? 1 : 0);

function printHuman(report) {
	const s = report.summary;
	console.log(
		`[audit] ${s.catalogProjects} catalog project(s) · ${s.links} link(s) · ${s.folders} kernel folder(s)`
	);
	console.log('');
	observation('Links with no local kernel folder', report.observations.linksWithoutKernelFolder, (x) => `${x.localProjectId} → ${x.backProjectId}`);
	line('Links without a catalog project', report.findings.linksWithoutCatalog, (x) => `${x.localProjectId} → ${x.backProjectId}`);
	line('Slug/UUID twins (>1 folder per project)', report.findings.twins, (x) => `${x.localProjectId}: ${x.folders.join(', ')} (canonical ${x.canonicalKernelId})`);
	line('Orphan folders (quarantine candidates)', report.findings.orphanFolders, (x) => `${x.dirName} (${x.featureCount} feature file(s))`);
	line('Folders missing a manifest', report.findings.missingManifests, (x) => x.dirName);
	line('Manifest entries with no feature file', report.findings.missingFeatureFiles, (x) => `${x.dirName}: ${x.featureId}`);
	line('Feature files not in the manifest', report.findings.unlistedFeatureFiles, (x) => `${x.dirName}: ${x.featureId}`);
	line('Duplicate feature id within a folder', report.findings.duplicateWithinFolder, (x) => `${x.dirName}: ${x.featureId}`);
	line('Duplicate feature id across twin folders', report.findings.duplicateAcrossFolders, (x) => `${x.localProjectId}/${x.featureId}: ${x.folders.join(', ')}`);
	line('Folder name ≠ manifest project id', report.findings.folderNameIdMismatch, (x) => `${x.dirName} (content ${x.contentProjectId})`);
	line('Parse errors', report.findings.parseErrors, (x) => `${x.dirName}/${x.file}: ${x.kind}`);

	const total = Object.values(report.findings).reduce((n, list) => n + list.length, 0);
	console.log('');
	console.log(total === 0 ? '[audit] no findings — store is consistent.' : `[audit] ${total} finding(s). This report is read-only; use scripts/prune-orphan-unspa.mjs --quarantine to stage orphans.`);
}

function observation(label, list, format) {
	console.log(`  · ${label}: ${list.length}`);
	for (const item of list) console.log(`      - ${format(item)}`);
}

function line(label, list, format) {
	if (list.length === 0) {
		console.log(`  ✓ ${label}: none`);
		return;
	}
	console.log(`  ✗ ${label}: ${list.length}`);
	for (const item of list) console.log(`      - ${format(item)}`);
}
