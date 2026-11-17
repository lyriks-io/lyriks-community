import { error, json } from '@sveltejs/kit';
import { parseSpecEdit } from '$application/specification/parse-spec-edit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { retrospecActor } from '$lib/server/retrospec-status.server';
import { applySpecEdit } from '$lib/server/spec360-edits.server';
import type { RequestHandler } from './$types';

/**
 * A change made in place on the Specification 360° while it is a draft:
 * POST `{ op: 'edit', anchor, text, desc?, tags? }`, `{ op: 'add_user', id? }`,
 * `{ op: 'add_core', id? }` or `{ op: 'delete', anchor }` (`id`: the UUID the page
 * minted to show the new element at once); and, draft or validated, a point Lyriks
 * noticed rejected or put back to review: `{ op: 'keep_finding' | 'reopen_finding',
 * issueId }`, and a fix waiting for confirmation confirmed or reopened:
 * `{ op: 'confirm_fix' | 'reopen_fix', issueId }`. Answers `{ ok, anchor }`, the
 * anchor of what was added; a refused change answers 400 with its reason.
 */
export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const parsed = parseSpecEdit(await event.request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.reason);
	const actor = await retrospecActor(services, projectId, event.cookies);
	const { anchor } = await applySpecEdit(services, projectId, parsed.request, actor, event.request.headers.get('x-lyriks-client'));
	return json({ ok: true, anchor });
};
