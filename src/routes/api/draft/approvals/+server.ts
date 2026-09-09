import { parseApprovalsDraft } from '$application/parse-approvals-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/** Approvals autosave target — pure Lyriks residue, no kernel mirror. */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'approvals',
		parse: parseApprovalsDraft,
		persist: (draft, services, _projectId, save) => services.saveApprovalsDraft.execute(draft, save),
		atomic: true,
		mirror: false
	});
