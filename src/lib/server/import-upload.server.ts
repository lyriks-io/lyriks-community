import { error } from '@sveltejs/kit';
import type { ImportProjectRequest } from '$application/use-cases/portability/import-project';

/**
 * Hard ceiling on a bundle upload, before anything is decompressed. The shipped
 * image sets adapter-node's BODY_SIZE_LIMIT to the same figure (see Dockerfile):
 * the runtime cap must not undercut this one, or the route never sees the bytes.
 */
export const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

export interface UploadOptions {
	readonly workspaceId: string | null;
	readonly request: Omit<ImportProjectRequest, 'bytes'>;
}

/**
 * Accept both shapes a client may send: a browser form post (multipart, from the
 * import drop-zone) and a raw zip body (curl, scripts, the appliance CLI).
 */
export async function readUpload(
	request: Request,
	url: URL
): Promise<{ bytes: Uint8Array; options: UploadOptions }> {
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('multipart/form-data')) {
		const form = await request
			.formData()
			.catch((cause: unknown) => rejectUpload(cause, 'Malformed multipart upload'));
		const file = form.get('file');
		if (!(file instanceof File)) error(400, 'A "file" part is required');
		const bytes = new Uint8Array(await file.arrayBuffer());
		return {
			bytes,
			options: readOptions((key) => stringOf(form.get(key)) ?? url.searchParams.get(key))
		};
	}

	const raw = await request
		.arrayBuffer()
		.catch((cause: unknown) => rejectUpload(cause, 'Unreadable upload body'));
	return { bytes: new Uint8Array(raw), options: readOptions((key) => url.searchParams.get(key)) };
}

/**
 * A body read fails for two very different reasons, and telling them apart
 * decides the fix. Either the runtime refused the body outright (adapter-node's
 * BODY_SIZE_LIMIT errors the request stream with a 413 instead of answering at
 * the door, so it surfaces here, mid-parse) or the bytes are genuinely not what
 * the content-type claims. Reporting the first as the second sent people hunting
 * a client bug when the cure was a server-side limit.
 */
function rejectUpload(cause: unknown, malformedMessage: string): never {
	const status = (cause as { status?: unknown } | null)?.status;
	if (status === 413) {
		const detail = cause instanceof Error && cause.message ? ` (${cause.message.replace(/\.$/, '')})` : '';
		error(
			413,
			`Upload refused by the server body limit${detail}. Raise BODY_SIZE_LIMIT on the platform container.`
		);
	}
	error(400, malformedMessage);
}

function readOptions(get: (key: string) => string | null): UploadOptions {
	const mode = get('mode') === 'restore' ? 'restore' : 'copy';
	const name = get('name')?.trim();
	const rawDomain = get('domainId');
	return {
		workspaceId: get('workspaceId') || null,
		request: {
			mode,
			overwrite: get('overwrite') === 'true',
			...(name ? { name } : {}),
			// Absent means "keep the bundle's domain"; an explicit empty value means
			// "file it nowhere": two different intents, so only pass the key when sent.
			...(rawDomain === null ? {} : { domainId: rawDomain || null })
		}
	};
}

function stringOf(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' ? value : null;
}
