/**
 * Project portability: a project as a portable, self-describing bundle that can
 * be downloaded, archived, diffed, and imported into another Lyriks install.
 *
 * Everything here is pure. The stores, the zip container, the clock and the hash
 * are all supplied from outside, which is what lets the whole round-trip be
 * tested without a database or a filesystem.
 */

export { bytesToBase64, base64ToBytes, isCanonicalBase64 } from './base64';
export {
	BUNDLE_FORMAT,
	BUNDLE_VERSION,
	FILE_DIR,
	FILE_INDEX_PATH,
	KERNEL_FEATURE_DIR,
	KERNEL_PROJECT_PATH,
	LEGACY_DOCUMENTS_PATH,
	MANIFEST_PATH,
	META_PATH,
	RESIDUE_PATH,
	REVISIONS_PATH,
	SECTION_DOCUMENTS_PATH,
	bundleFileName,
	isKernelFeaturePath,
	kernelFeaturePath,
	type BundleEntry,
	type BundleManifest
} from './bundle';
export { buildBundle, type BuildBundleInput } from './build-bundle';
export {
	buildFileIndex,
	externalizeFiles,
	inlineFiles,
	type ExternalFile,
	type FileIndex,
	type HashFn
} from './externalize-files';
export { readBundle, type BundleFiles, type ReadBundleResult } from './read-bundle';
export { rehomeSnapshot, type RehomeTarget } from './rehome-snapshot';
export { parseJsonBytes, stableJson, stableJsonBytes } from './stable-json';
export {
	describeProject,
	emptyRowSnapshot,
	type DomainRef,
	type KernelFeature,
	type ProjectKernelSnapshot,
	type ProjectMetaRow,
	type ProjectRowSnapshot,
	type ProjectSnapshot,
	type SectionDocumentRow
} from './snapshot';
