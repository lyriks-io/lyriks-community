import { mintUuid } from '$domain/shared';
import { coherenceScoreOf } from '$domain/coherence/incoherence';
import { buildStatusByFeature, leafFeatures } from '$domain/features';
import {
	createEmptyBaselinesDraft,
	type Baseline,
	type ProjectBaselinesDraft
} from '$domain/baselines';
import { composeArtifacts } from './compose-specs';
import type { SpecLanguage } from '$domain/language';
import type {
	ClockPort,
	FeatureAcceptanceReaderPort,
	FeatureCoverageReaderPort,
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
} from '../use-cases/index';
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
		private readonly loadFoundation: Pick<LoadFoundationDraftUseCase, 'loadIdentity' | 'loadDefinition'>,
		private readonly loadUsers: Pick<LoadUsersDraftUseCase, 'execute'>,
		private readonly loadFeatures: Pick<LoadFeaturesDraftUseCase, 'execute'>,
		private readonly loadExperience: Pick<LoadExperienceDraftUseCase, 'execute'>,
		private readonly loadRules: Pick<LoadRulesDraftUseCase, 'execute'>,
		private readonly loadData: Pick<LoadDataDraftUseCase, 'execute'>,
		private readonly loadArchitecture: Pick<LoadArchitectureDraftUseCase, 'execute'>,
		private readonly loadDocuments: Pick<LoadResidueDraftUseCase<ProjectDocumentsDraft>, 'execute'>,
		/** The model's criteria, so the document prints the list the product counts. */
		private readonly acceptance: FeatureAcceptanceReaderPort,
		/** What the code holds of each feature: the requirements document prints it as its status. */
		private readonly coverage: FeatureCoverageReaderPort,
		/** The spec's language: the documents are written in it (English when absent). */
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>
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
		const [acceptanceCriteriaByFeature, lang, coverage] = await Promise.all([
			this.acceptance.byFeature(projectId),
			this.languageOf?.(projectId),
			// An unreadable coverage prints no status rather than stopping the documents.
			this.coverage.get(projectId).catch(() => null)
		]);
		const buildStatus = coverage ? buildStatusByFeature(features.features.map((f) => f.id), coverage) : undefined;
		const artifacts = composeArtifacts(
			{
				identity, definition, users, features, experience, rules, data, architecture, documents,
				acceptanceCriteriaByFeature,
				buildStatusByFeature: buildStatus
			},
			analysis,
			now,
			lang ?? 'en'
		);
		const requirements = artifacts.find((a) => a.kind === 'requirements_doc');

		const baseline: Baseline = {
			id: mintUuid(),
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
