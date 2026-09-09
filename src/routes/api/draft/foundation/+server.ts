import { parseFoundationDraft } from '$application/parse-foundation-draft';
import { assertSectionDraftValid } from '$lib/server/section-authoring-validation.server';
import { saveSectionDraft } from '$lib/server/section-save.server';
import type { RequestHandler } from './$types';

/**
 * The single public Foundation write boundary. Internal migration-era stores are
 * coordinated by the application use-case and never leak into the wire contract.
 *
 * The parser is deliberately permissive about SHAPE (it folds loose MCP spellings
 * into the canonical draft), so the gate here is about ALTITUDE: Foundation is
 * the high-level page, and a feature rule authored into a business field is
 * rejected with the section that owns it.
 */
export const PUT: RequestHandler = (event) =>
	saveSectionDraft(event, {
		section: 'foundation',
		validate: (body) => assertSectionDraftValid('foundation', body),
		parse: parseFoundationDraft,
		persist: (draft, services) => services.saveFoundationDraft.execute(draft)
	});
