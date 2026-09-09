import { error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { REVISION_HEADER } from '$lib/shared/draft-revision';

export { REVISION_HEADER };

/** The client's expected revision from the request header, or null if absent. */
export function expectedRevision(request: Request): number | null {
	const raw = request.headers.get(REVISION_HEADER);
	if (raw === null || raw.trim() === '') return null;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) error(400, `${REVISION_HEADER} must be a non-negative integer`);
	return n;
}

/**
 * Optimistic-lock gate for a section save: bump the revision iff the client's
 * expected one is current. Throws 409 on a stale edit (concurrent writer);
 * returns the new revision to echo back to the client. Call AFTER the access
 * guard and BEFORE persisting, so a stale write never reaches the store.
 */
export async function commitRevision(
	projectId: string,
	section: string,
	request: Request
): Promise<number> {
	const next = await getServices().draftLock.commit(projectId, section, expectedRevision(request));
	if (next === null) {
		error(409, 'This section was changed by someone else. Reload to get the latest version.');
	}
	return next;
}
