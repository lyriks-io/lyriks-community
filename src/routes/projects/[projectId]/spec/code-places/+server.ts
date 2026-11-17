import { json } from '@sveltejs/kit';
import { codePlacesByAnchor } from '$application/spec360/sources';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * The places in the code each behaviour block was located at. Read when a block
 * opens its sources: a product read from its code holds thousands of them, and
 * every page of the specification only needs how many each block has.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const coverage = await event.locals.services.implementationCoverage.get(projectId).catch(() => ({}));
	return json(codePlacesByAnchor(coverage));
};
