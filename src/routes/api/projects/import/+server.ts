import { error, json } from '@sveltejs/kit';
import { ownNewProject, resolveOwningWorkspace } from '$lib/server/new-project-ownership.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import {
	currentRequestSession,
	currentRequestToken,
	runWithRequestContext
} from '$lib/server/request-context.server';
import { MAX_UPLOAD_BYTES, readUpload } from '$lib/server/import-upload.server';
import { creationRefused, refusedCreation } from '$lib/server/project-creation-refusal.server';
import type { RequestHandler } from './$types';

/**
 * Restore a project from a bundle produced by `GET /api/projects/<id>/export`.
 *
 *   POST /api/projects/import
 *     multipart/form-data: file=<bundle.zip> [mode] [name] [domainId] [workspaceId] [overwrite]
 *     or a raw zip body with the same options as query parameters.
 *
 * `mode=copy` (default) mints a fresh project id so a bundle can be imported
 * beside its original; `mode=restore` keeps the bundle's own id, for moving an
 * install or rolling a project back, and refuses to clobber an existing project
 * unless `overwrite=true` is passed explicitly.
 *
 * The upload is untrusted: it is size-capped here, structurally validated by the
 * archive codec and `readBundle`, and only then written. Body reading (both
 * shapes, and the body-limit vs malformed distinction) lives in
 * `$lib/server/import-upload.server`.
 */

export const POST: RequestHandler = async (event) => {
	const { locals, request, url } = event;

	const declared = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
		error(413, `Bundle is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
	}

	const { bytes, options } = await readUpload(event.request, url);
	if (bytes.byteLength === 0) error(400, 'No bundle was uploaded');
	// A chunked upload can exceed the declared length; check what actually arrived.
	if (bytes.byteLength > MAX_UPLOAD_BYTES) {
		error(413, `Bundle is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
	}

	const services = event.locals.services;
	let owningWorkspaceId: string | null = null;
	const imported = await refusedCreation(() => services.importProject.execute({ bytes, ...options.request }, {
		withTarget: async ({ projectId, existing }, write) => {
			if (existing) {
				await requireProjectAccess(event, projectId, 'write');
				const link = await services.backLinks.find(projectId);
				owningWorkspaceId = link?.backWorkspaceId ?? null;
				if (locals.authRequired && services.identity.multiUser && options.workspaceId &&
					options.workspaceId !== owningWorkspaceId) {
					error(403, 'A restore cannot move an existing project to another workspace.');
				}
			} else {
				owningWorkspaceId = await resolveOwningWorkspace(services, locals, options.workspaceId);
			}
			const importOwned = async () => {
				const imported = await write();
				if (!imported.ok) return imported;
				// An overwrite replaces content, never the existing team or owners.
				// New ownership is established before another importer gets this lock.
				if (!existing) await ownNewProject(services, locals, imported.projectId, 'project.import');
				await services.scheduleBackSync(imported.projectId);
				return imported;
			};
			return owningWorkspaceId
				? runWithRequestContext({
					token: currentRequestToken(),
					workspaceId: owningWorkspaceId,
					session: currentRequestSession() ?? { isAuthenticated: true }
				}, importOwned)
				: importOwned();
		}
	}));
	// A copy, or a restore of a project not held here, is one more project (EVO-001).
	if ('refused' in imported) creationRefused(imported.refused);
	const result = imported.created;
	if (!result.ok) error(400, result.error);

	services.audit.record({
		action: 'project.import',
		actor: locals.session?.email ?? 'dev',
		target: result.projectId,
		outcome: 'success',
		detail: `${options.request.mode} from ${bytes.byteLength} bytes`
	});

	return json({
		projectId: result.projectId,
		name: result.name,
		warnings: result.warnings,
		workspaceId: owningWorkspaceId
	});
};
