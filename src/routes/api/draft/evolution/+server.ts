import { error } from '@sveltejs/kit';
import { parseEvolutionDraft } from '$application/parse-evolution-draft';
import { refusedReports } from '$domain/evolution';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Evolution autosave target. Pure Lyriks residue with no kernel mirror: the
 * dossier holds the request, its reports and its timeline, while every
 * specification value it gathers lives in the section that owns it.
 *
 * One thing is judged at the door: an implementation report deposited by the
 * coding agent must name the frozen spec version. A report against another
 * version, or against a spec nobody froze, is refused with both numbers rather
 * than read, and the stored request is the authority on what is frozen.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'evolution',
		parse: parseEvolutionDraft,
		persist: async (draft, services, projectId, save) => {
			const stored = await services.loadEvolutionDraft.execute(projectId);
			const refusals = refusedReports(stored.requests, draft.requests);
			if (refusals.length > 0) {
				error(
					422,
					refusals.map((r) => `Request ${r.requestId}: ${r.reason}`).join(' ')
				);
			}
			return services.saveEvolutionDraft.execute(draft, save);
		},
		atomic: true,
		mirror: false
	});
