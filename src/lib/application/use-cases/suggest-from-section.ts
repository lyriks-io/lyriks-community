import type { FoundationIdentityDraft, SuggestableSection } from '$domain/foundation';
import type { AiSuggesterPort, SectionSuggestion, TelemetryPort } from '../ports';
import { EmptyBriefError } from './analyze-brief';

/**
 * Produces a per-section suggestion (returned as a draft patch for a diff view)
 * and emits `init.section.suggested`. Blocks on an empty brief, per spec.
 */
export class SuggestFromSectionUseCase {
	constructor(
		private readonly ai: AiSuggesterPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(
		section: SuggestableSection,
		brief: string,
		draft: FoundationIdentityDraft
	): Promise<SectionSuggestion> {
		if (brief.trim().length === 0)
			throw new EmptyBriefError('Write your brief first. There is nothing to suggest from.');

		const suggestion = await this.ai.suggest(section, brief, draft);
		this.telemetry.emit({
			type: 'init.section.suggested',
			section,
			itemCount: suggestion.itemCount
		});
		return suggestion;
	}
}
