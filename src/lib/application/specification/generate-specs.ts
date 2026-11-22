import {
	createEmptyCoherenceDraft,
	isGreen,
	type ProjectCoherenceDraft
} from '$domain/coherence';
import type {
	ClockPort,
	CoherenceDraftRepositoryPort,
	FeatureAcceptanceReaderPort,
	FeatureCoverageReaderPort,
	GlobalCoherenceCheckerPort,
	SectionDraftSaveOptions,
	TelemetryPort
} from '../ports';
import { buildStatusByFeature } from '$domain/features';
import { composeArtifacts } from './compose-specs';
import type { SpecLanguage } from '$domain/language';
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

export interface GenerateSpecsResult {
	ok: boolean;
	reason?: string;
	draft?: ProjectCoherenceDraft;
	revision?: number;
}

/**
 * Generates the structured Functional + Technical specs and the coherence
 * graph — but ONLY on a green, gap-free spec (the gate is enforced here too,
 * not just in the UI). Composes the artifacts deterministically from the whole
 * wizard envelope and persists them as the AI Generation Contract inputs.
 */
export class GenerateSpecsUseCase {
	constructor(
		private readonly drafts: CoherenceDraftRepositoryPort,
		private readonly checker: GlobalCoherenceCheckerPort,
		private readonly clock: ClockPort,
		private readonly telemetry: TelemetryPort,
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
		save: SectionDraftSaveOptions
	): Promise<GenerateSpecsResult> {
		const [existing, analysis] = await Promise.all([
			this.drafts.load(projectId),
			this.checker.analyze(projectId)
		]);
		const draft = existing ?? createEmptyCoherenceDraft(projectId);

		if (!isGreen(draft, analysis)) {
			return { ok: false, reason: 'Spec is not green: resolve blocking gaps and reach the threshold.' };
		}

		const [identity, definition, users, features, experience, rules, data, architecture, documents] =
			await Promise.all([
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
		const updated: ProjectCoherenceDraft = {
			...draft,
			artifacts,
			specsGenerated: true,
			generatedAt: now,
			lastSavedAt: now
		};
		const revision = await this.drafts.save(updated, save);
		if (revision === null) return { ok: false, reason: 'conflict' };

		this.telemetry.emit({
			type: 'coherence.specs.generated',
			artifactCount: artifacts.length
		});

		return { ok: true, draft: updated, revision };
	}
}
