import type { ProjectDataDraft } from '$domain/data';
import { extractedFromSourceMode, type ExtractedReading } from '$domain/documents';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { ProjectFoundationDraft } from '$domain/foundation';
import type { ProjectGlossaryDraft } from '$domain/glossary';
import { extractedElements } from '$domain/retrospec';
import type { ProjectRulesDraft } from '$domain/rules';
import type { ProjectUsersDraft } from '$domain/users';

interface Loader<T> {
	execute(projectId: string): Promise<T>;
}

/**
 * The elements a project read from its code, its documentation or its design
 * extracted, each with the sources it cites (ac-src-extracted, criterion
 * 7a8be13f), and what it was read from. Null for a project started from
 * scratch: the rule is about what was read from something that exists, not
 * about every spec. A rule the platform detected on its own is a finding, not
 * an extraction.
 */
export class ListExtractedElementsUseCase {
	constructor(
		private readonly foundation: Loader<ProjectFoundationDraft>,
		private readonly features: Loader<ProjectFeaturesDraft>,
		private readonly rules: Loader<ProjectRulesDraft>,
		private readonly glossary: Loader<ProjectGlossaryDraft>,
		private readonly users: Loader<ProjectUsersDraft>,
		private readonly data: Loader<ProjectDataDraft>
	) {}

	async execute(projectId: string): Promise<ExtractedReading | null> {
		const foundation = await this.foundation.execute(projectId);
		const from = extractedFromSourceMode(foundation.identity.sourceMode);
		if (from === null) return null;
		const [features, rules, glossary, users, data] = await Promise.all([
			this.features.execute(projectId),
			this.rules.execute(projectId),
			this.glossary.execute(projectId),
			this.users.execute(projectId),
			this.data.execute(projectId)
		]);
		return { from, elements: extractedElements({ features, rules, glossary, users, data }) };
	}
}
