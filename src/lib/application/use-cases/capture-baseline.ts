import { coherenceScoreOf } from '$domain/coherence/incoherence';
import { leafFeatures } from '$domain/features';
import {
	createEmptyBaselinesDraft,
	type Baseline,
	type ProjectBaselinesDraft
} from '$domain/baselines';
import { composeArtifacts } from '../compose-specs';
import type {
	ClockPort,
	GlobalCoherenceCheckerPort,
	SectionDraftRepositoryPort,
	SectionDraftSaveOptions
} from '../ports';
import type {
	LoadArchitectureDraftUseCase,
	LoadDataDraftUseCase,
	LoadExperienceDraftUseCase,
	LoadFeaturesDraftUseCase,
	LoadFoundationDraftUseCase,
	LoadRulesDraftUseCase,
	LoadUsersDraftUseCase,
	LoadResidueDraftUseCase
} from './index';
import type { ProjectDocumentsDraft } from '$domain/documents';

/**
 * Capture an immutable specification baseline. Unlike GenerateSpecs this has NO
 * green gate — a team baselines at discovery, design, or launch regardless of
 * readiness. Reuses the deterministic requirements-document composer for a
 * human-readable, diffable snapshot, and records the headline scores + counts.
 */
export class CaptureBaselineUseCase {
	constructor(
		private readonly repo: SectionDraftRepositoryPort<ProjectBaselinesDraft>,
		private readonly checker: GlobalCoherenceCheckerPort,
		private readonly clock: ClockPort,
		private readonly loadFoundation: LoadFoundationDraftUseCase,
		private readonly loadUsers: LoadUsersDraftUseCase,
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly loadExperience: LoadExperienceDraftUseCase,
		private readonly loadRules: LoadRulesDraftUseCase,
		private readonly loadData: LoadDataDraftUseCase,
		private readonly loadArchitecture: LoadArchitectureDraftUseCase,
		private readonly loadDocuments: LoadResidueDraftUseCase<ProjectDocumentsDraft>
	) {}

	async execute(
		projectId: string,
		name: string,
		note: string,
		save: SectionDraftSaveOptions
	): Promise<{ draft: ProjectBaselinesDraft; revision: number } | null> {
		const [analysis, identity, definition, users, features, experience, rules, data, architecture, documents] =
			await Promise.all([
				this.checker.analyze(projectId),
				this.loadFoundation.loadIdentity(projectId),
				this.loadFoundation.loadDefinition(projectId),
				this.loadUsers.execute(projectId),
				this.loadFeatures.execute(projectId),
				this.loadExperience.execute(projectId),
				this.loadRules.execute(projectId),
				this.loadData.execute(projectId),
				this.loadArchitecture.execute(projectId),
				this.loadDocuments.execute(projectId)
			]);

		const now = this.clock.nowIso();
		const artifacts = composeArtifacts(
			{ identity, definition, users, features, experience, rules, data, architecture, documents },
			analysis,
			now
		);
		const requirements = artifacts.find((a) => a.kind === 'requirements_doc');

		const baseline: Baseline = {
			id: crypto.randomUUID(),
			name: name.trim() || `Baseline ${now.slice(0, 10)}`,
			note: note.trim(),
			createdAt: now,
			readiness: analysis.readinessScore,
			coherence: coherenceScoreOf(analysis.gaps),
			featureCount: leafFeatures(features).length,
			content: requirements?.content ?? ''
		};

		const existing = (await this.repo.load(projectId)) ?? createEmptyBaselinesDraft(projectId);
		const updated: ProjectBaselinesDraft = {
			...existing,
			baselines: [baseline, ...existing.baselines],
			lastSavedAt: now
		};
		const revision = await this.repo.save(updated, save);
		return revision === null ? null : { draft: updated, revision };
	}
}
