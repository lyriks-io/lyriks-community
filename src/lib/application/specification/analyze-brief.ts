import type { AiSuggesterPort, BriefAnalysis, TelemetryPort } from '../ports';

/** Raised when an AI action runs with nothing to work from. */
export class EmptyBriefError extends Error {
	constructor(message = 'Write your brief first. There is nothing to analyze.') {
		super(message);
		this.name = 'EmptyBriefError';
	}
}

/**
 * Runs structured analysis over the brief and emits `init.brief.analyzed`.
 * Enforces the spec rule that blocks the action on an empty brief.
 */
export class AnalyzeBriefUseCase {
	constructor(
		private readonly ai: AiSuggesterPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(brief: string): Promise<BriefAnalysis> {
		if (brief.trim().length === 0) throw new EmptyBriefError();

		const analysis = await this.ai.analyzeBrief(brief);
		this.telemetry.emit({
			type: 'init.brief.analyzed',
			suggestedFormFactors: analysis.suggestedFormFactors,
			suggestedMarketType: analysis.suggestedMarketType,
			suggestedCompetitors: analysis.suggestedCompetitors
		});
		return analysis;
	}
}
