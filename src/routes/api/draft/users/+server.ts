import { saveSectionDraft } from '$lib/server/section-save.server';
import { USERS_WRITE } from '$lib/server/section-write-specs.server';
import type { RequestHandler } from './$types';

/**
 * Debounced auto-save target for Step 03. Body: a (possibly partial) users
 * draft incl. projectId.
 *
 * A grant whose capability no longer exists grants nothing to nobody. One the
 * caller INTRODUCES is a mistake being made now, so it is refused and the
 * refusal names the canonical id (ac-matrix-4). One that was ALREADY STORED is
 * dead data a rename or a removal left behind, so it is dropped and reported in
 * the answer (ac-matrix-3). Refusing those instead walls the section shut for
 * good: removing the row is itself a write, so the only repair the product
 * offers is the very thing being refused (ac-matrix-5).
 *
 * The review sits in `persist` because it is the one step that may both read
 * what is stored and decide what is written; `parse` stays pure, as its
 * contract says, and an error here rolls the revision bump back.
 */
export const PUT: RequestHandler = (event) => saveSectionDraft(event, USERS_WRITE);
