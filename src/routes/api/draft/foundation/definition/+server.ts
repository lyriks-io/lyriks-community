import { parseDefinitionDraft } from '$application/parse-foundation-definition';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Definition slice autosave target under the one public Foundation section.
 * Thin delegate to the folded Foundation use-case's definition slice.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'foundation.definition',
		parse: parseDefinitionDraft,
		persist: async (draft, services, projectId) => {
			const result = await services.saveFoundationDraft.saveDefinition(draft);
			// Refresh the Unspaghettit workspace tags (definition-aware) + back envelope.
			// Best-effort, fire-and-forget — never block the autosave round-trip.
			void services.loadFoundationDraft
				.loadIdentity(projectId)
				.then((identity) => services.syncBehaviorProject.execute(identity))
				.catch(() => {});
			return result;
		}
	});
