import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { parseRulesDraft } from '$application/parse-rules-draft';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
import type { RequestHandler } from './$types';

/**
 * Re-pull the read-only rule inventory by consolidating Steps 02/03/05 (the
 * spec's Refresh Inventory action). Returns just the inventory so the client
 * can patch it in place without a full reload.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = getServices();
	const draft = await services.loadRulesDraft.execute(projectId);
	return json({ inventory: draft.inventory });
};

/**
 * Step 06 autosave target. Persists the authored issues + edge-case scenarios
 * (the inventory is recomputed on load, never trusted from the client), then
 * best-effort mirrors the whole wizard envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'rules',
		validate: (body) => assertSectionDraftValid('rules', body),
		parse: parseRulesDraft,
		persist: (draft, services) => services.saveRulesDraft.execute(draft)
	});
