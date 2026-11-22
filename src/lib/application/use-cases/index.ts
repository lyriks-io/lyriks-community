export { AnalyzeBriefUseCase, EmptyBriefError } from '../specification/analyze-brief';
export { SuggestFromSectionUseCase } from '../specification/suggest-from-section';
export { SuggestPersonasUseCase } from '../specification/suggest-personas';
export { SuggestFeaturesUseCase } from '../specification/suggest-features';
export {
	SubmitFeatureSuggestionsUseCase,
	SuggestionsBlockedError
} from '../specification/submit-feature-suggestions';
export { LoadSettingsUseCase } from '../operations/load-settings';
export { SaveSettingsUseCase } from '../operations/save-settings';
export { LoadFeedbackSettingsUseCase } from '../operations/load-feedback-settings';
export { LoadInstallConfigurationUseCase, type InstallConfigurationView } from '../operations/load-install-configuration';
export { SaveInstallConfigurationUseCase } from '../operations/save-install-configuration';
export { LoadAssistantSettingsUseCase } from '../operations/load-assistant-settings';
export { ConnectAssistantUseCase, type AssistantSettingsOutcome } from '../operations/connect-assistant';
export { SwitchAssistantUseCase } from '../operations/switch-assistant';
export { RemoveAssistantKeyUseCase } from '../operations/remove-assistant-key';
export { TestAssistantUseCase } from '../operations/test-assistant';
export { DrawDiagramWithAssistantUseCase, type DrawingOutcome } from '../evolution/draw-diagram-with-assistant';
export { WriteTextWithAssistantUseCase, type TextWritingOutcome } from '../operations/write-text-with-assistant';
export { LoadOperatorProfileUseCase } from '../operations/load-operator-profile';
export { ResolveActiveMemberNameUseCase } from '../collaboration/resolve-active-member-name';
export { SaveOperatorProfileUseCase } from '../operations/save-operator-profile';
export { SeedActivationDefaultsUseCase } from '../operations/seed-activation-defaults';
export { SyncBackLicenceUseCase } from '../operations/sync-back-licence';
export { CheckForUpdateUseCase } from '../operations/check-for-update';
export { LoadActivationUseCase } from '../operations/load-activation';
export { EditionInForce } from '../operations/edition-in-force';
export {
	ActivateLicenseUseCase,
	type ActivateLicenseResult,
	type ActivationFailure
} from '../operations/activate-license';
export { DeactivateLicenseUseCase } from '../operations/deactivate-license';
export { PreviewLicenseUseCase, type PreviewLicenseResult } from '../operations/preview-license';
export {
	RestorePreviousLicenseUseCase,
	type RestorePreviousLicenseResult,
	type RestorePreviousFailure
} from '../operations/restore-previous-license';
export { LoadInstallRegistrationUseCase } from '../operations/load-install-registration';
export { SyncBehaviorProjectUseCase } from '../specification/sync-behavior-project';
export { PushEnvelopeToBackUseCase } from '../operations/push-envelope-to-back';
export { DrainBackSyncOutboxUseCase } from '../operations/drain-back-sync-outbox';
export {
	LoadPlatformComponentsUseCase,
	type PlatformBuildInfo
} from '../operations/load-platform-components';
export { LoadKnowledgeGraphUseCase } from '../analysis/load-knowledge-graph';
export { ListProjectsUseCase } from '../portfolio/list-projects';
export { CreateProjectUseCase, type CreateProjectInput } from '../portfolio/create-project';
export {
	UpdateProjectUseCase,
	type UpdateProjectInput,
	type UpdateProjectResult
} from '../portfolio/update-project';
export { DeleteProjectUseCase } from '../portfolio/delete-project';
export { ListDomainsUseCase } from '../portfolio/list-domains';
export { CreateDomainUseCase } from '../portfolio/create-domain';
export { UpdateDomainUseCase, type UpdateDomainResult } from '../portfolio/update-domain';
export { RemoveDomainUseCase, type RemoveDomainResult } from '../portfolio/remove-domain';
export { ReorderDomainsUseCase, type ReorderDomainsResult } from '../portfolio/reorder-domains';
export { BuildPortfolioUseCase } from '../portfolio/build-portfolio';
export { SearchPortfolioUseCase, type SearchResult } from '../portfolio/search-portfolio';
export { LoadUsersDraftUseCase } from '../specification/load-users-draft';
export { SaveUsersDraftUseCase, type SaveUsersDraftResult } from '../specification/save-users-draft';
export {
	RefreshDerivedCapabilitiesUseCase,
	type DerivedCapabilitiesSnapshot
} from '../specification/refresh-derived-capabilities';
export { LoadFeaturesDraftUseCase } from '../specification/load-features-draft';
export { ListExtractedElementsUseCase } from '../retrospec/list-extracted-elements';
export { LoadFeatureMaturityUseCase, type FeatureMaturityRow } from '../analysis/load-feature-maturity';
export { LoadFeatureMaturityReportUseCase } from '../analysis/load-feature-maturity-report';
export { DetectFeatureIdCollisionUseCase } from '../specification/detect-feature-id-collision';
export {
	LoadImplementationCoverageUseCase,
	type ActionImplementationCoverage,
	type CriteriaTally,
	type FeatureImplementationCoverage
} from '../analysis/load-implementation-coverage';
export { LoadConformanceUseCase, type ImplementationCoverageReader } from '../analysis/load-conformance';
export {
	SweepImplementationGapsUseCase,
	type FeatureGapStats,
	type GapSweep
} from '../analysis/sweep-implementation-gaps';
export { FindIndexKeyOwnersUseCase, type KeyOwnersAnswer } from '../analysis/find-index-key-owners';
export { GuardIndexWriteUseCase, type GuardedIndexWrite, type IndexWriteOutcome } from '../analysis/guard-index-write';
export { MoveIndexPositionsUseCase, type PositionsOutcome } from '../analysis/move-index-positions';
export {
	SaveFeaturesDraftUseCase,
	type SaveFeaturesDraftResult
} from '../specification/save-features-draft';
export { ScoreFeaturesUseCase, type FeatureAdvice } from '../specification/score-features';
export { AssessFeatureUseCase, type FeatureAssessment } from '../analysis/assess-feature';
export { ReadActionDigestUseCase } from '../specification/read-action-digest';
export { ReadBehaviorFeatureUseCase } from '../specification/read-behavior-feature';
export {
	ScoreBehaviorFeatureUseCase,
	type ScoreBehaviorFeatureInput
} from '../specification/score-behavior-feature';
export {
	SimulateBehaviorUseCase,
	resolveWalkTarget,
	type SimulateBehaviorInput,
	type WalkTarget
} from '../analysis/simulate-behavior';
export { WhatIfUseCase, toDraftProofImpact, type WhatIfInput } from '../analysis/what-if';
export { ReadBehaviorOperationsUseCase } from '../specification/read-behavior-operations';
export {
	AuthorBehaviorUseCase,
	type AuthorBehaviorInput,
	type AuthorBehaviorResult,
	behaviorBatchErrors,
	behaviorBatchWarnings,
	canonicalBehaviorOperations
} from '../specification/author-behavior';
export {
	ResolveBehaviorContextUseCase,
	type ResolvedBehaviorContext
} from '../specification/resolve-behavior-context';
export { ComputeBehaviorAdvisoriesUseCase } from '../analysis/compute-behavior-advisories';
export { LoadExperienceDraftUseCase } from '../specification/load-experience-draft';
export {
	SaveExperienceDraftUseCase,
	type SaveExperienceDraftResult
} from '../specification/save-experience-draft';
export { LoadRulesDraftUseCase } from '../specification/load-rules-draft';
export { SaveRulesDraftUseCase, type SaveRulesDraftResult } from '../specification/save-rules-draft';
export { LoadGlossaryDraftUseCase } from '../specification/load-glossary-draft';
export { LoadSpecCorpusUseCase, collectProse } from '../specification/load-spec-corpus';
export {
	SaveSimpleSectionDraftUseCase,
	type SaveSimpleSectionDraftResult
} from '../specification/save-simple-section-draft';
export { LoadFoundationDraftUseCase } from '../specification/load-foundation-draft';
export { LoadSpecLanguageUseCase } from '../specification/load-spec-language';
export {
	SaveFoundationDraftUseCase,
	type SaveFoundationDraftResult,
	type SaveFoundationSliceResult
} from '../specification/save-foundation-draft';
export { LoadDataDraftUseCase } from '../specification/load-data-draft';
export { SaveDataDraftUseCase, type SaveDataDraftResult } from '../specification/save-data-draft';
export { SyncDataRulesUseCase, type SyncDataRulesResult } from '../specification/sync-data-rules';
export { ProjectRulesOracleUseCase, type OracleAnswer } from '../specification/project-rules-oracle';
export { ProveFeatureRulesUseCase } from '../analysis/prove-feature-rules';
export { TieDataFieldUseCase, type TieDataFieldResult, type LinkDataFieldsResult } from '../specification/tie-data-field';
export { ReadDataLinksUseCase, type DataLinkRow, type DataLinksReading } from '../specification/read-data-links';
export { ReadDataRulesUseCase, type DataRuleReading, type DataRulesReading, type DataRuleVerdict } from '../specification/read-data-rules';
export { experienceFeatureId } from '$application/projection/aux-feature-ids';
export {
	VerifyExperienceUseCase,
	DEFAULT_ENGINE_READ_BUDGETS,
	explorationCap,
	type EngineReadBudgets,
	type VerifyExperienceResult,
	type VerifyExperienceOptions,
	type JourneyVerification
} from '../specification/verify-experience';
export { LoadArchitectureDraftUseCase } from '../specification/load-architecture-draft';
export { LoadDocumentRegisterUseCase, foldLegacyReferenceDocs } from '../specification/load-document-register';
export { LoadCoherenceDraftUseCase, type CoherenceView } from '../analysis/load-coherence-draft';
export {
	ReadProjectHealthUseCase,
	type AnalysisState,
	type AnalysisStateReader,
	type HealthAuditReader,
	type HealthCoverageReader
} from '../analysis/read-project-health';
export {
	SaveCoherenceDraftUseCase,
	type SaveCoherenceDraftResult
} from '../analysis/save-coherence-draft';
export { GenerateSpecsUseCase, type GenerateSpecsResult } from '../specification/generate-specs';
export { LoadTeamUseCase } from '../collaboration/load-team';
export {
	AddCollaboratorUseCase,
	InvalidCollaboratorError,
	type AddCollaboratorRequest
} from '../collaboration/add-collaborator';
export {
	RemoveCollaboratorUseCase,
	type RemoveCollaboratorRequest
} from '../collaboration/remove-collaborator';
export {
	LoadResidueDraftUseCase,
	SaveResidueDraftUseCase,
	type ResidueDraft
} from '../specification/residue-draft-use-cases';
export {
	AssessProjectCompletenessUseCase,
	AuditProjectScopeUseCase,
	BuildCompletionEvidenceUseCase,
	FinishProjectUseCase,
	SaveScopeDraftUseCase
} from '../analysis/project-completion';
export { CaptureBaselineUseCase } from '../specification/capture-baseline';
export {
	LoadReuseLibraryUseCase,
	ExportRequirementUseCase,
	ImportRequirementUseCase,
	RemoveReuseTemplateUseCase
} from '../portfolio/reuse-requirements';
export {
	AuthorProjectBehaviorUseCase,
	type AuthorProjectBehaviorInput,
	type AuthorProjectBehaviorResult
} from '../specification/author-project-behavior';
export { ReadProjectBehaviorUseCase } from '../specification/read-project-behavior';
export { FindStateReferencesUseCase } from '../specification/find-state-references';
export { GenerateBehaviorTypesUseCase } from '../specification/generate-behavior-types';
