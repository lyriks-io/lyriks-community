/**
 * Bundle entries → snapshot. The anti-corruption edge for untrusted input: a
 * bundle can arrive from another install, another version, or a text editor, so
 * nothing here trusts a shape it has not checked.
 *
 * Refusals are values, not exceptions — the import route turns them into a 400
 * with the reason, and a half-understood bundle never reaches a write.
 */

import {
	BUNDLE_FORMAT,
	BUNDLE_VERSION,
	FILE_INDEX_PATH,
	KERNEL_FEATURE_DIR,
	KERNEL_PROJECT_PATH,
	LEGACY_DOCUMENTS_PATH,
	MANIFEST_PATH,
	META_PATH,
	RESIDUE_PATH,
	REVISIONS_PATH,
	SECTION_DOCUMENTS_PATH,
	isKernelFeaturePath,
	type BundleManifest
} from './bundle';
import { inlineFiles, type FileIndex } from './externalize-files';
import { parseJsonBytes } from './stable-json';
import type {
	DomainRef,
	KernelFeature,
	ProjectMetaRow,
	ProjectSnapshot,
	SectionDocumentRow
} from './snapshot';

/** Path → bytes, as produced by the zip decoder. */
export type BundleFiles = ReadonlyMap<string, Uint8Array>;

export type ReadBundleResult =
	| { readonly ok: true; readonly manifest: BundleManifest; readonly snapshot: ProjectSnapshot; readonly warnings: readonly string[] }
	| { readonly ok: false; readonly error: string };

export function readBundle(files: BundleFiles): ReadBundleResult {
	const manifestBytes = files.get(MANIFEST_PATH);
	if (!manifestBytes) return { ok: false, error: `not a Lyriks bundle: ${MANIFEST_PATH} is missing` };

	const manifest = parseManifest(parseJsonBytes(manifestBytes));
	if (typeof manifest === 'string') return { ok: false, error: manifest };

	const warnings: string[] = [];
	const index = readFileIndex(files, warnings);
	const restore = <T>(value: T): T => inlineFiles(value, index, (path) => files.get(path));

	const legacyDocuments = restore(readRecord(files, LEGACY_DOCUMENTS_PATH, warnings));
	const residue = restore(readRecord(files, RESIDUE_PATH, warnings));
	const sectionDocuments = restore(readSectionDocuments(files, warnings));
	const revisions = readRevisions(files, warnings);
	const { meta, domain } = readMeta(files, warnings);

	const kernelProjectRaw = files.get(KERNEL_PROJECT_PATH);
	const kernelProject = kernelProjectRaw ? asRecord(parseJsonBytes(kernelProjectRaw)) : null;
	if (kernelProjectRaw && !kernelProject) warnings.push(`${KERNEL_PROJECT_PATH} is not a JSON object — ignored`);

	const featureEntries: KernelFeature[] = [];
	for (const path of [...files.keys()].sort()) {
		if (!isKernelFeaturePath(path)) continue;
		const feature = asRecord(parseJsonBytes(files.get(path)!));
		if (!feature) {
			warnings.push(`${path} is not a JSON object — ignored`);
			continue;
		}
		// The id inside the document wins over the filename: the kernel addresses
		// features by content id, and a renamed file must not fork a second record.
		const id = typeof feature.id === 'string' && feature.id ? feature.id : path.slice(KERNEL_FEATURE_DIR.length, -'.json'.length);
		featureEntries.push({ id, feature });
	}

	const snapshot: ProjectSnapshot = {
		projectId: manifest.project.id,
		name: manifest.project.name,
		description: manifest.project.description,
		rows: { legacyDocuments, sectionDocuments, residue, revisions, meta },
		kernel: {
			project: restore(kernelProject),
			features: restore(featureEntries)
		},
		domain
	};

	return { ok: true, manifest, snapshot, warnings };
}

