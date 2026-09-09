import { parseIdentityDraft } from '$application/parse-foundation-identity';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Identity slice autosave target under the one public Foundation section. Thin
 * delegate to the folded Foundation use-case's identity slice; the dotted
 * section key keeps a per-slice revision scope while live-sync collapses it
 * onto the one `foundation` topic.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'foundation.identity',
		parse: parseIdentityDraft,
		persist: async (draft, services) => {
			const result = await services.saveFoundationDraft.saveIdentity(draft);
			await services.syncBehaviorProject.execute(draft);
			return result;
		}
	});
