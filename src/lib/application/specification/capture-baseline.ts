import { mintUuid } from '$domain/shared';
import { createEmptyBaselinesDraft, type Baseline, type ProjectBaselinesDraft } from '$domain/baselines';
import type { ClockPort, SectionDraftRepositoryPort, SectionDraftSaveOptions } from '../ports';

/**
 * Record the baseline of a milestone of the specification: its name and the
 * moment, nothing else (criterion 1eb35bd3). The version of the specification
 * is counted from these baselines; the newest comes first.
 */
export class CaptureBaselineUseCase {
	constructor(
		private readonly repo: SectionDraftRepositoryPort<ProjectBaselinesDraft>,
		private readonly clock: ClockPort
	) {}

	async execute(projectId: string, name: string, save: SectionDraftSaveOptions): Promise<{ draft: ProjectBaselinesDraft; revision: number } | null> {
		const now = this.clock.nowIso();
		const baseline: Baseline = { id: mintUuid(), name, createdAt: now };
		const existing = (await this.repo.load(projectId)) ?? createEmptyBaselinesDraft(projectId);
		const updated: ProjectBaselinesDraft = { ...existing, baselines: [baseline, ...existing.baselines], lastSavedAt: now };
		const revision = await this.repo.save(updated, save);
		return revision === null ? null : { draft: updated, revision };
	}
}
