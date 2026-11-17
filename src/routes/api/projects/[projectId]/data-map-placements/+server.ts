import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { PlacementAct } from '$domain/data';
import type { RequestHandler } from './$types';

/**
 * Where people put the tables of a project's data map (criterion 7f5769bb),
 * kept apart from the specification.
 *
 *   GET  → { document }
 *   POST { move: { tableId, x, y } } | { arrange: true } → { document } | 422 refusal | 409 conflict
 *
 * Moving a table changes nothing the spec says, but it changes the map every
 * reader opens, so it takes the right to write on the project.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	return json({ document: await event.locals.services.loadMapPlacements.execute(projectId) });
};

function actOf(body: unknown): PlacementAct | null {
	const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
	if (b.arrange === true) return { kind: 'arrange' };
	const move = b.move && typeof b.move === 'object' ? (b.move as Record<string, unknown>) : null;
	if (move && typeof move.tableId === 'string' && typeof move.x === 'number' && typeof move.y === 'number')
		return { kind: 'move', tableId: move.tableId, x: move.x, y: move.y };
	return null;
}

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const act = actOf(await event.request.json().catch(() => null));
	if (!act) error(400, 'Send { move: { tableId, x, y } } or { arrange: true }.');
	const result = await event.locals.services.placeMapTables.execute(projectId, act, event.request.headers.get('x-lyriks-client'));
	if (!result.ok) return json({ refusal: result.refusal }, { status: result.conflict ? 409 : 422 });
	return json({ document: result.document });
};
