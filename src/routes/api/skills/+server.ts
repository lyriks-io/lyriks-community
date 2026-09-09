import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { RequestHandler } from './$types';

/**
 * List the bundled authoring skills (id, name, description, size). Read-only
 * catalog metadata — like /api/settings reads, it rides the global auth wall
 * (401 when LYRIKS_AUTH_REQUIRED=1 and unauthenticated; open in local dev).
 */
export const GET: RequestHandler = async () => {
	const services = getServices();
	return json({ skills: services.skillCatalog.listSkills() });
};
