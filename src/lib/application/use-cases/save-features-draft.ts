import {
	collectFeaturesWarnings,
	computeFeaturesCoherence,
	type ProjectFeaturesDraft
} from '$domain/features';
import type { DraftWarning } from '$domain/shared';
import type {
	ClockPort,
	FeaturesDraftRepositoryPort,
	TelemetryPort
} from '../ports';

export interface SaveFeaturesDraftResult {
	savedAt: string;
	coherenceScore: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues: string[];
	/** Non-blocking integrity notes (dangling refs, orphaned assignments). */
	warnings: DraftWarning[];
}

export class SaveFeaturesDraftUseCase {
	constructor(
		private readonly drafts: FeaturesDraftRepositoryPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(draft: ProjectFeaturesDraft): Promise<SaveFeaturesDraftResult> {
		const savedAt = this.clock.nowIso();
		const stamped: ProjectFeaturesDraft = { ...draft, lastSavedAt: savedAt };
		await this.drafts.save(stamped);

		const coherence = computeFeaturesCoherence(stamped);
		const telemetry = this.telemetry;
		telemetry.emit({ type: 'features.autosaved', savedAt });
		telemetry.emit({
			type: 'features.local_coherence.computed',
			score: coherence.score,
			issues: coherence.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: coherence.score,
			coherenceIssues: coherence.issues.slice(0, 20).map((i) => i.message),
			warnings: collectFeaturesWarnings(stamped)
		};
	}
}
