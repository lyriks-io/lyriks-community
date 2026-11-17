import { saveSectionDraft } from '$lib/server/section-save.server';
import { GLOSSARY_WRITE } from '$lib/server/section-write-specs.server';
import type { RequestHandler } from './$types';

/**
 * Glossary autosave target. Persists the authored vocabulary (terms + view
 * state), then best-effort mirrors the whole wizard envelope to Lyriks-back.
 */
export const PUT: RequestHandler = (event) => saveSectionDraft(event, GLOSSARY_WRITE);
