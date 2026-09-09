import type { DocumentSource } from './draft';

/**
 * Where a source can actually be opened, or null when its `url` is a plain
 * reference ("Ops lead interview, 2026-03-11") rather than something a browser
 * can follow.
 *
 * A citation is only evidence if the evidence is one click away, so every
 * surface that shows a source resolves the same href — instead of each growing
 * its own `startsWith('http')` test that disagrees with the next one.
 *
 * Deliberately a small allow-list: `javascript:` and friends must never become
 * a link the app renders from stored project data.
 */
const FOLLOWABLE = /^(https?:|mailto:|data:)/i;

export function sourceHref(source: Pick<DocumentSource, 'url'>): string | null {
	const url = source.url.trim();
	if (!url) return null;
	// Root-relative paths point inside the appliance (an uploaded file served by
	// `/api/files`, a project page) — no scheme to check, and no egress.
	if (url.startsWith('/')) return url;
	return FOLLOWABLE.test(url) ? url : null;
}
