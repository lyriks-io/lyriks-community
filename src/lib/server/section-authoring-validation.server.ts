import { error } from '@sveltejs/kit';
import { validateSectionContent } from '$application/section-authoring-content';
import { validateSectionReferences } from '$application/section-authoring-references';
import { validateSectionItems } from '$application/section-authoring-schema';

/**
 * The one gate every authored section passes, asking three separate questions:
 * does the payload PARSE (item shapes), do its ids RESOLVE (references), and is
 * the content the kind of thing this page holds (altitude). One message, so an
 * author — human autosave or MCP write — gets every verdict at once instead of
 * discovering them one save at a time.
 */
export function assertSectionDraftValid(section: string, body: unknown): void {
	const issues = [
		...validateSectionItems(section, body),
		...validateSectionReferences(section, body),
		...validateSectionContent(section, body)
	];
	if (issues.length === 0) return;
	const detail = issues.map((issue) => `${issue.path} ${issue.message}`).join('; ');
	error(400, `invalid_section_shape [${section}]: ${detail}`);
}
