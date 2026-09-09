import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { createRole, type RoleTone } from '$domain/users';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Append one role to a project's Users draft and return it. Powers the
 * Foundation Business section's "create a user" shortcut, so a persona authored
 * next to a pain point is the SAME shared role as Users & Permissions — not a
 * private copy. Loads the latest draft server-side before appending, so it
 * never clobbers concurrent matrix edits, and reuses a same-named role so the
 * shortcut stays idempotent.
 *
 * Body: `{ projectId: string; name: string; tone?: RoleTone }`.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as
		| { projectId?: unknown; name?: unknown; tone?: unknown }
		| null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!projectId) error(400, 'projectId is required');
	if (!name) error(400, 'A role name is required');
	// Same gate as the PUT autosave path: this writes the project's Users draft.
	await requireProjectAccess(event, projectId, 'write');

	const services = getServices();
	const draft = await services.loadUsersDraft.execute(projectId);

	const existing = draft.roles.find((r) => r.name.trim().toLowerCase() === name.toLowerCase());
	if (existing) {
		return json({ role: { id: existing.id, name: existing.name, tone: existing.tone } });
	}

	// A persona that "suffers from" a pain point is an end-user by default.
	const tone = (typeof body?.tone === 'string' ? body.tone : 'customer') as RoleTone;
	const role = createRole({ name, tone });
	draft.roles.push(role);
	await services.saveUsersDraft.execute(draft);

	return json({ role: { id: role.id, name: role.name, tone: role.tone } });
};
