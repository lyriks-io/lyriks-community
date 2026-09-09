import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { ownNewProject, resolveOwningWorkspace } from '$lib/server/new-project-ownership.server';
import {
	currentRequestSession,
	currentRequestToken,
	runWithRequestContext
} from '$lib/server/request-context.server';
import { MAX_UPLOAD_BYTES, readUpload } from '$lib/server/import-upload.server';
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

	const services = getServices();
	const owningWorkspaceId = await resolveOwningWorkspace(locals, options.workspaceId);

	const importOwned = async () => {
		const result = await services.importProject.execute({ bytes, ...options.request });
		if (!result.ok) error(400, result.error);
		// Same ownership invariant as creation: auth-on, the importer must own the
		// project from the moment it exists or per-project scope hides it from them.
		await ownNewProject(locals, result.projectId, 'project.import');
		await services.scheduleBackSync(result.projectId);
		return result;
	};

	const result = owningWorkspaceId
		? await runWithRequestContext(
				{
					token: currentRequestToken(),
					workspaceId: owningWorkspaceId,
					session: currentRequestSession() ?? { isAuthenticated: true }
				},
				importOwned
			)
		: await importOwned();

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
