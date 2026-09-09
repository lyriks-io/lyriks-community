import { computeCoherenceLocal, type ProjectCoherenceDraft } from '$domain/coherence';
import type {
	ClockPort,
	CoherenceDraftRepositoryPort,
	GlobalCoherenceCheckerPort,
	SectionDraftSaveOptions,
	TelemetryPort
} from '../ports';

export interface SaveCoherenceDraftResult {
	savedAt: string;
	coherenceScore: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues: string[];
	readinessScore: number;
	revision: number;
}

export class SaveCoherenceDraftUseCase {
	constructor(
		private readonly drafts: CoherenceDraftRepositoryPort,
		private readonly checker: GlobalCoherenceCheckerPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort
	) {}

	async execute(
		draft: ProjectCoherenceDraft,
		save: SectionDraftSaveOptions
	): Promise<SaveCoherenceDraftResult | null> {
		const savedAt = this.clock.nowIso();
		const stamped: ProjectCoherenceDraft = { ...draft, lastSavedAt: savedAt };
		const revision = await this.drafts.save(stamped, save);
		if (revision === null) return null;

		const analysis = await this.checker.analyze(draft.projectId);
		const local = computeCoherenceLocal(stamped, analysis);
		const telemetry = this.telemetry;
		telemetry.emit({ type: 'coherence.autosaved', savedAt });
		telemetry.emit({
			type: 'coherence.local_coherence.computed',
			score: local.score,
			issues: local.issues.map((i) => i.message)
		});

		return {
			savedAt,
			coherenceScore: local.score,
			coherenceIssues: local.issues.slice(0, 20).map((i) => i.message),
			readinessScore: analysis.readinessScore,
			revision
		};
	}
}
