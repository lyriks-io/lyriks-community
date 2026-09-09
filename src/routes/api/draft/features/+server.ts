import { parseFeaturesDraft } from '$application/parse-features-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
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
		validate: (body) => assertSectionDraftValid('features', body),
		parse: parseFeaturesDraft,
		persist: (draft, services) => services.saveFeaturesDraft.execute(draft)
	});
