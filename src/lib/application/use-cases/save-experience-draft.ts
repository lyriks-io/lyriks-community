import { computeExperienceCoherence, type ProjectExperienceDraft } from '$domain/experience';
import type { ClockPort, ExperienceDraftRepositoryPort, TelemetryPort } from '../ports';

export interface SaveExperienceDraftResult {
	savedAt: string;
	coherenceScore: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues: string[];
	/**
	 * Kernel merge-loss warnings: engine-only structure (batch-authored surfaces /
	 * actions with no Lyriks counterpart) this save dropped. Empty when nothing
	 * was lost. Surfaced so MCP/UI authors learn about the loss at write time.
	 */
	behaviorWarnings: string[];
}

export class SaveExperienceDraftUseCase {
	constructor(
		private readonly drafts: ExperienceDraftRepositoryPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(draft: ProjectExperienceDraft): Promise<SaveExperienceDraftResult> {
		const savedAt = this.clock.nowIso();
		const stamped: ProjectExperienceDraft = { ...draft, lastSavedAt: savedAt };
		const report = await this.drafts.save(stamped);

		const coherence = computeExperienceCoherence(stamped);
		const telemetry = this.telemetry;
		telemetry.emit({ type: 'experience.autosaved', savedAt });
		telemetry.emit({
			type: 'experience.local_coherence.computed',
			score: coherence.score,
			issues: coherence.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: coherence.score,
			coherenceIssues: coherence.issues.slice(0, 20).map((i) => i.message),
			behaviorWarnings: report?.behaviorWarnings ?? []
		};
	}
}
