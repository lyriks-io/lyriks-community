import { error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Download a whole project as one portable archive — every section document,
 * the behavior kernel, and the files uploaded into them.
 *
 * `GET /api/projects/<id>/export  ->  <slug>-<date>.lyriks.zip`
 *
 * The bundle is the customer's own specification in plain JSON inside an
 * ordinary zip: openable, diffable, and importable into another install (see
 * `POST /api/projects/import`). It deliberately carries no install-local
 * material — no back link, no licence, no credentials.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	// The bundle is the whole specification taken home. A reader sees the
	// project on screen; taking a copy of it is reserved to the people who
	// author it (designer and above), the same line the Team dialog draws.
	await requireProjectAccess(event, projectId, 'write');

	const services = getServices();
	const bundle = await services.exportProject.execute(projectId);
	if (!bundle) error(404, 'Project not found');

	services.audit.record({
		action: 'project.export',
		actor: event.locals.session?.email ?? 'dev',
		target: projectId,
		outcome: 'success',
		detail: [`${bundle.bytes.byteLength} bytes`, ...bundle.warnings].join(' · ')
	});

	// Re-wrapped into an ArrayBuffer-backed array: a `Uint8Array<ArrayBufferLike>`
	// is not a `BodyInit` under the DOM types SvelteKit compiles against, because
	// a SharedArrayBuffer-backed view cannot be a response body.
	const body = new Uint8Array(bundle.bytes.byteLength);
	body.set(bundle.bytes);

	return new Response(body, {
		headers: {
			'content-type': 'application/zip',
			// The filename is a slug of the product name, so it is already safe to
			// place in the header unquoted-ish; quote it anyway for the date separator.
			'content-disposition': `attachment; filename="${bundle.fileName}"`,
			'content-length': String(bundle.bytes.byteLength),
			// A bundle is a point-in-time copy; never let a proxy serve a stale one.
			'cache-control': 'no-store'
		}
	});
};
