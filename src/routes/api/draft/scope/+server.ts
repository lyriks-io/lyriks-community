import { parseScopeDraft } from '$application/parse-scope-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/** Product scope autosave. Audit and completion metadata are server-owned. */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'scope',
		parse: parseScopeDraft,
		persist: (draft, services, _projectId, save) =>
			services.saveScopeDraft.execute(draft, save),
		atomic: true,
		mirror: false
	});
