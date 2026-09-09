import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { auditIntegrity, hasFindings, planQuarantine, scanUnspaTree } from './unspa-integrity.mjs';

// --- fixture builder -------------------------------------------------------
let root;
before(() => {
	root = mkdtempSync(join(tmpdir(), 'unspa-integrity-'));
});
after(() => rmSync(root, { recursive: true, force: true }));

function projectSnapshot(id, featureIds, name = id) {
	return { format: 'unspaghettit-project', version: 1, project: { id, name, description: '', tags: [], featureIds, createdAt: '', updatedAt: '' } };
}
function featureSnapshot(id) {
	return { format: 'unspaghettit', version: 1, feature: { id, name: id } };
}
function makeFolder(dirName, { project, features = [], manifestFileName } = {}) {
	const dir = join(root, dirName);
	mkdirSync(dir, { recursive: true });
	if (project) writeFileSync(join(dir, manifestFileName ?? `${project.project.id}.project.json`), JSON.stringify(project));
	for (const feat of features) writeFileSync(join(dir, `${feat.feature.id}.feature.json`), JSON.stringify(feat));
	return dir;
}

// Build one tree that exercises every enumerated case at once, then assert.
function buildKitchenSink() {
	// 1. local-only project: folder name = catalog id, no link
	makeFolder('local-only', { project: projectSnapshot('local-only', ['f-local']), features: [featureSnapshot('f-local')] });
	// 2. UUID-only (linked) project: folder name = back uuid; manifest id rewritten to uuid
	makeFolder('uuid-linked', { project: projectSnapshot('uuid-linked', ['f-linked']), features: [featureSnapshot('f-linked')] });
	// 3. twin: same Lyriks project has BOTH its slug folder and its back-uuid folder
	makeFolder('twin-slug', { project: projectSnapshot('twin-slug', ['f-twin']), features: [featureSnapshot('f-twin')] });
	makeFolder('twin-uuid', { project: projectSnapshot('twin-uuid', ['f-twin']), features: [featureSnapshot('f-twin')] });
	// 4. duplicate feature id WITHIN a folder (two files, same content id)
	const dupDir = makeFolder('dup-within', { project: projectSnapshot('dup-within', ['f-dup']), features: [featureSnapshot('f-dup')] });
	writeFileSync(join(dupDir, 'copy.feature.json'), JSON.stringify(featureSnapshot('f-dup')));
	// 5. duplicate feature id ACROSS folders (shared 'f-shared' — modelled via across-a/across-b)
	makeFolder('across-a', { project: projectSnapshot('across-a', ['f-shared']), features: [featureSnapshot('f-shared')] });
	makeFolder('across-b', { project: projectSnapshot('across-b', ['f-shared']), features: [featureSnapshot('f-shared')] });
	// 6. missing manifest: feature file but no *.project.json
	makeFolder('no-manifest', { features: [featureSnapshot('f-orphaned')] });
	// 7. missing feature file: manifest lists an id with no file
	makeFolder('missing-file', { project: projectSnapshot('missing-file', ['f-present', 'f-absent']), features: [featureSnapshot('f-present')] });
	// 8. unlisted feature file: file present, not in manifest.featureIds
	makeFolder('unlisted', { project: projectSnapshot('unlisted', ['f-listed']), features: [featureSnapshot('f-listed'), featureSnapshot('f-extra')] });
	// 9. true orphan: folder claimed by neither catalog nor link (a test artifact)
	makeFolder('P-orphan', { project: projectSnapshot('P-orphan', ['f-p']), features: [featureSnapshot('f-p')] });
	// 10. folder name ≠ manifest project id (conflicting)
	makeFolder('mismatch-dir', { project: projectSnapshot('some-other-id', []), manifestFileName: 'x.project.json' });

	const catalogIds = [
		'local-only', 'uuid-linked-local', 'twin-slug', 'dup-within', 'across-a', 'across-b',
		'no-manifest', 'missing-file', 'unlisted', 'mismatch-dir'
	];
	const links = [
		// uuid-linked-local (catalog) points at the 'uuid-linked' folder
		{ localProjectId: 'uuid-linked-local', backProjectId: 'uuid-linked', backWorkspaceId: 'ws' },
		// twin-slug also linked to 'twin-uuid' → both folders map to one project
		{ localProjectId: 'twin-slug', backProjectId: 'twin-uuid', backWorkspaceId: 'ws' },
		// 11. stale link: points at a folder that does not exist on disk
		{ localProjectId: 'local-only', backProjectId: 'gone-uuid', backWorkspaceId: 'ws' },
		// 12. link without a catalog row
		{ localProjectId: 'ghost-project', backProjectId: 'ghost-uuid', backWorkspaceId: 'ws' }
	];
	return { catalogIds, links };
}

