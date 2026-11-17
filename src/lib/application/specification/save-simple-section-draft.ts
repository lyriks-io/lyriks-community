import type { ClockPort, TelemetryPort, SectionDraftSaveOptions } from '../ports';

/** What every simple-section repository shares: an atomic save returning the
 *  new revision, or null when the expected revision is stale. */
export interface SimpleSectionDraftRepository<TDraft> {
	save(draft: TDraft, opts?: SectionDraftSaveOptions): Promise<number | null>;
}

/** The shape every local `computeXxxCoherence` fold already returns. */
export interface SectionCoherenceResult {
	score: number;
	issues: readonly { message: string }[];
}

export interface SaveSimpleSectionDraftResult {
	savedAt: string;
	/** The new optimistic-lock revision the atomic save settled on. */
	revision: number;
	/** Present when the section has a local coherence fold. */
	coherenceScore?: number;
	/** Issue messages behind the score (first 20) — so API/MCP callers see what drives it. */
	coherenceIssues?: string[];
}

/**
 * The one save use-case for every "simple" section (consolidated
 * `project_section_documents` store): stamp `lastSavedAt`, atomic save (null =
 * stale revision, the caller answers 409), emit `<section>.autosaved`, and —
 * when the section has a local coherence fold — emit and return its score.
 * Replaces the previous per-section line-for-line copies; per-section behavior
 * lives entirely in the hooks wired at the composition root.
 */
export class SaveSimpleSectionDraftUseCase<TDraft extends { lastSavedAt: string | null }> {
	constructor(
		private readonly section: string,
		private readonly drafts: SimpleSectionDraftRepository<TDraft>,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort,
		private readonly hooks: {
			/** Pre-save transform (e.g. strip a derived mirror rebuilt on load). */
			prepare?: (draft: TDraft) => TDraft;
			/** Local coherence fold, computed on the authored draft. */
			coherence?: (draft: TDraft) => SectionCoherenceResult;
		} = {}
	) {}

	async execute(
		draft: TDraft,
		opts?: SectionDraftSaveOptions
	): Promise<SaveSimpleSectionDraftResult | null> {
		const savedAt = this.clock.nowIso();
		const prepared = this.hooks.prepare ? this.hooks.prepare(draft) : draft;
		const revision = await this.drafts.save({ ...prepared, lastSavedAt: savedAt }, opts);
		if (revision === null) return null; // stale revision — the caller answers 409

		this.telemetry.emit({ type: `${this.section}.autosaved`, savedAt });
		if (!this.hooks.coherence) return { savedAt, revision };

		const coherence = this.hooks.coherence(draft);
		this.telemetry.emit({
			type: `${this.section}.local_coherence.computed`,
			score: coherence.score,
			issues: coherence.issues.map((i) => i.message)
		});
		return {
			savedAt,
			revision,
			coherenceScore: coherence.score,
			coherenceIssues: coherence.issues.slice(0, 20).map((i) => i.message)
		};
	}
}
