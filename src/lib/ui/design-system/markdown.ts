/**
 * Markdown → sanitized HTML for the in-app file viewer. Both deps are bundled
 * (no runtime egress — air-gap safe). Sanitisation uses DOMPurify, so the
 * result is safe to inject with `{@html}`. Client-only: DOMPurify needs a DOM.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** Render a markdown string to sanitized HTML (GFM, line breaks on). */
export function renderMarkdown(src: string): string {
	const raw = marked.parse(src, { async: false, gfm: true, breaks: true }) as string;
	return DOMPurify.sanitize(raw);
}
