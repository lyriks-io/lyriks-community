import { parseGlossaryDraft } from '$application/parse-glossary-draft';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Glossary autosave target. Persists the authored vocabulary (terms + view
 * state), then best-effort mirrors the whole wizard envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'glossary',
		validate: (body) => assertSectionDraftValid('glossary', body),
		parse: parseGlossaryDraft,
		persist: (draft, services, _projectId, save) => services.saveGlossaryDraft.execute(draft, save),
		atomic: true
	});
