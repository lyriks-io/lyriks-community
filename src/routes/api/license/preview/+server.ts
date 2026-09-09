import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

/**
 * Dry-run a licence key: what would this install get if this key were
 * activated? Same checks as the real activation, nothing stored.
 *
 * Swapping a licence used to be a one-way door, so an operator handed a
 * renewal had to destroy the working key to find out what the new one grants.
 *
 *   POST /api/license/preview { key } → { ok, view } | { ok: false, reason, view }
 *
 * Admin-only like every other licence mutation, even though it mutates
 * nothing: the answer describes an entitlement, and this endpoint is also an
 * oracle for whether a given key is valid here.
 */
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const body = (await event.request.json().catch(() => ({}))) as { key?: unknown };
	const key = typeof body.key === 'string' ? body.key : '';
	const result = await getServices().previewLicense.execute(key);
	return json(result, { status: result.ok ? 200 : 400 });
};
