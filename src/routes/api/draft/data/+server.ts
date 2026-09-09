import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { parseDataDraft } from '$application/parse-data-draft';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Re-derive the entity set from the Step 05 journeys (the spec's Derive /
 * Refresh action). Returns just the derivedEntities so the client can patch
 * them in place without a full reload.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = getServices();
	const draft = await services.loadDataDraft.execute(projectId);
	return json({ derivedEntities: draft.derivedEntities });
};

/**
 * Step 07 autosave target. Persists the authored data model (the derived
 * mirror is recomputed on load, never trusted from the client), then
 * best-effort mirrors the whole wizard envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'data',
		validate: (body) => assertSectionDraftValid('data', body),
		parse: parseDataDraft,
		// The kernel data adapter writes into the canonical local project folder.
		persist: (draft, services) => services.saveDataDraft.execute(draft)
	});
