import { error, isHttpError, json } from '@sveltejs/kit';
import { parseSpecValidationActs } from '$application/specification/parse-spec-validation-acts';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { retrospecActor } from '$lib/server/retrospec-status.server';
import { applySpecValidationActs } from '$lib/server/spec-validation-acts.server';
import { readValidationRoster } from '$lib/server/validation-roster.server';
import { requireLeadChooser } from '$lib/server/validation-lead.server';
import type { RequestHandler } from './$types';

/**
 * The validation of one project's Specification 360°.
 *
 *   POST `{ acts: [...] }`: validate or withdraw an element, remind a validator,
 *   validate the specification definitively, keep a code change in the
 *   specification or send it back, choose who leads the validation. Answers
 *   `{ ok, revision }`; a refused act answers 400 with its reason.
 *
 * Required reviewers may give only their own approval with read access;
 * assignment, editing and final publication retain the project write gate.
 */
/**
 * GET: the people who can open the project, who leads its validation and who validates it (criteria bfe225b4 of
 * feat-42, f09fe8ea of feat-135): the Team step of the creation dialog reads it. `validators` is null while the project
 * names none, everyone then counting by their jobs.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	return json(await readValidationRoster(services, projectId));
};

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const parsed = parseSpecValidationActs(await event.request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.reason);
	// Who leads the validation is chosen by whoever administers the project (rule 34909b53 of feat-135).
	// Who validates it too (rule 14203f70 and c156c46c of feat-135).
	if (parsed.acts.some((act) => act.op === 'set_lead')) await requireLeadChooser(services, projectId);
	if (parsed.acts.some((act) => act.op === 'set_validator')) await requireLeadChooser(services, projectId, 'who validates');
	let canWrite = true;
	try {
		await requireProjectAccess(event, projectId, 'write');
	} catch (cause) {
		if (!isHttpError(cause, 403)) throw cause;
		canWrite = false;
	}
	const actor = await retrospecActor(services, projectId, event.cookies);
	const { revision } = await applySpecValidationActs(services, projectId, parsed.acts, actor, event.request.headers.get('x-lyriks-client'), { canWrite });
	return json({ ok: true, revision });
};
