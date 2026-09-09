/**
 * Move embedded binary out of a bundle's JSON — and back in on import.
 *
 * Uploaded brand assets live as base64 `data:` URLs *inside* section documents
 * (see `brand-files.ts` and `/api/files`), so a naive export would produce one
 * unopenable multi-megabyte JSON of base64 — which also happens to be the one
 * thing deflate cannot compress. Externalizing decodes each payload into its own
 * zip entry: smaller, browsable, and deduplicated (entries are content-addressed,
 * so the same logo referenced five times is stored once).
 *
 * The walk is shape-agnostic on purpose. It knows nothing about which section
 * holds files, so a section that gains uploads later is carried with no change
 * here — the alternative, a per-section list of file-bearing fields, is exactly
 * the kind of duplicated vocabulary that silently rots.
 */

import { base64ToBytes, bytesToBase64, isCanonicalBase64 } from './base64';
import { FILE_DIR } from './bundle';

/** Marks an externalized payload in the JSON. Unresolvable tokens are left alone. */
const TOKEN_PREFIX = 'lyriks-bundle:file:';

/**
 * Below this, a payload stays inline: a favicon-sized data URL is cheaper as
 * JSON text than as a zip entry with its own 100-byte header pair.
 */
const MIN_EXTERNALIZE_BYTES = 256;

/** `data:<mime>;base64,<payload>` — the only form worth externalizing. */
const BASE64_DATA_URL = /^(data:[^,]*;base64,)([A-Za-z0-9+/=]+)$/;

export interface ExternalFile {
	readonly token: string;
	/** Entry path inside the bundle. */
	readonly path: string;
	/** The `data:…;base64,` head, kept verbatim so re-inlining is byte-exact. */
	readonly prefix: string;
	readonly bytes: Uint8Array;
}

/** `files/index.json`: what each token needs to become a data URL again. */
export type FileIndex = Readonly<Record<string, { readonly path: string; readonly prefix: string }>>;

export interface ExternalizeResult<T> {
	readonly value: T;
	readonly files: readonly ExternalFile[];
}

/** Hashes bytes to a stable hex digest. Injected — the domain owns no crypto. */
export type HashFn = (bytes: Uint8Array) => string;

/**
 * Replace every sufficiently large base64 data URL with a token, returning the
 * rewritten value and the files to store beside it.
 *
 * A payload whose base64 is not canonical is left inline: re-encoding it would
 * not reproduce the source string, and a copy that is not byte-exact is not a
 * copy. Same for anything that fails to decode.
 */
export function externalizeFiles<T>(value: T, hash: HashFn): ExternalizeResult<T> {
	const files = new Map<string, ExternalFile>();

	const walk = (node: unknown): unknown => {
		if (typeof node === 'string') {
			const file = toExternalFile(node, hash);
			if (!file) return node;
			if (!files.has(file.token)) files.set(file.token, file);
			return file.token;
		}
		if (Array.isArray(node)) return node.map(walk);
		if (node && typeof node === 'object') {
			return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
		}
		return node;
	};

	return {
		value: walk(value) as T,
		files: [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
	};
}

/** Turn tokens back into data URLs. Unknown tokens are left verbatim. */
export function inlineFiles<T>(value: T, index: FileIndex, bytesOf: (path: string) => Uint8Array | undefined): T {
	const walk = (node: unknown): unknown => {
		if (typeof node === 'string') {
			if (!node.startsWith(TOKEN_PREFIX)) return node;
			const entry = index[node];
			if (!entry) return node;
			const bytes = bytesOf(entry.path);
			if (!bytes) return node;
			return `${entry.prefix}${bytesToBase64(bytes)}`;
		}
		if (Array.isArray(node)) return node.map(walk);
		if (node && typeof node === 'object') {
			return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
		}
		return node;
	};
	return walk(value) as T;
}

/** The `files/index.json` document for a set of externalized files. */
export function buildFileIndex(files: readonly ExternalFile[]): FileIndex {
	return Object.fromEntries(files.map((f) => [f.token, { path: f.path, prefix: f.prefix }]));
}

function toExternalFile(text: string, hash: HashFn): ExternalFile | null {
	const match = BASE64_DATA_URL.exec(text);
	if (!match) return null;
	const [, prefix, payload] = match;
	// Cheap length gate before the (relatively expensive) decode.
	if ((payload.length / 4) * 3 < MIN_EXTERNALIZE_BYTES) return null;
	if (!isCanonicalBase64(payload)) return null;
	const bytes = base64ToBytes(payload);
	if (!bytes || bytes.length < MIN_EXTERNALIZE_BYTES) return null;
	// Hash covers the prefix too: the same bytes served as `image/png` and as
	// `application/octet-stream` are two distinct payloads and must not collapse.
	const digest = hash(new TextEncoder().encode(`${prefix}\n${payload}`));
	return {
		token: `${TOKEN_PREFIX}${digest}`,
		path: `${FILE_DIR}${digest}${extensionFor(prefix)}`,
		prefix,
		bytes
	};
}

const EXTENSIONS: Readonly<Record<string, string>> = {
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/gif': '.gif',
	'image/webp': '.webp',
	'image/avif': '.avif',
	'image/svg+xml': '.svg',
	'application/pdf': '.pdf',
	'font/woff2': '.woff2',
	'text/plain': '.txt',
	'text/csv': '.csv',
	'application/json': '.json'
};

/** A browsable extension for the zip entry — cosmetic; the prefix is the truth. */
function extensionFor(prefix: string): string {
	const mime = prefix.slice('data:'.length).split(';')[0].toLowerCase();
	return EXTENSIONS[mime] ?? '.bin';
}
