import { validateSectionContent } from './section-authoring-content';
import { validateSectionReferences } from './section-authoring-references';
import { validateSectionItems, type SectionValidationIssue } from './section-authoring-schema';

/** The same non-mutating authoring checks are used by saves and previews. */
export function validateSectionDraft(section: string, body: unknown): SectionValidationIssue[] {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return [{ path: '', message: 'draft must be an object' }];
	return [
		...validateSectionItems(section, body),
		...validateSectionReferences(section, body),
		...validateSectionContent(section, body)
	];
}
