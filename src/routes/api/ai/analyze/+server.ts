import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { EmptyBriefError } from '$application/use-cases';
import type { RequestHandler } from './$types';

/** Runs Analyze Brief. Body: { brief }. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { brief?: unknown } | null;
	const brief = typeof body?.brief === 'string' ? body.brief : '';

	try {
		const analysis = await getServices().analyzeBrief.execute(brief);
		return json(analysis);
	} catch (e) {
		if (e instanceof EmptyBriefError) error(422, e.message);
		throw e;
	}
};
