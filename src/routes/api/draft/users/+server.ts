import { parseUsersDraft } from '$application/parse-users-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
import type { RequestHandler } from './$types';

/** Debounced auto-save target for Step 03. Body: a (possibly partial) users draft incl. projectId. */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'users',
		validate: (body) => assertSectionDraftValid('users', body),
		parse: parseUsersDraft,
		persist: (draft, services) => services.saveUsersDraft.execute(draft)
	});