describe('auditIntegrity — cross-reference findings', () => {
	let report;
	let folders;
	before(() => {
		const { catalogIds, links } = buildKitchenSink();
		folders = scanUnspaTree(root);
		report = auditIntegrity({ root, catalogIds, links, folders });
	});

	it('skips internal dot-directories when scanning', () => {
		mkdirSync(join(root, '.quarantine'), { recursive: true });
		mkdirSync(join(root, '.locks'), { recursive: true });
		mkdirSync(join(root, '.staging'), { recursive: true });
		assert.equal(scanUnspaTree(root).some((f) => f.dirName === '.quarantine'), false);
		assert.equal(scanUnspaTree(root).some((f) => f.dirName === '.locks'), false);
		assert.equal(scanUnspaTree(root).some((f) => f.dirName === '.staging'), false);
		rmSync(join(root, '.quarantine'), { recursive: true, force: true });
		rmSync(join(root, '.locks'), { recursive: true, force: true });
		rmSync(join(root, '.staging'), { recursive: true, force: true });
	});

	it('reads identity from content, never the filename', () => {
		const mismatch = scanUnspaTree(root).find((f) => f.dirName === 'mismatch-dir');
		assert.equal(mismatch.project.id, 'some-other-id'); // file was named x.project.json
	});

	it('reports a valid link without a local kernel folder as an observation, not corruption', () => {
		assert.deepEqual(report.observations.linksWithoutKernelFolder, [
			{ localProjectId: 'local-only', backProjectId: 'gone-uuid' }
		]);
	});

	it('flags a link with no catalog project', () => {
		assert.deepEqual(report.findings.linksWithoutCatalog, [{ localProjectId: 'ghost-project', backProjectId: 'ghost-uuid' }]);
	});

	it('detects a slug/UUID twin (>1 folder for one project)', () => {
		const twin = report.findings.twins.find((t) => t.localProjectId === 'twin-slug');
		assert.ok(twin);
		assert.deepEqual(twin.folders.sort(), ['twin-slug', 'twin-uuid']);
		assert.equal(twin.canonicalKernelId, 'twin-uuid'); // the linked back id wins as canonical
	});

	it('recognises a UUID-only linked project as owned, not orphan', () => {
		assert.equal(report.findings.orphanFolders.some((o) => o.dirName === 'uuid-linked'), false);
		const linked = report.projects.find((p) => p.localProjectId === 'uuid-linked-local');
		assert.equal(linked.linkStatus, 'linked');
		assert.deepEqual(linked.folders, ['uuid-linked']);
	});

	it('reports only true orphans (claimed by neither catalog nor link)', () => {
		assert.deepEqual(report.findings.orphanFolders.map((o) => o.dirName), ['P-orphan']);
	});

	it('detects a missing manifest', () => {
		assert.deepEqual(report.findings.missingManifests.map((m) => m.dirName), ['no-manifest']);
	});

	it('detects a manifest entry with no feature file', () => {
		assert.deepEqual(report.findings.missingFeatureFiles, [{ dirName: 'missing-file', featureId: 'f-absent' }]);
	});

	it('detects a feature file missing from the manifest', () => {
		assert.deepEqual(report.findings.unlistedFeatureFiles, [{ dirName: 'unlisted', featureId: 'f-extra' }]);
	});

	it('detects a duplicate feature id within a folder', () => {
		assert.deepEqual(report.findings.duplicateWithinFolder, [{ dirName: 'dup-within', featureId: 'f-dup' }]);
	});

	it('detects duplicate ids across twins but allows project-scoped ids in unrelated projects', () => {
		const twin = report.findings.duplicateAcrossFolders.find((d) => d.featureId === 'f-twin');
		assert.deepEqual(twin.folders, ['twin-slug', 'twin-uuid']);
		assert.equal(report.findings.duplicateAcrossFolders.some((d) => d.featureId === 'f-shared'), false);
	});

	it('detects folder-name ≠ manifest project id', () => {
		assert.deepEqual(report.findings.folderNameIdMismatch, [{ dirName: 'mismatch-dir', contentProjectId: 'some-other-id' }]);
	});

	it('hasFindings is true for this tree', () => {
		assert.equal(hasFindings(report), true);
	});
});

describe('planQuarantine — only true orphans, never twins', () => {
	it('selects exactly the orphan folders and no twins/stale links', () => {
		const { catalogIds, links } = buildKitchenSink();
		const folders = scanUnspaTree(root);
		const report = auditIntegrity({ root, catalogIds, links, folders });
		const { candidates } = planQuarantine(report, folders);
		assert.deepEqual(candidates.map((c) => c.dirName), ['P-orphan']);
		// a restorable checksum manifest is produced
		assert.ok(candidates[0].files.length >= 1);
		assert.ok(candidates[0].files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
		// twins are explicitly NOT quarantined
		assert.equal(candidates.some((c) => c.dirName.startsWith('twin')), false);
	});
});

describe('audit is read-only', () => {
	it('scanning + auditing + planning writes nothing to the tree', () => {
		const { catalogIds, links } = buildKitchenSink();
		const before = snapshotTree(root);
		const folders = scanUnspaTree(root);
		const report = auditIntegrity({ root, catalogIds, links, folders });
		planQuarantine(report, folders);
		assert.deepEqual(snapshotTree(root), before);
	});
});

function snapshotTree(dir) {
	const out = {};
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, name.name);
		if (name.isDirectory()) Object.assign(out, prefix(name.name, snapshotTree(full)));
		else out[name.name] = readFileSync(full, 'utf8');
	}
	return out;
}
function prefix(p, obj) {
	return Object.fromEntries(Object.entries(obj).map(([k, v]) => [`${p}/${k}`, v]));
}
