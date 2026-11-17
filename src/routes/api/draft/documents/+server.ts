import { saveSectionDraft } from '$lib/server/section-save.server';
import { DOCUMENTS_WRITE } from '$lib/server/section-write-specs.server';
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
export const PUT: RequestHandler = (event) => saveSectionDraft(event, DOCUMENTS_WRITE);
