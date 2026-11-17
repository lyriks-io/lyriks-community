import { json, error } from '@sveltejs/kit';
import { createRole, type RoleTone } from '$domain/users';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { commitRevision } from '$lib/server/draft-lock.server';
import { mirrorToBack } from '$lib/server/section-save.server';
import { publishSectionChange } from '$lib/server/sync-bus.server';
import type { RequestHandler } from './$types';

/** The two kinds the Personas tab files people under, as the tone each starts with. */
const TONE_BY_CLASS: Record<string, RoleTone> = { 'end-user': 'customer', admin: 'admin' };

/**
 * Append one role to a project's Users draft and return it. Powers the
 * Foundation Business section's "create a user" shortcut (spec action
 * `6f377bb2`), so a persona authored next to a pain point is the SAME shared
 * role as Users & Permissions, not a private copy. Loads the latest draft
 * server-side before appending, so it never clobbers concurrent matrix edits,
 * and reuses a same-named role so the shortcut stays idempotent.
 *
 * The write follows the section save protocol: it bumps the Users revision and
 * announces the change, so every open page reloads the personas and an open
 * Users tab answers its next autosave with a reload instead of saving an older
 * list over the new role (criterion `f953a518`).
 *
 * Body: `{ projectId: string; name: string; personaClass?: 'end-user' | 'admin'; tone?: RoleTone }`.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as
		| { projectId?: unknown; name?: unknown; personaClass?: unknown; tone?: unknown }
		| null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!projectId) error(400, 'projectId is required');
	if (!name) error(400, 'A role name is required');
	// Same gate as the PUT autosave path: this writes the project's Users draft.
	await requireProjectAccess(event, projectId, 'write');

	const services = event.locals.services;
	const draft = await services.loadUsersDraft.execute(projectId);

	const existing = draft.roles.find((r) => r.name.trim().toLowerCase() === name.toLowerCase());
	if (existing) {
		return json({ role: { id: existing.id, name: existing.name, tone: existing.tone } });
	}

	// A persona that "suffers from" a pain point is an end-user unless told otherwise.
	const tone =
		(typeof body?.personaClass === 'string' && TONE_BY_CLASS[body.personaClass]) ||
		((typeof body?.tone === 'string' ? body.tone : 'customer') as RoleTone);
	const role = createRole({ name, tone });
	draft.roles.push(role);

	await commitRevision(services, projectId, 'users', event.request);
	await services.saveUsersDraft.execute(draft);
	mirrorToBack(services, projectId, 'users');
	publishSectionChange({ projectId, section: 'users', origin: event.request.headers.get('x-lyriks-client') });

	return json({ role: { id: role.id, name: role.name, tone: role.tone } });
};
