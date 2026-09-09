// Read-only integrity model for the Unspaghettit kernel store (`data/unspa`).
//
// This module holds the pure scan / parse / cross-reference logic shared by the
// auditor (scripts/audit-unspa-integrity.mjs), the quarantine tool
// (scripts/prune-orphan-unspa.mjs) and their tests. It performs NO database
// access and NO writes — callers pass the DB-derived truth (catalog ids + back
// links) in, so the core is deterministic and unit-testable against fixtures.
//
// Folder-identity rules (verified against the running code, do not "simplify"):
//   * The kernel store lays one folder per project under data/unspa/<folderKey>/.
//   * folderKey is the BACK project UUID when a back link exists, else the Lyriks
//     project id (BackScopedBehaviorRepository.#scope). So a folder name is NOT
//     necessarily a Lyriks project id.
//   * On a linked save the snapshot's `project.id` is rewritten to the back UUID
//     (BackScopedBehaviorRepository.saveProject), so inside every folder the
//     manifest `project.id` should equal the folder name. A mismatch is a finding.
//   * The engine names the JSON files by slugify(name), NOT by id, and renames on
//     rename. Never trust a filename — identity always comes from parsed content
//     (`project.id` / `feature.id`).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const PROJECT_SUFFIX = '.project.json';
export const FEATURE_SUFFIX = '.feature.json';
export const UNSPA_PROJECT_FORMAT = 'unspaghettit-project';
export const QUARANTINE_DIRNAME = '.quarantine';

