import { error, isHttpError, json } from '@sveltejs/kit';
import { parseSpecValidationActs } from '$application/specification/parse-spec-validation-acts';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { retrospecActor } from '$lib/server/retrospec-status.server';
import { applySpecValidationActs } from '$lib/server/spec-validation-acts.server';
import type { RequestHandler } from './$types';

/**
 * The validation of one project's Specification 360°.
 *
 *   POST `{ acts: [...] }`: validate or withdraw an element, remind a validator,
 *   validate the specification definitively, keep a code change in the
 *   specification or send it back. Answers `{ ok, revision }`; a refused act
 *   answers 400 with its reason.
 *
 * Required reviewers may give only their own approval with read access;
 * assignment, editing and final publication retain the project write gate.
 */
export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const parsed = parseSpecValidationActs(await event.request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.reason);
	let canWrite = true;
	try {
		await requireProjectAccess(event, projectId, 'write');
	} catch (cause) {
		if (!isHttpError(cause, 403)) throw cause;
		canWrite = false;
	}
	const actor = await retrospecActor(services, event.cookies);
	const { revision } = await applySpecValidationActs(services, projectId, parsed.acts, actor, event.request.headers.get('x-lyriks-client'), { canWrite });
	return json({ ok: true, revision });
};
