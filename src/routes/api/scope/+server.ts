import { json } from '@sveltejs/kit';
import { evolutionAccess } from '$domain/licensing';
import type { RequestHandler } from './$types';

/**
 * What the installation's edition opens, for the MCP gateway: it offers an AI
 * client only the tools this installation answers (EVO-001). On Community it
 * hides what reads or drives an Evolution request and keeps the session of
 * the project, which Ask my AI needs (EVO-008); the refusal is the platform's
 * own sentence, so the gateway refuses a request operation in the words the
 * server would use (EVO-006). The server still refuses on its own; this only
 * keeps the tool list honest.
 *
 *   GET /api/scope -> { edition, evolutions, refusal? }
 */
export const GET: RequestHandler = async ({ locals }) => {
	const edition = locals.services.installEdition() ?? null;
	const access = evolutionAccess(edition);
	return json({
		edition,
		evolutions: access.ok,
		...(access.ok ? {} : { refusal: { message: access.reason, detail: access.detail, plan: access.plan } })
	});
};
