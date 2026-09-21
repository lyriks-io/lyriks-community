import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { UnknownPersonaError } from '$application/use-cases/simulate-experience';
import type { SimAction, SimRequest } from '$domain/experience';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Headlessly RUN the prototype to verify a flow — the "verify" half of the
 * authoring loop. Initialises run state (optionally as a persona / from a given
 * screen), folds the scripted `actions` through the pure run-mode engine, and
 * returns the landing screen, live state, screens visited, the activity trace
 * and every error (validation / scenario / broken navigation / unbound action).
 * Read-only: a run is ephemeral, nothing is persisted.
 *
 *   POST /api/draft/experience/simulate
 *     { projectId, personaId?, startScreenId?, actions: SimAction[] }  ->  SimResult
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const body = (await request.json().catch(() => null)) as
		| {
				projectId?: unknown;
				personaId?: unknown;
				startScreenId?: unknown;
				actions?: unknown;
		  }
		| null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');

	const req: SimRequest = {
		personaId: typeof body?.personaId === 'string' ? body.personaId : null,
		startScreenId: typeof body?.startScreenId === 'string' ? body.startScreenId : null,
		actions: Array.isArray(body?.actions) ? (body.actions as SimAction[]) : []
	};

	const services = getServices();
	try {
		return json(await services.simulateExperience.execute(projectId, req));
	} catch (err) {
		// A role nobody declared is the caller's mistake, named as such: running
		// it as the author instead would answer a proof about a role that does
		// not exist.
		if (err instanceof UnknownPersonaError) error(400, err.message);
		throw err;
	}
};
