/**
 * Snapshot → bundle entries. Pure: no IO, no clock, no crypto — the timestamp,
 * the app version and the hash function are all inputs, which is what makes the
 * result reproducible and the round-trip testable without a database.
 */

import {
	FILE_INDEX_PATH,
	KERNEL_PROJECT_PATH,
	LEGACY_DOCUMENTS_PATH,
	MANIFEST_PATH,
	META_PATH,
	RESIDUE_PATH,
	REVISIONS_PATH,
	SECTION_DOCUMENTS_PATH,
	BUNDLE_FORMAT,
	BUNDLE_VERSION,
	kernelFeaturePath,
	type BundleEntry,
	type BundleManifest
} from './bundle';
import { buildFileIndex, externalizeFiles, type HashFn } from './externalize-files';
import { stableJsonBytes } from './stable-json';
import type { ProjectSnapshot } from './snapshot';

export interface BuildBundleInput {
	readonly snapshot: ProjectSnapshot;
	readonly exportedAt: string;
	readonly appVersion: string;
	readonly hash: HashFn;
}

/** A feature id has to be a single safe path segment — it names a zip entry. */
const UNSAFE_ID = /[/\\]|^\.\.?$/;

export function buildBundle(input: BuildBundleInput): readonly BundleEntry[] {
	const { snapshot } = input;

	// Externalize once over EVERYTHING, so a logo referenced from both a section
	// document and a kernel shell is stored a single time.
	const { value: documents, files } = externalizeFiles(
		{
			legacyDocuments: snapshot.rows.legacyDocuments,
			sectionDocuments: snapshot.rows.sectionDocuments,
			residue: snapshot.rows.residue,
			kernelProject: snapshot.kernel.project,
			kernelFeatures: snapshot.kernel.features
		},
		input.hash
	);

	const manifest: BundleManifest = {
		format: BUNDLE_FORMAT,
		bundleVersion: BUNDLE_VERSION,
		exportedAt: input.exportedAt,
		appVersion: input.appVersion,
		project: {
			id: snapshot.projectId,
			name: snapshot.name,
			description: snapshot.description
		},
		counts: {
			features: snapshot.kernel.features.length,
			files: files.length,
			sections: Object.keys(snapshot.rows.sectionDocuments).length
		}
	};

	const entries: BundleEntry[] = [
		{ path: MANIFEST_PATH, bytes: stableJsonBytes(manifest) },
		{ path: LEGACY_DOCUMENTS_PATH, bytes: stableJsonBytes(documents.legacyDocuments) },
		{ path: SECTION_DOCUMENTS_PATH, bytes: stableJsonBytes(documents.sectionDocuments) },
		{ path: RESIDUE_PATH, bytes: stableJsonBytes(documents.residue) },
		{ path: REVISIONS_PATH, bytes: stableJsonBytes(snapshot.rows.revisions) },
		{
			path: META_PATH,
			bytes: stableJsonBytes({ meta: snapshot.rows.meta, domain: snapshot.domain })
		}
	];

	if (documents.kernelProject) {
		entries.push({ path: KERNEL_PROJECT_PATH, bytes: stableJsonBytes(documents.kernelProject) });
	}
	// Sorted by id: the kernel folder is a set of files, not an ordered list (the
	// store itself reads it with `readdir().sort()`), so anything else would make
	// two exports of one project differ on the order the rows came back in.
	const features = [...documents.kernelFeatures].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0
	);
	// One entry per id, or the container would hold two files under one path and
	// the reader would keep whichever it decoded last. Resolving twins is the
	// caller's job (see `chooseKernelFeatures`); packing only refuses to guess.
	const packed = new Set<string>();
	for (const { id, feature } of features) {
		if (!id || UNSAFE_ID.test(id)) throw new Error(`unsafe feature id in kernel: ${JSON.stringify(id)}`);
		if (packed.has(id)) throw new Error(`two kernel features share the id ${JSON.stringify(id)}`);
		packed.add(id);
		entries.push({ path: kernelFeaturePath(id), bytes: stableJsonBytes(feature) });
	}

	if (files.length > 0) {
		entries.push({ path: FILE_INDEX_PATH, bytes: stableJsonBytes(buildFileIndex(files)) });
		for (const file of files) entries.push({ path: file.path, bytes: file.bytes });
	}

	return entries;
}
