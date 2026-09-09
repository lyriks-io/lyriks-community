import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { listBrandFiles, findBrandFile, parseDataUrl, fileKind } from '$domain/experience';
import type { RequestHandler } from './$types';

/**
 * Download surface for uploaded files, so the Lyriks MCP (and the browser) can
 * fetch a single file's bytes instead of parsing the multi-megabyte data URLs
 * embedded in `GET /api/sections`. Files live inline in the section draft (see
 * `brand-files.ts`); this route enumerates them by stable ref and streams the
 * decoded bytes with the right Content-Type/filename.
 *
 *   GET /api/files?projectId=<id>&section=experience
 *       -> { section, projectId, files: [{ ref, name, mime, kind, size, downloadUrl }] }
 *   GET /api/files?projectId=<id>&section=experience&ref=<ref>[&disposition=inline]
 *       -> the raw file bytes
 *
 * Only `experience` (Brand & Design) holds uploads today; the switch is the
 * single place to extend when other sections gain files.
 */

/** MIME types safe to render `inline` in the app origin (no script surface). */
const INLINE_SAFE = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/bmp',
	'application/pdf',
	'text/plain'
]);

export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	const section = url.searchParams.get('section') ?? 'experience';
	const ref = url.searchParams.get('ref');
	if (!projectId) error(400, 'projectId is required');
	if (section !== 'experience') error(400, `section "${section}" has no uploaded files`);
	await requireProjectAccess(event, projectId, 'read');

	const { brand } = await getServices().loadExperienceDraft.execute(projectId);

	// No ref → metadata-only manifest (bytes stay out of the listing).
	if (!ref) {
		const files = listBrandFiles(brand).map((f) => {
			const mime = parseDataUrl(f.dataUrl)?.mime ?? 'application/octet-stream';
			return {
				ref: f.ref,
				name: f.name,
				mime,
				kind: fileKind(f.name, mime),
				size: f.size,
				downloadUrl: `/api/files?projectId=${encodeURIComponent(projectId)}&section=experience&ref=${encodeURIComponent(f.ref)}`
			};
		});
		return json({ section, projectId, files });
	}

	const entry = findBrandFile(brand, ref);
	if (!entry) error(404, `no file for ref "${ref}"`);
	const parsed = parseDataUrl(entry.dataUrl);
	if (!parsed) error(422, 'file is not a decodable data URL');

	const bytes = Buffer.from(parsed.base64, 'base64');
	// `inline` renders in the app origin, so only non-scriptable types may use it.
	// text/html and image/svg+xml carry script, so they are always forced to
	// download — a file's MIME is attacker-controlled (see brand-files.ts).
	const wantsInline = url.searchParams.get('disposition') === 'inline';
	const inline = wantsInline && INLINE_SAFE.has(parsed.mime.toLowerCase());
	// Strip quotes, backslashes and control chars (incl. CR/LF) so a crafted file
	// name cannot break out of the header value or inject response headers.
	const filename = entry.name.replace(/["\\\x00-\x1f\x7f]/g, '_') || 'download';
	return new Response(bytes, {
		headers: {
			'content-type': parsed.mime,
			'content-length': String(bytes.length),
			'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
			'cache-control': 'private, no-store'
		}
	});
};
