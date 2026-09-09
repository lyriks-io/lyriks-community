import {
	createEmptyCoherenceDraft,
	isGreen,
	type ProjectCoherenceDraft
} from '$domain/coherence';
import type {
	ClockPort,
	CoherenceDraftRepositoryPort,
	GlobalCoherenceCheckerPort,
	SectionDraftSaveOptions,
	TelemetryPort
} from '../ports';
import { composeArtifacts } from '../compose-specs';
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
		const artifacts = composeArtifacts(
			{ identity, definition, users, features, experience, rules, data, architecture, documents },
			analysis,
			now
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
