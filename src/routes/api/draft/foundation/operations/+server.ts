import { parseOperationsDraft } from '$application/parse-foundation-operations';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Operations slice autosave target under the one public Foundation section.
 * Persists the operational rails (i18n, quality budgets, migration, fixtures
 * and per-screen UI states) through the folded Foundation use-case, then
 * best-effort mirrors the whole wizard envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'foundation.operations',
		parse: parseOperationsDraft,
		persist: (draft, services, _projectId, save) =>
			services.saveFoundationDraft.saveOperations(draft, save),
		atomic: true
	});
