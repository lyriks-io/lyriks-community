import type { ClockPort, SectionDraftRepositoryPort, SectionDraftSaveOptions } from '../ports';

/** Minimal shape every section-document-backed Lyriks draft shares. */
export interface ResidueDraft {
	projectId: string;
	lastSavedAt: string | null;
}

/**
 * Generic load use-case for a pure Lyriks-owned draft: return the saved draft,
 * or a fresh empty one. Mirrors the per-capability Load*DraftUseCase for
 * sections with no bespoke read logic.
 */
export class LoadResidueDraftUseCase<T extends ResidueDraft> {
	constructor(
		private readonly repo: Pick<SectionDraftRepositoryPort<T>, 'load'>,
		private readonly empty: (projectId: string) => T
	) {}

	async execute(projectId: string): Promise<T> {
		return (await this.repo.load(projectId)) ?? this.empty(projectId);
	}
}

/**
 * Generic save use-case: stamp `lastSavedAt` from the clock and persist through
 * the atomic section-document save. Returns the saved timestamp and the new
 * revision (same contract as the bespoke Save*DraftUseCase results), or null
 * when the caller's revision went stale (the route answers 409).
 */
export class SaveResidueDraftUseCase<T extends ResidueDraft> {
	constructor(
		private readonly repo: SectionDraftRepositoryPort<T>,
		private readonly clock: ClockPort
	) {}

	async execute(
		draft: T,
		opts?: SectionDraftSaveOptions
	): Promise<{ savedAt: string; revision: number } | null> {
		const savedAt = this.clock.nowIso();
		const revision = await this.repo.save({ ...draft, lastSavedAt: savedAt }, opts);
		if (revision === null) return null;
		return { savedAt, revision };
	}
}
