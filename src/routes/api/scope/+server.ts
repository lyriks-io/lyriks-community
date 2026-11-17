import { json } from '@sveltejs/kit';
import { evolutionAccess } from '$domain/licensing';
import type { RequestHandler } from './$types';

/**
 * What the installation's edition opens, for the MCP gateway: it offers an AI
 * client only the tools this installation answers (EVO-001), so on Community
 * the Evolution and roadmap tools are not listed at all. The server still
 * refuses them on its own; this only keeps the tool list honest.
 *
 *   GET /api/scope -> { edition, evolutions }
 */
export const GET: RequestHandler = async ({ locals }) => {
	const edition = locals.services.installEdition() ?? null;
	return json({ edition, evolutions: evolutionAccess(edition).ok });
};
