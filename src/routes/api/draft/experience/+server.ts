import { json, error } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import { EXPERIENCE_WRITE } from '$lib/server/section-write-specs.server';
import type { RequestHandler } from './$types';

/**
 * Re-pull the read-only Cores from Step 04 (the spec's `Refresh Derived Cores`
 * action). Returns just the freshly-mirrored `derivedCores` so the client can
 * patch them in place without a full reload — the load use-case recomputes them
 * from the current Step 04 feature tree.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	const draft = await services.loadExperienceDraft.execute(projectId);
	return json({ derivedCores: draft.derivedCores });
};

/**
 * Step 05 autosave target. After persisting the draft we best-effort mirror
 * the whole wizard envelope (now including the `experience` key) to
 * Lyriks-back. Journeys authored here also flow into Step 03's permissions
 * matrix via the upstream-capability provider on the next Step 03 load — no
 * extra call needed here.
 */
export const PUT: RequestHandler = (event) => saveSectionDraft(event, EXPERIENCE_WRITE);
