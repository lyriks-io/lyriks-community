import { parseFinopsDraft } from '$application/parse-finops-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * AI Cost Governor autosave target. Persists the authored levers (budget,
 * thresholds, enforcement mode, gateway link and compiled rules), then
 * best-effort mirrors the whole wizard envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'finops',
		parse: parseFinopsDraft,
		persist: (draft, services, _projectId, save) => services.saveFinopsDraft.execute(draft, save),
		atomic: true
	});
