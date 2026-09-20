import { parseFeaturesDraft } from '$application/parse-features-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
import { assertLeafIdsUnclaimed } from '$lib/server/features-leaf-id-guard.server';
import type { RequestHandler } from './$types';

/**
 * Step 04 autosave target. `saveFeaturesDraft` now writes the behavior KERNEL
 * directly (leaf shells + membership tags via BehaviorPort.apply) plus the Lyriks
 * residue — so the project's Unspaghettit workspace (data/unspa/<projectId>/) is
 * the source of truth, no separate sync step. We still best-effort mirror to
 * Lyriks-back's wizard_envelope.features key.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'features',
		validate: async (body, services, projectId) => {
			assertSectionDraftValid('features', body);
			// A leaf id is claimed HERE, so this is where a clash has to be refused.
			await assertLeafIdsUnclaimed(parseFeaturesDraft(body, projectId), services, projectId);
		},
		parse: parseFeaturesDraft,
		persist: (draft, services) => services.saveFeaturesDraft.execute(draft)
	});
