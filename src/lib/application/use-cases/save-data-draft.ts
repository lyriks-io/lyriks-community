import { computeDataCoherence, type ProjectDataDraft } from '$domain/data';
import type { ClockPort, DataDraftRepositoryPort, TelemetryPort } from '../ports';

export interface SaveDataDraftResult {
	savedAt: string;
	coherenceScore: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues: string[];
}

export class SaveDataDraftUseCase {
	constructor(
		private readonly drafts: DataDraftRepositoryPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(draft: ProjectDataDraft): Promise<SaveDataDraftResult> {
		const savedAt = this.clock.nowIso();
		// Don't persist the recomputed derived mirror — it's rebuilt on load.
		const stamped: ProjectDataDraft = { ...draft, derivedEntities: [], lastSavedAt: savedAt };
		await this.drafts.save(stamped);

		const coherence = computeDataCoherence(draft);
		const telemetry = this.telemetry;
		telemetry.emit({ type: 'data.autosaved', savedAt });
		telemetry.emit({
			type: 'data.local_coherence.computed',
			score: coherence.score,
			issues: coherence.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: coherence.score,
			coherenceIssues: coherence.issues.slice(0, 20).map((i) => i.message)
		};
	}
}
