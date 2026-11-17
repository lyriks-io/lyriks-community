import { saveSectionDraft } from '$lib/server/section-save.server';
import { SCOPE_WRITE } from '$lib/server/section-write-specs.server';
import type { RequestHandler } from './$types';

/** Product scope autosave. Audit and completion metadata are server-owned. */
export const PUT: RequestHandler = (event) => saveSectionDraft(event, SCOPE_WRITE);
