import { parseBaselinesDraft } from '$application/parse-baselines-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/** Baselines autosave target — edits to name/note and deletions (capture is a POST). */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'baselines',
		parse: parseBaselinesDraft,
		persist: (draft, services, _projectId, save) => services.saveBaselinesDraft.execute(draft, save),
		atomic: true,
		mirror: false
	});
