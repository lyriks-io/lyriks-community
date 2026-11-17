import { parseBaselinesDraft } from '$application/specification/parse-baselines-draft';
import { saveBaselineEdits } from '$lib/server/baselines-save.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/** Baselines autosave target: names, notes and deletions of captured baselines (capture is a POST). */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'baselines',
		parse: parseBaselinesDraft,
		persist: (draft, services, projectId, save) => saveBaselineEdits(services, projectId, draft, save),
		atomic: true,
		mirror: false
	});
