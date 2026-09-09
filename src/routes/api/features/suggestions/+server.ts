import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { SuggestionsBlockedError } from '$application/use-cases';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Feature suggestions for the Step 04 tree. They have exactly one source: the
 * operator's LLM working through the Lyriks MCP pushes a batch (POST); the card
 * reads the stored batch back (GET). Both sides are gated by the Settings
 * switch — blocked installs reject the push and serve nothing.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) return json({ suggestions: [] }, { status: 400 });
	await requireProjectAccess(event, projectId, 'read');
	const services = getServices();
	const suggestions = await services.suggestFeatures.execute(projectId);
	return json({ suggestions });
};

/** MCP push path. Body: { projectId, suggestions: [{ title, rationale, ... }] }. */
export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	const body = (await request.json().catch(() => null)) as {
		projectId?: unknown;
		suggestions?: unknown;
	} | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	const services = getServices();
	try {
		const suggestions = await services.submitFeatureSuggestions.execute(
			projectId,
			body?.suggestions
		);
		services.audit.record({
			action: 'suggestions.submit',
			actor: locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev'),
			outcome: 'success',
			detail: `project=${projectId} count=${suggestions.length}`
		});
		return json({ suggestions });
	} catch (e) {
		if (e instanceof SuggestionsBlockedError) error(403, e.message);
		throw e;
	}
};
