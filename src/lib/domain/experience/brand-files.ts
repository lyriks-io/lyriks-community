/**
 * Pure helpers for the files uploaded into the Brand & Design section.
 *
 * Uploaded files live inline in the draft as base64 data URLs (see `brand.ts`).
 * This module gives every such file a *stable ref* so it can be enumerated and
 * fetched one at a time — both by the in-app viewer and by the download
 * endpoint the Lyriks MCP calls (`GET /api/files`). Framework-free: no IO, no
 * base64 decoding (that is an edge concern) — just parsing and locating.
 */
import type { BrandFileRef, ProjectBrand, BrandSection } from './brand';

/** One uploaded file located inside the brand tree, with a stable ref. */
export interface BrandFileEntry {
	/** Stable locator, e.g. `attachments/logo/att_12ab34cd` — see `listBrandFiles`. */
	ref: string;
	name: string;
	dataUrl: string;
	/** Byte size (derived from the data URL when the source ref carries none). */
	size: number;
}

/** How a file should be rendered — drives the viewer and the icon fallback. */
export type BrandFileKind = 'image' | 'pdf' | 'markdown' | 'text' | 'other';

/** MIME + base64 payload split out of a `data:<mime>;base64,<payload>` URL. */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
	const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
	if (!m) return null;
	return { mime: m[1] || 'application/octet-stream', base64: m[3] ?? '' };
}

/** Byte length carried by a base64 data URL (0 when it is not base64). */
export function dataUrlSize(dataUrl: string): number {
	const parsed = parseDataUrl(dataUrl);
	if (!parsed) return 0;
	const b64 = parsed.base64.replace(/=+$/, '');
	return Math.floor((b64.length * 3) / 4);
}

/** Lower-case extension without the dot, e.g. `pdf`; empty when none. */
export function fileExtension(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const TEXT_EXT = new Set([
	'txt', 'text', 'log', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'css',
	'js', 'ts', 'jsx', 'tsx', 'svelte', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'sh', 'sql', 'toml', 'ini', 'env'
]);

/** Classify a file for rendering from its name and (optional) MIME type. */
export function fileKind(name: string, mime = ''): BrandFileKind {
	const ext = fileExtension(name);
	if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'].includes(ext)) {
		return 'image';
	}
	if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
	if (mime === 'text/markdown' || ['md', 'markdown', 'mdx'].includes(ext)) return 'markdown';
	if (mime.startsWith('text/') || TEXT_EXT.has(ext)) return 'text';
	return 'other';
}

function entry(ref: string, file: BrandFileRef, size?: number): BrandFileEntry {
	return { ref, name: file.name, dataUrl: file.dataUrl, size: size ?? dataUrlSize(file.dataUrl) };
}

/**
 * Enumerate every uploaded file in the brand, each with a stable `ref`:
 *   attachments/<section>/<attachmentId>
 *   identity/brandbook
 *   logo/<variantId>
 *   pages/<pageId>/<index>
 * Files with an empty data URL are skipped.
 */
export function listBrandFiles(brand: ProjectBrand): BrandFileEntry[] {
	const out: BrandFileEntry[] = [];
	const push = (e: BrandFileEntry) => {
		if (e.dataUrl) out.push(e);
	};

	for (const [section, list] of Object.entries(brand.attachments ?? {})) {
		for (const att of list ?? []) {
			push(entry(`attachments/${section as BrandSection}/${att.id}`, att, att.size));
		}
	}
	if (brand.identity.brandbookFile) push(entry('identity/brandbook', brand.identity.brandbookFile));
	for (const v of brand.logo.variants) {
		if (v.file) push(entry(`logo/${v.id}`, v.file));
	}
	for (const pg of brand.pages) {
		pg.screenshotRefs.forEach((shot, i) => push(entry(`pages/${pg.id}/${i}`, shot)));
	}
	return out;
}

/** Resolve a ref produced by `listBrandFiles` back to its file, or null. */
export function findBrandFile(brand: ProjectBrand, ref: string): BrandFileEntry | null {
	return listBrandFiles(brand).find((e) => e.ref === ref) ?? null;
}
