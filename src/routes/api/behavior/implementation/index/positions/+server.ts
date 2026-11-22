import { error } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { expectedRevisionOf, guardedIndexWrite } from '$lib/server/implementation-index-write.server';
import type { RequestHandler } from './$types';

/** Long lists are cut to their head; `total` keeps the real length. */
const LIST_HEAD = 50;
const head = (list: readonly unknown[]) => ({ total: list.length, entries: list.slice(0, LIST_HEAD) });

/**
 * Update where located elements now stand (feat-100, action f20cf75e,
 * criterion e9699cc6): entries whose code only moved, sent alone. The file,
 * line and code line Lyriks holds for each key it already located are
 * replaced; no report gains or loses a key, so the coverage stays as it is.
 * A key not located yet is listed, never recorded: a move adds no coverage.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		index?: unknown;
		expectedRevision?: unknown;
	} | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	if (!body?.index || typeof body.index !== 'object' || Array.isArray(body.index)) {
		error(400, 'index must be an object keyed by "<type>:<id>"');
	}
	const entries = body.index as Readonly<Record<string, unknown>>;
	if (Object.keys(entries).length === 0) error(400, 'No entry sent: nothing to move.');
	const expected = expectedRevisionOf(body.expectedRevision);

	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	// Telling a located key from an orphan takes the specification the engine resolves.
	if (!services.codeAdoption.available) error(503, 'Behavior engine unavailable');
	const units = await services.moveIndexPositions.unitsOf(projectId, Object.keys(entries));
	return guardedIndexWrite(services, projectId, units, expected, async () => {
		const outcome = await services.moveIndexPositions.execute(projectId, entries);
		if (outcome === null) error(503, 'Behavior engine unavailable');
		if (!outcome.ok) return { written: null, value: { available: true, ok: false, error: outcome.error } };
		const { plan, failures } = outcome;
		const landed = plan.batches.length > 0;
		// The places a page shows changed; the coverage did not, but the cached reading holds both.
		if (landed) services.implementationCoverage.invalidate(projectId);
		return {
			written: landed ? plan.units : null,
			value: {
				available: true,
				ok: plan.notLocated.length === 0 && plan.orphans.length === 0 && failures.length === 0,
				positionsOnly: true,
				sent: Object.keys(entries).length,
				moved: plan.moved.length,
				units: head(plan.units),
				notLocated: head(plan.notLocated),
				orphans: head(plan.orphans),
				failedAcks: failures.slice(0, LIST_HEAD)
			}
		};
	});
};
