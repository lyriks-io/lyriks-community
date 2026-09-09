import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { parseArchitectureDraft } from '$application/parse-architecture-draft';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Re-seed the read-only tech set from Step 02 (stack/integrations) + Step 07
 * (infra). Returns just derivedTech so the client can patch it in place.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = getServices();
	const draft = await services.loadArchitectureDraft.execute(projectId);
	return json({ derivedTech: draft.derivedTech });
};

/**
 * Step 08 autosave target. Persists the authored architecture (the derived
 * mirror is recomputed on load, never trusted from the client), then
 * best-effort mirrors the whole wizard envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'architecture',
		parse: parseArchitectureDraft,
		persist: (draft, services, _projectId, save) => services.saveArchitectureDraft.execute(draft, save),
		atomic: true
	});
