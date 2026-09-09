import { parseSupervisionDraft } from '$application/parse-supervision-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Supervision autosave target. Persists the authored board (assignments, AI
 * policy rules and decisions), then best-effort mirrors the whole wizard
 * envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'supervision',
		parse: parseSupervisionDraft,
		persist: (draft, services, _projectId, save) => services.saveSupervisionDraft.execute(draft, save),
		atomic: true
	});
