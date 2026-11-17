import { parseIdentityDraft } from '$application/specification/parse-foundation-identity';
import { assertSummaryFits } from '$lib/server/product-summary.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Identity slice autosave target under the one public Foundation section. Thin
 * delegate to the folded Foundation use-case's identity slice. Slice and whole
 * saves share the public Foundation revision and exclusive write boundary.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'foundation.identity',
		parse: parseIdentityDraft,
		persist: async (draft, services, projectId) => {
			await assertSummaryFits(services, projectId, draft.brief);
			const result = await services.saveFoundationDraft.saveIdentity(draft);
			await services.syncBehaviorProject.execute(draft);
			return result;
		}
	});
