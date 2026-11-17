import { parseApprovalsDraft } from '$application/specification/parse-approvals-draft';
import { saveApprovals } from '$lib/server/approvals-save.server';
import { callerKind } from '$lib/server/caller.server';
import { retrospecActor } from '$lib/server/retrospec-status.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/** Approvals autosave target: pure Lyriks residue, no kernel mirror; sign-offs are a person's and stamped here. */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'approvals',
		parse: parseApprovalsDraft,
		persist: (draft, services, projectId, save) =>
			saveApprovals(services, projectId, draft, save, {
				kind: callerKind(event.request),
				decider: () => retrospecActor(services, projectId, event.cookies)
			}),
		atomic: true,
		mirror: false
	});