/** Validate the manifest, or return the reason it was refused. */
function parseManifest(value: unknown): BundleManifest | string {
	const raw = asRecord(value);
	if (!raw) return `${MANIFEST_PATH} is not a JSON object`;
	if (raw.format !== BUNDLE_FORMAT) {
		return `not a Lyriks bundle (format is ${JSON.stringify(raw.format ?? null)})`;
	}
	const version = typeof raw.bundleVersion === 'number' ? raw.bundleVersion : 0;
	if (!Number.isInteger(version) || version < 1) return 'bundle version is missing or invalid';
	if (version > BUNDLE_VERSION) {
		return `bundle version ${version} was written by a newer Lyriks (this install reads up to ${BUNDLE_VERSION}) — upgrade before importing`;
	}
	const project = asRecord(raw.project);
	const id = typeof project?.id === 'string' ? project.id.trim() : '';
	if (!id) return 'bundle does not name a project id';
	return {
		format: BUNDLE_FORMAT,
		bundleVersion: version,
		exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
		appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
		project: {
			id,
			name: typeof project?.name === 'string' && project.name.trim() ? project.name : id,
			description: typeof project?.description === 'string' ? project.description : ''
		},
		counts: {
			features: countOf(raw.counts, 'features'),
			files: countOf(raw.counts, 'files'),
			sections: countOf(raw.counts, 'sections')
		}
	};
}

function readFileIndex(files: BundleFiles, warnings: string[]): FileIndex {
	const bytes = files.get(FILE_INDEX_PATH);
	if (!bytes) return {};
	const raw = asRecord(parseJsonBytes(bytes));
	if (!raw) {
		warnings.push(`${FILE_INDEX_PATH} is not a JSON object — uploaded files will stay unresolved`);
		return {};
	}
	const index: Record<string, { path: string; prefix: string }> = {};
	for (const [token, entry] of Object.entries(raw)) {
		const row = asRecord(entry);
		const path = typeof row?.path === 'string' ? row.path : '';
		const prefix = typeof row?.prefix === 'string' ? row.prefix : '';
		if (!path || !prefix.startsWith('data:')) {
			warnings.push(`file index entry ${token} is malformed — ignored`);
			continue;
		}
		if (!files.has(path)) {
			warnings.push(`file ${path} referenced by the index is missing from the bundle`);
			continue;
		}
		index[token] = { path, prefix };
	}
	return index;
}

function readRecord(files: BundleFiles, path: string, warnings: string[]): Record<string, unknown> {
	const bytes = files.get(path);
	if (!bytes) return {};
	const raw = asRecord(parseJsonBytes(bytes));
	if (!raw) {
		warnings.push(`${path} is not a JSON object — ignored`);
		return {};
	}
	return raw;
}

function readSectionDocuments(files: BundleFiles, warnings: string[]): Record<string, SectionDocumentRow> {
	const raw = readRecord(files, SECTION_DOCUMENTS_PATH, warnings);
	const out: Record<string, SectionDocumentRow> = {};
	for (const [section, entry] of Object.entries(raw)) {
		const row = asRecord(entry);
		if (!row || !('document' in row)) {
			warnings.push(`section "${section}" is malformed — ignored`);
			continue;
		}
		out[section] = {
			schemaVersion: typeof row.schemaVersion === 'number' ? row.schemaVersion : 1,
			document: row.document,
			revision: typeof row.revision === 'number' ? row.revision : 0
		};
	}
	return out;
}

function readRevisions(files: BundleFiles, warnings: string[]): Record<string, number> {
	const raw = readRecord(files, REVISIONS_PATH, warnings);
	const out: Record<string, number> = {};
	for (const [section, value] of Object.entries(raw)) {
		if (typeof value === 'number' && Number.isInteger(value) && value >= 0) out[section] = value;
	}
	return out;
}

function readMeta(
	files: BundleFiles,
	warnings: string[]
): { meta: ProjectMetaRow | null; domain: DomainRef | null } {
	const raw = readRecord(files, META_PATH, warnings);
	const metaRow = asRecord(raw.meta);
	const domainRow = asRecord(raw.domain);
	const meta: ProjectMetaRow | null = metaRow
		? {
				domainId: typeof metaRow.domainId === 'string' ? metaRow.domainId : null,
				shippedAt: typeof metaRow.shippedAt === 'string' ? metaRow.shippedAt : null
			}
		: null;
	const domain: DomainRef | null =
		domainRow && typeof domainRow.id === 'string' && typeof domainRow.name === 'string'
			? {
					id: domainRow.id,
					name: domainRow.name,
					description: typeof domainRow.description === 'string' ? domainRow.description : '',
					icon: typeof domainRow.icon === 'string' ? domainRow.icon : 'lucide:building-2'
				}
			: null;
	return { meta, domain };
}

function countOf(counts: unknown, key: string): number {
	const raw = asRecord(counts)?.[key];
	return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
