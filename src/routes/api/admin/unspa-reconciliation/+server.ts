import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireAdmin } from '$lib/server/admin.server';
import type { RequestHandler } from './$types';

interface ReconciliationRequest {
	projectId?: unknown;
	canonicalKernelId?: unknown;
	sourceFolderKeys?: unknown;
	apply?: unknown;
}

const safeId = (value: unknown): string => {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.length > 255 ||
		value === '.' ||
		value === '..' ||
		/[\\/\0]/.test(value)
	) {
		error(400, 'project and folder ids must be safe filesystem identifiers');
	}
	return value;
};

/**
 * Preview or execute one deterministic Unspa twin-folder reconciliation.
 * The caller supplies the exact folders from the read-only integrity audit;
 * the use-case re-reads their content, refuses conflicts, stages atomically and
 * quarantines losing folders. It never guesses a winner from timestamps.
 */
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const body = (await event.request.json().catch(() => null)) as ReconciliationRequest | null;
	if (!body) error(400, 'JSON body is required');
	const projectId = safeId(body.projectId);
	const canonicalKernelId = safeId(body.canonicalKernelId);
	const sourceFolderKeys = Array.isArray(body.sourceFolderKeys)
		? [...new Set(body.sourceFolderKeys.map(safeId))]
		: [];
	if (sourceFolderKeys.length < 2) error(400, 'at least two source folders are required');
	if (!sourceFolderKeys.includes(canonicalKernelId)) {
		error(400, 'canonicalKernelId must be one of sourceFolderKeys');
	}

	const result = await getServices().reconcileProject.execute({
		projectId,
		canonicalKernelId,
		sourceFolderKeys,
		apply: body.apply === true
	});
	getServices().audit.record({
		action: 'unspa.reconcile',
		actor: event.locals.session?.email ?? 'admin',
		target: projectId,
		outcome: result.status === 'conflicts' ? 'failure' : 'success',
		detail: `${result.status}; applied=${result.applied}; sources=${sourceFolderKeys.join(',')}`
	});
	// Do not echo complete feature snapshots through an admin maintenance API.
	// The plan's ids, hashes and action list are enough to review it safely.
	const { mergedFeatures, ...review } = result;
	return json(
		{ ...review, mergedFeatureCount: mergedFeatures.length },
		{ status: result.status === 'conflicts' ? 409 : 200 }
	);
};
