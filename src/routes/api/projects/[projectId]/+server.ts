import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Update the actual wizard project identity and portfolio metadata. A `stage`
 * field is accepted-and-ignored: the delivery stage is derived from the live
 * signals (see `deriveProjectStage`), never declared by a caller.
 */
export const PATCH: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'JSON body is required');

	const services = getServices();
	if (!(await services.listProjects.execute()).some((project) => project.id === projectId)) {
		error(404, 'Project not found');
	}
	const [draft, meta] = await Promise.all([
		services.loadFoundationDraft.loadIdentity(projectId),
		services.portfolio.getMeta(projectId)
	]);
	if ('domainId' in body && body.domainId !== null && typeof body.domainId !== 'string') {
		error(400, 'domainId must be a string or null');
	}
	if (
		typeof body.domainId === 'string' &&
		body.domainId.length > 0 &&
		!(await services.listDomains.execute()).some((domain) => domain.id === body.domainId)
	) {
		error(400, 'domainId does not identify an existing domain');
	}
	const allowedDomains = await callerAllowedDomains(event);
	if (
		allowedDomains !== null &&
		typeof body.domainId === 'string' &&
		body.domainId.length > 0 &&
		!allowedDomains.has(body.domainId)
	) {
		error(403, 'The target domain is outside your portfolio scope');
	}

	const result = await services.updateProject.execute({
		projectId,
		name: typeof body.name === 'string' ? body.name : draft.productName,
		description: typeof body.description === 'string' ? body.description : draft.brief,
		domainId:
			'domainId' in body
				? typeof body.domainId === 'string' && body.domainId.length > 0
					? body.domainId
					: null
				: meta?.domainId ?? null
	});
	if (!result.updated) error(400, result.reason ?? 'Project update failed');
	await services.scheduleBackSync(projectId);
	services.audit.record({
		action: 'project.update',
		actor: event.locals.session?.email ?? 'dev',
		target: projectId,
		outcome: 'success'
	});
	return json({ updated: true, projectId });
};

export const DELETE: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const body = (await event.request.json().catch(() => null)) as { confirmName?: unknown } | null;
	const confirmName = typeof body?.confirmName === 'string' ? body.confirmName : '';
	if (!confirmName) error(400, 'confirmName is required');
	const result = await getServices().deleteProject.executeConfirmed({
		projectId,
		confirmName,
		requesterEmail: event.locals.session?.email ?? null,
		enforceOwner: event.locals.authRequired
	});
	if (!result.deleted) {
		if (result.reason === 'not_found') error(404, 'Project not found');
		if (result.reason === 'not_owner') error(403, 'Only the project owner can delete it');
		error(400, 'confirmName does not match the project name');
	}
	getServices().audit.record({
		action: 'project.delete',
		actor: event.locals.session?.email ?? 'dev',
		target: projectId,
		outcome: 'success'
	});
	return json({ removed: true, projectId });
};
