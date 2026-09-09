import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { parseCoherenceDraft } from '$application/parse-coherence-draft';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Run a fresh global coherence check — recompute dimensions, gaps and the
 * readiness score from steps 01-08 plus the Rust DPO engine. `?force=1` (set by
 * the explicit "Run coherence check" button) forces a fresh *synchronous* engine
 * recompute; without it we read the cheap cached DPO verdict, same as page load.
 * Returns the analysis so the client patches it in place.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const force = url.searchParams.get('force') === '1';
	const services = getServices();
	const view = await services.loadCoherenceDraft.execute(projectId, { force });
	return json({ analysis: view.analysis });
};

/**
 * Step 09 autosave target — persists the authored state (threshold,
 * acknowledgements, generated artifacts), then best-effort mirrors the whole
 * wizard envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'coherence',
		parse: parseCoherenceDraft,
		persist: (draft, services, _projectId, save) =>
			services.saveCoherenceDraft.execute(draft, save),
		atomic: true
	});
