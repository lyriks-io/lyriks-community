import { computeDataCoherence, type ProjectDataDraft } from '$domain/data';
import type { ClockPort, DataDraftRepositoryPort, TelemetryPort } from '../ports';
import type { SpecLanguage } from '$domain/language';

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
		private readonly telemetry: TelemetryPort,
		/** The spec's language: the messages a save returns are written in it. */
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>,
		/**
		 * Run once the draft is saved, without holding the save: the rules the
		 * model states are given to the solver again (SyncDataRulesUseCase).
		 */
		private readonly afterSave?: (projectId: string) => void
	) {}

	async execute(draft: ProjectDataDraft): Promise<SaveDataDraftResult> {
		const savedAt = this.clock.nowIso();
		// Don't persist the recomputed derived mirror — it's rebuilt on load.
		const stamped: ProjectDataDraft = { ...draft, derivedEntities: [], lastSavedAt: savedAt };
		await this.drafts.save(stamped);
		this.afterSave?.(draft.projectId);

		const lang = (await this.languageOf?.(draft.projectId)) ?? 'en';
		const coherence = computeDataCoherence(draft, lang);
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
