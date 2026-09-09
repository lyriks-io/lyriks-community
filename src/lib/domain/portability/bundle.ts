/**
 * The on-the-wire shape of a project bundle: the format marker, the version, the
 * entry paths and the manifest. One module so exporter and importer can never
 * drift on a path or a key.
 *
 * A bundle is an ordinary zip. Anyone can open it, read the JSON and diff two
 * exports — that transparency is the point: it is the customer's own
 * specification, not an opaque blob.
 */

import { slugifyName } from '$domain/catalog';

/** Distinguishes a Lyriks bundle from any other zip a user might upload. */
export const BUNDLE_FORMAT = 'lyriks.project-bundle';

/**
 * Bump only for a change an older importer could not read correctly. Import
 * accepts any version ≤ this one; a newer bundle is refused rather than
 * half-understood.
 */
export const BUNDLE_VERSION = 1;

export const MANIFEST_PATH = 'lyriks-bundle.json';
export const LEGACY_DOCUMENTS_PATH = 'project/legacy-documents.json';
export const SECTION_DOCUMENTS_PATH = 'project/section-documents.json';
export const RESIDUE_PATH = 'project/residue.json';
export const REVISIONS_PATH = 'project/revisions.json';
export const META_PATH = 'project/meta.json';
export const KERNEL_PROJECT_PATH = 'kernel/project.json';
export const KERNEL_FEATURE_DIR = 'kernel/features/';
export const FILE_INDEX_PATH = 'files/index.json';
export const FILE_DIR = 'files/';

/** What a bundle says about itself. Everything here is descriptive, not trusted. */
export interface BundleManifest {
	readonly format: typeof BUNDLE_FORMAT;
	readonly bundleVersion: number;
	readonly exportedAt: string;
	/** Platform version that wrote it — diagnostics only, never a gate. */
	readonly appVersion: string;
	readonly project: {
		readonly id: string;
		readonly name: string;
		readonly description: string;
	};
	readonly counts: {
		readonly features: number;
		readonly files: number;
		readonly sections: number;
	};
}

/** One file inside the bundle. */
export interface BundleEntry {
	readonly path: string;
	readonly bytes: Uint8Array;
}

/**
 * Filename for a download: slug + date, so a folder of bundles sorts and reads
 * sensibly. `.lyriks.zip` rather than a bare `.zip` — the double extension keeps
 * it double-clickable everywhere while still announcing what it is.
 */
export function bundleFileName(projectName: string, isoTimestamp: string): string {
	return `${slugifyName(projectName)}-${isoTimestamp.slice(0, 10)}.lyriks.zip`;
}

/** Path of a feature's entry inside the bundle. */
export function kernelFeaturePath(featureId: string): string {
	return `${KERNEL_FEATURE_DIR}${featureId}.json`;
}

/** Recognises the entries `readBundle` should treat as kernel features. */
export function isKernelFeaturePath(path: string): boolean {
	return path.startsWith(KERNEL_FEATURE_DIR) && path.endsWith('.json');
}