function sha256(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

function isDir(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Scan every project folder under `root`, parsing files by CONTENT id.
 * Returns one entry per directory; the `.quarantine` staging dir is skipped.
 * Pure w.r.t. the DB — filesystem read only.
 */
export function scanUnspaTree(root) {
	if (!existsSync(root)) return [];
	return readdirSync(root)
		// Dot-directories are internal maintenance state (.locks, .staging and
		// .quarantine), never project identities.
		.filter((name) => !name.startsWith('.') && isDir(join(root, name)))
		.sort()
		.map((dirName) => scanFolder(root, dirName));
}

function scanFolder(root, dirName) {
	const dir = join(root, dirName);
	const entries = readdirSync(dir);
	const folder = { dirName, path: dir, project: null, features: [], errors: [] };

	for (const file of entries.sort()) {
		const full = join(dir, file);
		if (file.endsWith(PROJECT_SUFFIX)) {
			const parsed = parseJson(full);
			if (parsed.error) {
				folder.errors.push({ file, kind: 'project-parse', message: parsed.error });
				continue;
			}
			const snap = parsed.value;
			const project = {
				file,
				id: snap?.project?.id ?? null,
				name: snap?.project?.name ?? null,
				format: snap?.format ?? null,
				featureIds: Array.isArray(snap?.project?.featureIds) ? snap.project.featureIds : [],
				sha256: sha256(parsed.raw)
			};
			// A folder should hold exactly one manifest; a second one is a finding.
			if (folder.project) folder.errors.push({ file, kind: 'multiple-manifests', message: `second manifest ${file}` });
			else folder.project = project;
		} else if (file.endsWith(FEATURE_SUFFIX)) {
			const parsed = parseJson(full);
			if (parsed.error) {
				folder.errors.push({ file, kind: 'feature-parse', message: parsed.error });
				continue;
			}
			folder.features.push({
				file,
				id: parsed.value?.feature?.id ?? null,
				sha256: sha256(parsed.raw)
			});
		}
	}
	return folder;
}

function parseJson(path) {
	try {
		const raw = readFileSync(path);
		return { value: JSON.parse(raw.toString('utf8')), raw };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Cross-reference the DB truth against the on-disk tree.
 *
 * @param {object} input
 * @param {string}   input.root        - data/unspa root (already scanned or scanned here)
 * @param {Iterable<string>} input.catalogIds - project_drafts.project_id values (Lyriks ids)
 * @param {Array<{localProjectId:string, backProjectId:string, backWorkspaceId?:string}>} input.links
 * @param {ReturnType<typeof scanUnspaTree>} [input.folders] - pre-scanned tree (else scanned from root)
 * @returns structured, JSON-serialisable findings.
 */
export function auditIntegrity({ root, catalogIds, links, folders }) {
	const scanned = folders ?? scanUnspaTree(root);
	const catalog = new Set(catalogIds);
	const linkByLocal = new Map(links.map((l) => [l.localProjectId, l]));
	const backIdToLocal = new Map(links.map((l) => [l.backProjectId, l.localProjectId]));
	const byDirName = new Map(scanned.map((f) => [f.dirName, f]));

	// Owner resolution: which Lyriks project a folder belongs to.
	// A folder named as a catalog id belongs to that project; a folder named as a
	// link's back id belongs to that link's local project. Everything else is an
	// orphan candidate — never claimed by directory naming alone.
	const foldersByOwner = new Map(); // localProjectId -> dirName[]
	const ownerByFolder = new Map(); // dirName -> localProjectId
	const orphanFolders = [];
	const folderNameIdMismatch = [];
	for (const folder of scanned) {
		let owner = null;
		if (catalog.has(folder.dirName)) owner = folder.dirName;
		else if (backIdToLocal.has(folder.dirName)) {
			const linkedLocalId = backIdToLocal.get(folder.dirName);
			// A legacy link without a catalog project cannot make an on-disk folder
			// live. Treat it as an orphan so it can be quarantined after the invalid
			// link row is removed.
			if (catalog.has(linkedLocalId)) owner = linkedLocalId;
		}

		if (folder.project && folder.project.id && folder.project.id !== folder.dirName) {
			folderNameIdMismatch.push({ dirName: folder.dirName, contentProjectId: folder.project.id });
		}

		if (!owner) {
			orphanFolders.push({
				dirName: folder.dirName,
				path: folder.path,
				contentProjectId: folder.project?.id ?? null,
				featureCount: folder.features.length,
				hasManifest: Boolean(folder.project)
			});
			continue;
		}
		if (!foldersByOwner.has(owner)) foldersByOwner.set(owner, []);
		foldersByOwner.get(owner).push(folder.dirName);
		ownerByFolder.set(folder.dirName, owner);
	}

	// Per-project view + twins (multiple folders mapped to one Lyriks project).
	const projects = [];
	const twins = [];
	for (const localProjectId of catalog) {
		const link = linkByLocal.get(localProjectId) ?? null;
		const expectedFolderKey = link ? link.backProjectId : localProjectId;
		const owned = foldersByOwner.get(localProjectId) ?? [];
		projects.push({
			localProjectId,
			backProjectId: link?.backProjectId ?? null,
			expectedFolderKey,
			linkStatus: link ? 'linked' : 'local-only',
			kernelFolderPresent: byDirName.has(expectedFolderKey),
			folders: owned
		});
		if (owned.length > 1) {
			twins.push({ localProjectId, canonicalKernelId: expectedFolderKey, folders: owned });
		}
	}

	// A valid link can legitimately have no kernel folder yet (for example, an
	// empty project). Without calling the back, absence on this local disk is an
	// observation, not evidence that the identity mapping is stale.
	const linksWithoutKernelFolder = links
		.filter((l) => catalog.has(l.localProjectId))
		.filter((l) => !byDirName.has(l.backProjectId))
		.map((l) => ({ localProjectId: l.localProjectId, backProjectId: l.backProjectId }));
	const linksWithoutCatalog = links
		.filter((l) => !catalog.has(l.localProjectId))
		.map((l) => ({ localProjectId: l.localProjectId, backProjectId: l.backProjectId }));

	// Manifest ↔ feature-file consistency, within each folder.
	const missingFeatureFiles = []; // in manifest.featureIds but no *.feature.json with that id
	const unlistedFeatureFiles = []; // *.feature.json present but not in manifest.featureIds
	const missingManifests = [];
	const parseErrors = [];
	for (const folder of scanned) {
		for (const err of folder.errors) parseErrors.push({ dirName: folder.dirName, ...err });
		if (!folder.project) {
			missingManifests.push({ dirName: folder.dirName, featureFiles: folder.features.length });
			continue;
		}
		const onDisk = new Set(folder.features.map((f) => f.id).filter(Boolean));
		const listed = new Set(folder.project.featureIds);
		for (const id of listed) if (!onDisk.has(id)) missingFeatureFiles.push({ dirName: folder.dirName, featureId: id });
		for (const id of onDisk) if (!listed.has(id)) unlistedFeatureFiles.push({ dirName: folder.dirName, featureId: id });
	}

	// Duplicate feature ids — within a folder and across twin folders belonging
	// to the SAME project. Feature ids are project-scoped, so reuse between two
	// unrelated projects is valid and must not be reported as corruption.
	const duplicateWithinFolder = [];
	const featureIdToFolders = new Map(); // localProjectId + featureId -> Set(dirName)
	for (const folder of scanned) {
		const seen = new Set();
		for (const feat of folder.features) {
			if (!feat.id) continue;
			if (seen.has(feat.id)) duplicateWithinFolder.push({ dirName: folder.dirName, featureId: feat.id });
			seen.add(feat.id);
			const owner = ownerByFolder.get(folder.dirName);
			if (!owner) continue;
			const key = `${owner}\u0000${feat.id}`;
			if (!featureIdToFolders.has(key)) featureIdToFolders.set(key, new Set());
			featureIdToFolders.get(key).add(folder.dirName);
		}
	}
	const duplicateAcrossFolders = [...featureIdToFolders.entries()]
		.filter(([, dirs]) => dirs.size > 1)
		.map(([key, dirs]) => {
			const [localProjectId, featureId] = key.split('\u0000');
			return { localProjectId, featureId, folders: [...dirs].sort() };
		});

	const findings = {
		linksWithoutCatalog,
		twins,
		orphanFolders,
		missingManifests,
		missingFeatureFiles,
		unlistedFeatureFiles,
		duplicateWithinFolder,
		duplicateAcrossFolders,
		folderNameIdMismatch,
		parseErrors
	};

	return {
		summary: {
			catalogProjects: catalog.size,
			links: links.length,
			folders: scanned.length,
			...Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length]))
		},
		projects,
		observations: { linksWithoutKernelFolder },
		findings,
		// Reconciliation-plan seed for MR 3: one entry per project that needs work.
		reconciliation: twins.map((t) => ({
			projectId: t.localProjectId,
			canonicalKernelId: t.canonicalKernelId,
			sources: t.folders,
			automaticActions: [],
			conflicts: [],
			quarantineActions: []
		}))
	};
}

/** Does the audit report contain any finding at all? (drives --strict exit code). */
export function hasFindings(report) {
	return Object.values(report.findings).some((list) => list.length > 0);
}

/**
 * Select quarantine candidates. STRICTLY the true orphans — folders owned by
 * neither a catalog id nor a back link. Twins are NEVER selected: they need
 * reconciliation (MR 3), not deletion. Canonicality is never inferred from a
 * directory name; a folder is a candidate only because the DB truth does not
 * claim it. Returns a plan; performs no writes.
 */
export function planQuarantine(report, folders) {
	const byDirName = new Map((folders ?? []).map((f) => [f.dirName, f]));
	const candidates = report.findings.orphanFolders.map((orphan) => {
		const folder = byDirName.get(orphan.dirName);
		const files = folder ? fileChecksums(folder) : [];
		return { dirName: orphan.dirName, path: orphan.path, files };
	});
	return { candidates };
}

function fileChecksums(folder) {
	const out = [];
	if (folder.project) out.push({ file: folder.project.file, sha256: folder.project.sha256 });
	for (const feat of folder.features) out.push({ file: feat.file, sha256: feat.sha256 });
	return out;
}
