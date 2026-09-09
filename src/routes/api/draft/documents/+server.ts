import { sourceAccessIssues } from '$domain/documents';
import { parseDocumentsDraft } from '$application/parse-documents-draft';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * Documents & Sources autosave target: pure Lyriks residue, no kernel mirror.
 *
 * The save answers with `coherenceIssues` naming every row a reader other than
 * its author cannot consult (an address nobody else can open, or neither link
 * nor note), the same channel the data write uses for orphan tables: an agent
 * reads the response and fixes the row in the same pass, instead of finding
 * out at the completion gate.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'documents',
		parse: parseDocumentsDraft,
		persist: async (draft, services, _projectId, save) => {
			const result = await services.saveDocumentsDraft.execute(draft, save);
			if (result === null) return null;
			const issues = sourceAccessIssues(draft.sources);
			return issues.length === 0
				? result
				: { ...result, coherenceIssues: issues.slice(0, 20).map((issue) => issue.message) };
		},
		atomic: true,
		mirror: false
	});
