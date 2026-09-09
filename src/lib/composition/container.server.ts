import { DeleteBehaviorStateUseCase } from '$application/use-cases/delete-behavior-state';
import {
	AnalyzeBriefUseCase,
	GenerateSpecsUseCase,
	LoadArchitectureDraftUseCase,
	LoadDocumentRegisterUseCase,
	LoadCoherenceDraftUseCase,
	ListProjectsUseCase,
	CreateProjectUseCase,
	UpdateProjectUseCase,
	MarkProjectShippedUseCase,
	DeleteProjectUseCase,
	ListDomainsUseCase,
	CreateDomainUseCase,
	UpdateDomainUseCase,
	RemoveDomainUseCase,
	BuildPortfolioUseCase,
	SearchPortfolioUseCase,
	LoadDataDraftUseCase,
	LoadExperienceDraftUseCase,
	LoadFeaturesDraftUseCase,
	LoadFeatureMaturityUseCase,
	LoadFeatureMaturityReportUseCase,
	DetectFeatureIdCollisionUseCase,
	LoadImplementationCoverageUseCase,
	SweepImplementationGapsUseCase,
	ReconcileImplementationStatusesUseCase,
	AssessProjectCompletenessUseCase,
	AuditProjectScopeUseCase,
	BuildCompletionEvidenceUseCase,
	FinishProjectUseCase,
	SaveScopeDraftUseCase,
	LoadRulesDraftUseCase,
	LoadGlossaryDraftUseCase,
	LoadSupervisionDraftUseCase,
	LoadFinopsDraftUseCase,
	PushFinopsRulesUseCase,
	PullFinopsUsageUseCase,
	PushMemberKeysUseCase,
	PullMemberSpendUseCase,
	LoadFoundationDraftUseCase,
	SaveFoundationDraftUseCase,
	LoadSettingsUseCase,
	LoadFeedbackSettingsUseCase,
	LoadOperatorProfileUseCase,
	ResolveActiveMemberNameUseCase,
	SaveOperatorProfileUseCase,
	SeedActivationDefaultsUseCase,
	SyncBackLicenceUseCase,
	CheckForUpdateUseCase,
	LoadActivationUseCase,
	ActivateLicenseUseCase,
	DeactivateLicenseUseCase,
	PreviewLicenseUseCase,
	RestorePreviousLicenseUseCase,
	LoadInstallRegistrationUseCase,
	LoadUsersDraftUseCase,
	PushEnvelopeToBackUseCase,
	DrainBackSyncOutboxUseCase,
	LoadPlatformComponentsUseCase,
	LoadKnowledgeGraphUseCase,
	RefreshDerivedCapabilitiesUseCase,
	SaveCoherenceDraftUseCase,
	SaveDataDraftUseCase,
	SaveExperienceDraftUseCase,
	SaveFeaturesDraftUseCase,
	SaveRulesDraftUseCase,
	SaveSimpleSectionDraftUseCase,
	SaveSettingsUseCase,
	SaveFeedbackSettingsUseCase,
	SaveUsersDraftUseCase,
	ScoreFeaturesUseCase,
	AssessFeatureUseCase,
	ReadBehaviorFeatureUseCase,
	ScoreBehaviorFeatureUseCase,
	ReadBehaviorOperationsUseCase,
	AuthorBehaviorUseCase,
	ResolveBehaviorContextUseCase,
	ComputeBehaviorAdvisoriesUseCase,
	SubmitFeatureSuggestionsUseCase,
	SuggestFeaturesUseCase,
	SuggestFromSectionUseCase,
	SuggestPersonasUseCase,
	SyncBehaviorProjectUseCase,
	AnalyzeExperienceCoverageUseCase,
	SimulateExperienceUseCase,
	VerifyExperienceUseCase,
	DEFAULT_ENGINE_READ_BUDGETS,
	ImportDataCollectionsUseCase,
	GenerateAcceptanceTestsUseCase,
	GenerateRepoScaffoldUseCase,
	LoadTeamUseCase,
	AddCollaboratorUseCase,
	RemoveCollaboratorUseCase
} from '$application/use-cases';
import type {
	AuditLogPort,
	BackLinkRepositoryPort,
	BackSyncOutboxPort,
	BehaviorAdvisoryPort,
	BehaviorPort,
	CodeAdoptionPort,
	DataDraftRepositoryPort,
	DraftLockPort,
	SectionDocumentStorePort,
	FeatureBehavior,
	ProjectAccessPort,
	IdentityProviderPort,
	ProjectResidueRepositoryPort,
	Session,
	WorkspaceDirectoryPort,
	PortfolioRepositoryPort,
	FeatureMaturityScorerPort
} from '$application/ports';
import { tierFromPlan, tierHasFormalDpo, type Tier } from '$domain/tier/tier';
import { isLicenseEnforced } from '$domain/licensing';
import { displayNameFromLicenseCustomer } from '$domain/team/member-name';
import { env } from '$env/dynamic/private';
import { createRequire } from 'node:module';
import { dirname, resolve as pathResolve } from 'node:path';
import { SystemClock } from '$infrastructure/clock/system-clock';
import { NullUpdateFeed } from '$infrastructure/updates/null-update-feed.server';
import { RegistryUpdateFeed } from '$infrastructure/updates/registry-update-feed.server';
import { ConsoleTelemetry } from '$infrastructure/telemetry/console-telemetry';
import { StubAiSuggester } from '$infrastructure/ai/stub-ai-suggester';
import { RequestContextSessionAdapter } from '$infrastructure/auth/request-context-session.server';
import { SingleOperatorProjectAccess } from '$infrastructure/auth/single-operator-project-access.server';
import { SingleOperatorRoleGate } from '$infrastructure/auth/single-operator-role-gate.server';
import { LocalIdentityProvider } from '$infrastructure/auth/local-identity-provider.server';
import { StructuredAuditLog } from '$infrastructure/audit/structured-audit-log.server';
import { ConsoleToastNotifier } from '$infrastructure/notifier/console-toast';
import { buildPersistence } from '$infrastructure/persistence/persistence.server';
import { LocalGlobalCoherenceChecker } from '$application/local-global-coherence-checker';
import { DecisionAwareCoherenceChecker } from '$application/decision-aware-coherence-checker';
import type { ScoreHistory } from '$domain/coherence';
import { ProjectedKnowledgeGraphProvider } from '$application/projected-knowledge-graph';
import { MergedKnowledgeGraphProvider } from '$application/merged-knowledge-graph';
import { CachedBehaviorAdvisor } from '$lib/server/cached-behavior-advisor.server';
import { CachedFeatureAdvisor } from '$lib/server/cached-feature-advisor.server';
import { CachedImplementationCoverage } from '$lib/server/cached-implementation-coverage.server';
import { ResidueSnapshotStore } from '$lib/server/residue-snapshot-store.server';
import type { ClockPort, GlobalCoherenceCheckerPort, RoleGatePort } from '$application/ports';
import { LocalFsBehaviorRepository } from '$infrastructure/behavior/local-fs-behavior-repository.server';
import { FsReconciliationStore } from '$infrastructure/behavior/fs-reconciliation-store.server';
import { FsProjectLock } from '$infrastructure/behavior/fs-project-lock.server';
import { ReconcileProjectUseCase } from '$application/use-cases/reconcile-project';
import { PgProjectPortabilityStore } from '$infrastructure/persistence/postgres/pg-project-portability-store.server';
import { ZipArchiveCodec } from '$infrastructure/portability/zip-archive-codec.server';
import { sha256Hex } from '$infrastructure/portability/sha256.server';
import { ExportProjectUseCase } from '$application/use-cases/portability/export-project';
import { ImportProjectUseCase } from '$application/use-cases/portability/import-project';
import { LocalBehaviorPort } from '$infrastructure/behavior/local-behavior-port.server';
import { KernelFeaturesDraftRepository } from '$infrastructure/behavior/kernel-features-draft-repository.server';
import { KernelDataDraftRepository } from '$infrastructure/behavior/kernel-data-draft-repository.server';
import { KernelExperienceDraftRepository } from '$infrastructure/behavior/kernel-experience-draft-repository.server';
import { ResidueRulesDraftRepository } from '$infrastructure/persistence/residue-rules-draft-repository.server';
import { ResidueUsersDraftRepository } from '$infrastructure/persistence/residue-users-draft-repository.server';
import { SectionDocumentDraftRepository } from '$infrastructure/persistence/section-document-draft-repository.server';
import { txSectionChangePublisher } from '$lib/server/sync-bus.server';
import {
	LoadResidueDraftUseCase,
	SaveResidueDraftUseCase,
	CaptureBaselineUseCase,
	LoadReuseLibraryUseCase,
	ExportRequirementUseCase,
	ImportRequirementUseCase,
	RemoveReuseTemplateUseCase
} from '$application/use-cases';
import { createEmptyDocumentsDraft, type ProjectDocumentsDraft } from '$domain/documents';
// Simple-section wiring: each section's local coherence fold (and any pre-save
// transform) is bound to the ONE generic save use-case here, not in copies.
import { computeGlossaryCoherence, type ProjectGlossaryDraft } from '$domain/glossary';
import { computeSupervisionCoherence, type ProjectSupervisionDraft } from '$domain/supervision';
import { computeFinopsCoherence, type ProjectFinopsDraft } from '$domain/finops';
import { computeOperationsCoherence, type FoundationOperationsDraft } from '$domain/foundation';
import { computeArchitectureCoherence, type ProjectArchitectureDraft } from '$domain/architecture';
import { parseDocumentsDraft } from '$application/parse-documents-draft';
import { createEmptyBaselinesDraft, type ProjectBaselinesDraft } from '$domain/baselines';
import { parseBaselinesDraft } from '$application/parse-baselines-draft';
import { createEmptyApprovalsDraft, type ProjectApprovalsDraft } from '$domain/approvals';
import { parseApprovalsDraft } from '$application/parse-approvals-draft';
import type { ProjectScopeDraft } from '$domain/scope';
import { parseScopeDraft } from '$application/parse-scope-draft';
import { ProjectModelRevisionReader } from '$infrastructure/persistence/project-model-revision-reader.server';
import { SECTIONS } from '$lib/shared/sections';
import { ResidueTeamGateway } from '$infrastructure/team/residue-team-gateway.server';
import {
	EmptyKnowledgeGraphProvider,
	NoBackProbe,
	NoFormalVerdict,
	NoLicenceSync,
	NoMemberName,
	NoProjectMirror,
	NoWorkspaceDirectory
} from '$infrastructure/oss-defaults.server';
import { enterpriseOverlay, type OverlayContext } from './enterprise-overlay.server';
import type { EnterpriseHooks } from './enterprise-hooks';
import { FeaturesDraftUpstreamProvider } from '$infrastructure/upstream/features-draft-upstream-provider.server';
import { EngineFeatureMaturityScorer } from '$infrastructure/unspaghettit/engine-feature-maturity.server';
import { McpUnspaghettitAdvisor } from '$infrastructure/unspaghettit/mcp-unspaghettit-advisor.server';
import { UnspaEngineClient } from '$infrastructure/unspaghettit/unspa-engine-client.server';
import { DEFAULT_CALL_TIMEOUT_MS } from '$infrastructure/unspaghettit/unspa-engine-client.server';
import { CachedCompletionEvidence } from '$lib/server/cached-completion-evidence.server';
import { McpCodeAdoption } from '$infrastructure/unspaghettit/mcp-code-adoption.server';
import {
	declaredEngineVersion,
	platformBuildInfo
} from '$infrastructure/build/platform-build.server';
import { PgServerVersion } from '$infrastructure/persistence/postgres/pg-server-version.server';
import { HostFactsFile } from '$infrastructure/system/host-facts-file.server';
import { ProcessResources } from '$infrastructure/system/container-resources.server';
import { HttpLiteLLMGateway } from '$infrastructure/litellm/http-litellm-gateway.server';
import { NullLiteLLMGateway } from '$infrastructure/litellm/null-litellm-gateway';
import { Ed25519LicenseVerifier } from '$infrastructure/licensing/ed25519-license-verifier.server';
import { BundledSkillCatalog } from '$infrastructure/skills/bundled-skill-catalog.server';
import type { LiteLLMGatewayPort, SkillCatalogPort } from '$application/ports';

/**
 * Composition root (server-side). The ONE place that knows concrete adapters;
 * it wires them into use-cases and hands back ports-as-use-cases. To go to
 * production you swap an adapter here (PostgreSQL repository → another adapter,
 * StubAiSuggester → ClaudeAiSuggester) and nothing upstream changes.
 */
export interface AppServices {
	loadScopeDraft: LoadResidueDraftUseCase<ProjectScopeDraft>;
	saveScopeDraft: SaveScopeDraftUseCase;
	assessProjectCompleteness: AssessProjectCompletenessUseCase;
	auditProjectScope: AuditProjectScopeUseCase;
	finishProject: FinishProjectUseCase;
	loadFoundationDraft: LoadFoundationDraftUseCase;
	saveFoundationDraft: SaveFoundationDraftUseCase;
	loadUsersDraft: LoadUsersDraftUseCase;
	saveUsersDraft: SaveUsersDraftUseCase;
	loadFeaturesDraft: LoadFeaturesDraftUseCase;
	saveFeaturesDraft: SaveFeaturesDraftUseCase;
	/** Per-leaf behavioral maturity joined to Core + Release (Step 09 Readiness). */
	loadFeatureMaturity: LoadFeatureMaturityUseCase;
	/** One leaf's maturity WITH its failed checks, for the drawer's next-level card. */
	loadFeatureMaturityReport: LoadFeatureMaturityReportUseCase;
	/** Which other projects claim a feature id, so a write never crosses projects. */
	detectFeatureIdCollision: DetectFeatureIdCollisionUseCase;
	/** Cached per-leaf code-implementation coverage from the adoption sidecar:
	 *  instant read, per-leaf engine reads refreshed in the background (see
	 *  CachedImplementationCoverage). Fail-soft end to end. */
	implementationCoverage: CachedImplementationCoverage;
	/** Project-wide gap roll-up: which features still hold unlocated spec entities. */
	sweepImplementationGaps: SweepImplementationGapsUseCase;
	/** Plans coverage→status upgrades (never downgrades) so the roadmap follows
	 *  what code adoption found. Persistence stays with the server edge. */
	reconcileImplementationStatuses: ReconcileImplementationStatusesUseCase;
	/** The engine's behavioral-maturity scorer — pure, used by page-level summaries. */
	maturityScorer: FeatureMaturityScorerPort;
	loadExperienceDraft: LoadExperienceDraftUseCase;
	saveExperienceDraft: SaveExperienceDraftUseCase;
	loadRulesDraft: LoadRulesDraftUseCase;
	saveRulesDraft: SaveRulesDraftUseCase;
	loadGlossaryDraft: LoadGlossaryDraftUseCase;
	saveGlossaryDraft: SaveSimpleSectionDraftUseCase<ProjectGlossaryDraft>;
	/** The evidence register every citing capability reads (legacy architecture docs folded in). */
	loadDocumentRegister: LoadDocumentRegisterUseCase;
	saveDocumentsDraft: SaveResidueDraftUseCase<ProjectDocumentsDraft>;
	loadBaselinesDraft: LoadResidueDraftUseCase<ProjectBaselinesDraft>;
	saveBaselinesDraft: SaveResidueDraftUseCase<ProjectBaselinesDraft>;
	/** Capture an immutable spec baseline (server-side snapshot). */
	captureBaseline: CaptureBaselineUseCase;
	loadApprovalsDraft: LoadResidueDraftUseCase<ProjectApprovalsDraft>;
	saveApprovalsDraft: SaveResidueDraftUseCase<ProjectApprovalsDraft>;
	/** The workspace-shared requirement reuse library + its actions. */
	loadReuseLibrary: LoadReuseLibraryUseCase;
	exportRequirement: ExportRequirementUseCase;
	importRequirement: ImportRequirementUseCase;
	removeReuseTemplate: RemoveReuseTemplateUseCase;
	loadSupervisionDraft: LoadSupervisionDraftUseCase;
	saveSupervisionDraft: SaveSimpleSectionDraftUseCase<ProjectSupervisionDraft>;
	loadFinopsDraft: LoadFinopsDraftUseCase;
	saveFinopsDraft: SaveSimpleSectionDraftUseCase<ProjectFinopsDraft>;
	/** Provision the project's LiteLLM key from the active rules (opt-in gateway). */
	pushFinopsRules: PushFinopsRulesUseCase;
	/** Read the project's live LiteLLM spend back into the governor. */
	pullFinopsUsage: PullFinopsUsageUseCase;
	/** Provision one LiteLLM virtual key per Supervision member (opt-in gateway). */
	pushMemberKeys: PushMemberKeysUseCase;
	/** Read each member key's live spend back into the Supervision ledger. */
	pullMemberSpend: PullMemberSpendUseCase;
	/** Whether a LiteLLM proxy is configured (env-gated; false = air-gapped). */
	litellmGatewayAvailable(): boolean;
	/** The configured LiteLLM proxy base URL (empty when unavailable). */
	litellmGatewayBaseUrl(): string;
	loadDataDraft: LoadDataDraftUseCase;
	saveDataDraft: SaveDataDraftUseCase;
	loadArchitectureDraft: LoadArchitectureDraftUseCase;
	saveArchitectureDraft: SaveSimpleSectionDraftUseCase<ProjectArchitectureDraft>;
	loadCoherenceDraft: LoadCoherenceDraftUseCase;
	saveCoherenceDraft: SaveCoherenceDraftUseCase;
	generateSpecs: GenerateSpecsUseCase;
	/** The central knowledge graph (derived read model unifying every context). */
	loadKnowledgeGraph: LoadKnowledgeGraphUseCase;
	/** The REAL formal engine graph (DPO/MRS, read from Lyriks-back). */
	loadEngineKnowledgeGraph: LoadKnowledgeGraphUseCase;
	/** DEFAULT graph: local projection + unspa behavior + DPO verdict overlay. */
	loadMergedKnowledgeGraph: LoadKnowledgeGraphUseCase;
	/** Step-05 plan-coverage / readiness analysis (same report the UI shows). */
	analyzeExperienceCoverage: AnalyzeExperienceCoverageUseCase;
	/** Headless run of a prototype — drive a scripted flow, read back the trace. */
	simulateExperience: SimulateExperienceUseCase;
	/** Build-readiness verdict: coverage + per-journey simulation + acceptance spec. */
	verifyExperience: VerifyExperienceUseCase;
	/** Seed simulator collections from the real Step-07 data model (bulk import). */
	importDataCollections: ImportDataCollectionsUseCase;
	/** Generate runnable acceptance tests (Gherkin + Playwright) from the prototype. */
	generateAcceptanceTests: GenerateAcceptanceTestsUseCase;
	/** Generate a drop-in repo bundle (tests + config + CI + map) for any codebase. */
	generateRepoScaffold: GenerateRepoScaffoldUseCase;
	scoreFeatures: ScoreFeaturesUseCase;
	/** Cached per-leaf maturity advice for the Features tree — instant read, engine
	 *  scoring refreshed in the background (see CachedFeatureAdvisor). */
	featureAdvice: CachedFeatureAdvisor;
	/** Deep, on-demand Unspaghettit readout for one leaf feature (the leaf drawer). */
	assessFeature: AssessFeatureUseCase;
	readBehaviorFeature: ReadBehaviorFeatureUseCase;
	deleteBehaviorState: DeleteBehaviorStateUseCase;
	scoreBehaviorFeature: ScoreBehaviorFeatureUseCase;
	readBehaviorOperations: ReadBehaviorOperationsUseCase;
	/** Author behavior depth through the engine (the Lyriks MCP write path — Fix #1). */
	authorBehavior: AuthorBehaviorUseCase;
	/** Resolve a wizard id → its kernel address + depth (the id bridge — Fix #2). */
	resolveBehaviorContext: ResolveBehaviorContextUseCase;
	/**
	 * Code → spec: attach sources, trace spans, seed the spec↔code index.
	 *
	 * Exposed as the port rather than behind use-cases because every operation is
	 * a relay to the engine with nothing to decide — the policy that matters
	 * (who may touch which feature) lives in `requireBehaviorFeatureAccess` at the
	 * route, and the engine owns the rest. A use-case per method would be
	 * ceremony. Same call as `behaviorAdvisories` above.
	 */
	codeAdoption: CodeAdoptionPort;
	suggestFeatures: SuggestFeaturesUseCase;
	submitFeatureSuggestions: SubmitFeatureSuggestionsUseCase;
	loadSettings: LoadSettingsUseCase;
	saveSettings: SaveSettingsUseCase;
	loadFeedbackSettings: LoadFeedbackSettingsUseCase;
	saveFeedbackSettings: SaveFeedbackSettingsUseCase;
	/**
	 * Where the feedback dialog's ONLINE channel posts, or '' when that channel
	 * is off for this install. The call is made by the user's browser on an
	 * explicit send, never by this server (zero appliance egress either way).
	 */
	feedbackEndpoint(): string;
	/**
	 * Advisory check for a newer appliance release. Inert unless
	 * `LYRIKS_UPDATE_CHECK=1` — the shipped default performs no IO (air-gap).
	 */
	checkForUpdate: CheckForUpdateUseCase;
	loadOperatorProfile: LoadOperatorProfileUseCase;
	saveOperatorProfile: SaveOperatorProfileUseCase;
	/** Display name of the member driving the request (workspace member or solo builder). */
	resolveActiveMemberName: ResolveActiveMemberNameUseCase;
	/** Resolve the install's offline product-activation state (re-verified each call). */
	loadActivation: LoadActivationUseCase;
	/** Activate the product from a signed licence key (offline signature check). */
	activateLicense: ActivateLicenseUseCase;
	/** Seed empty install identity (operator name) from a freshly accepted licence. */
	seedActivationDefaults: SeedActivationDefaultsUseCase;
	/** Push the activated licence key to the Back's seat gate (best-effort). */
	syncBackLicence: SyncBackLicenceUseCase;
	/** What a key WOULD grant here, without storing it (try before you swap). */
	previewLicense: PreviewLicenseUseCase;
	/** Put the key superseded by the current one back in place. */
	restorePreviousLicense: RestorePreviousLicenseUseCase;
	/** Whether a superseded key exists to step back to (drives the affordance). */
	hasPreviousLicense(): Promise<boolean>;
	/** Clear the stored licence key from this install. */
	deactivateLicense: DeactivateLicenseUseCase;
	/** Code an operator can hand back to lyriks.io to register this installation. */
	loadInstallRegistration: LoadInstallRegistrationUseCase;
	/** True when activation is enforced (every declared edition) — gates the app. */
	licenseRequired(): boolean;
	/** Edition this install declares (LYRIKS_EDITION), or undefined for the MAP / dev. */
	installEdition(): string | undefined;
	advisorAvailable(): boolean;
	/** Cached unspa verify findings per project (the Issues board's engine feed). */
	behaviorAdvisories: BehaviorAdvisoryPort;
	/**
	 * Compute a project's derived layers once, now: the behavior advisories and,
	 * where the edition has the formal engine, its DPO verdict.
	 *
	 * Both are per-project side caches that fill on first read, which is fine for
	 * a project a human opened and wrong for one that just came into being: every
	 * reader that AVERAGES dimensions (coverage, readiness) would score it over
	 * the dimensions that happen to exist yet, and report a figure that has
	 * nothing to do with its content. A project minted as a copy of another must
	 * read the same as its original from the first render, so whoever mints it
	 * primes it first.
	 *
	 * Bounded and best-effort: a slow or absent engine leaves the caches to fill
	 * the usual way rather than holding up the request.
	 */
	primeProjectAnalysis(projectId: string): Promise<void>;
	featureBehavior(featureId: string): Promise<FeatureBehavior | null>;
	refreshDerivedCapabilities: RefreshDerivedCapabilitiesUseCase;
	analyzeBrief: AnalyzeBriefUseCase;
	suggestFromSection: SuggestFromSectionUseCase;
	suggestPersonas: SuggestPersonasUseCase;
	syncBehaviorProject: SyncBehaviorProjectUseCase;
	reconcileProject: ReconcileProjectUseCase;
	/** Package a whole project as one downloadable archive (rows + kernel + files). */
	exportProject: ExportProjectUseCase;
	/** Restore a project from such an archive — as a copy, or over its own id. */
	importProject: ImportProjectUseCase;
	pushEnvelopeToBack: PushEnvelopeToBackUseCase;
	/**
	 * Durable mirror scheduling (persistence-sync-remaining, item 5): record the
	 * project in the back-sync outbox, then kick a non-blocking drain so the
	 * happy path pushes as fast as the old direct mirror. No-op when the back
	 * mirror is not configured (standalone MAP — the outbox stays empty).
	 */
	scheduleBackSync(projectId: string): Promise<void>;
	/** Whether the Lyriks-back mirror is configured (LYRIKS_BACK_URL set). */
	backSyncConfigured(): boolean;
	/** Durable back-sync outbox — pending-gap surfacing on /readyz. */
	backSyncOutbox: BackSyncOutboxPort;
	/** Settings → Versions: what this install is made of, self-reported. */
	loadPlatformComponents: LoadPlatformComponentsUseCase;
	listProjects: ListProjectsUseCase;
	/**
	 * Does this project exist? A project comes into being when its Foundation
	 * identity draft is saved (see CreateProjectUseCase), so that draft's presence
	 * IS the answer — no catalog scan, one indexed read. Exposed as a capability
	 * rather than the repository, so callers can ask the question without gaining
	 * the power to write identity.
	 */
	projectExists(projectId: string): Promise<boolean>;
	createProject: CreateProjectUseCase;
	updateProject: UpdateProjectUseCase;
	markProjectShipped: MarkProjectShippedUseCase;
	deleteProject: DeleteProjectUseCase;
	listDomains: ListDomainsUseCase;
	createDomain: CreateDomainUseCase;
	updateDomain: UpdateDomainUseCase;
	removeDomain: RemoveDomainUseCase;
	buildPortfolio: BuildPortfolioUseCase;
	searchPortfolio: SearchPortfolioUseCase;
	currentSession(): Session;
	/** The one clock every server-side timestamp comes from. */
	clock: ClockPort;
	/** Dated score points per project, appended by the checker (see DecisionAwareCoherenceChecker). */
	scoreHistory: { load(projectId: string): Promise<ScoreHistory | null> };
	behaviorWorkspaceRoot(): string;
	/** Phase 0 (unify-unspa-kernel): the single behavior-kernel boundary — read
	 *  projection + apply ops. Wired inert until the Features flip (Phase 1). */
	behaviorPort: BehaviorPort;
	/** Phase 0: Lyriks-owned, section-keyed residue for non-behavioral facets. */
	projectResidue: ProjectResidueRepositoryPort;
	/** The product tier for this install, derived from the workspace plan. */
	currentTier(): Tier;
	/** Local-projectId → back-projectId map (for the Unspa dashboard deep-link). */
	backLinks: BackLinkRepositoryPort;
	/** Per-user project authorization (lyriks-back with the Back; the one operator without). */
	projectAccess: ProjectAccessPort;
	/** Who may write or open the MCP, judged from the session token (roles with the Back; the one operator without). */
	roleGate: RoleGatePort;
	/** Where accounts live: lyriks-back (Enterprise) or the platform's own operator account. */
	identity: IdentityProviderPort;
	/** Request-time extension points of the Enterprise overlay; null in the open-source build. */
	enterpriseHooks: EnterpriseHooks | null;
	/** Security/admin audit trail (structured stdout). */
	audit: AuditLogPort;
	/** Optimistic-locking version counter per (project, section) — legacy
	 *  sections only; consolidated sections carry their revision in-row. */
	draftLock: DraftLockPort;
	/** Consolidated section-document store (revision reads for page loads). */
	sectionDocuments: SectionDocumentStorePort;
	/** Readiness probe for the PostgreSQL datastore. */
	pingDatastore(): Promise<void>;
	/** The caller's workspaces ("teams"); none in the open-source build. */
	workspaces: WorkspaceDirectoryPort;
	/** Portfolio read-model (domains + per-project meta) — used by the domain guard. */
	portfolio: PortfolioRepositoryPort;
	/** Project contributors: the local residue, or the overlay's team gateway. */
	loadTeam: LoadTeamUseCase;
	addCollaborator: AddCollaboratorUseCase;
	removeCollaborator: RemoveCollaboratorUseCase;
	/** Bundled authoring skills (SKILL.md playbooks) — Settings → Skills + the MCP skill tools. */
	skillCatalog: SkillCatalogPort;
}

let services: AppServices | null = null;

/**
 * A duration read from the environment, in milliseconds. Anything absent or not
 * a positive number keeps the built-in default, so a typo in a compose file can
 * never disable a deadline (which is the one failure this knob must not have).
 */
function msEnv(name: string, fallback: number): number {
	const raw = Number((env[name] ?? '').trim());
	return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * How long priming a new project's derived layers may take before the caller
 * stops waiting (see `primeProjectAnalysis`). Long enough for the unspa verify
 * on a real project, short enough that an engine that never answers costs one
 * slow click and not a hung request.
 */
const PRIME_DEADLINE_MS = msEnv('LYRIKS_PRIME_ANALYSIS_TIMEOUT_MS', 15_000);

/** Resolve when the work does, or when the deadline passes. Never rejects. */
function withDeadline(work: Promise<unknown>, ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		void work
			.catch(() => {})
			.finally(() => {
				clearTimeout(timer);
				resolve();
			});
	});
}

/** Retry tick for the back-sync outbox drain (see startBackSyncDrain). */
const BACK_SYNC_DRAIN_INTERVAL_MS = 30_000;
let backSyncDrainTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Periodic drain of the durable back-sync outbox, plus one catch-up pass at
 * boot (as soon as the datastore answers — i.e. migrations applied) so a
 * restart after a Back outage closes the gap without waiting for a save.
 * The interval is unref'd so it never holds the process open; the use-case's
 * in-flight flag makes an overlapping tick a no-op.
 */
function startBackSyncDrain(drain: DrainBackSyncOutboxUseCase, ping: () => Promise<void>): void {
	if (backSyncDrainTimer) return;
	backSyncDrainTimer = setInterval(() => void drain.execute(), BACK_SYNC_DRAIN_INTERVAL_MS);
	backSyncDrainTimer.unref?.();
	// A boot-time datastore hiccup is fine — the next tick retries anyway.
	void ping()
		.then(() => drain.execute())
		.catch(() => {});
}

/**
 * Locate the `unspa-mcp` binary inside the installed `unspaghettit` npm
 * package. We resolve via `unspaghettit/package.json` (which IS exported)
 * and combine with the `bin` field — most package "exports" maps block
 * direct require.resolve of the inner .cjs file.
 */
const cjsRequire = createRequire(import.meta.url);
function resolveUnspaMcpBin(): string {
	const pkgPath = cjsRequire.resolve('unspaghettit/package.json');
	const pkg = cjsRequire(pkgPath) as { bin?: Record<string, string> };
	const rel = pkg.bin?.['unspa-mcp'] ?? './mcp-server/bin.cjs';
	return pathResolve(dirname(pkgPath), rel);
}

export function getServices(): AppServices {
	if (services) return services;

	// ── adapters (the only place infrastructure is named) ──
	// PostgreSQL persistence shared by Community and Enterprise deployments.
	// is selected here; every repo below is backend-agnostic behind its port.
	// The sync bus is handed in so consolidated-section saves publish their
	// change event inside the save transaction (Postgres bus) / after commit.
	const persistence = buildPersistence(txSectionChangePublisher);
	const {
		foundationIdentityDrafts,
		foundationDefinitionDrafts,
		usersDrafts: legacyUsersDrafts,
		featuresDrafts: legacyFeaturesDrafts,
		experienceDrafts: legacyExperienceDrafts,
		rulesDrafts: legacyRulesDrafts,
		glossaryDrafts,
		supervisionDrafts,
		finopsDrafts,
		foundationOperationsDrafts,
		architectureDrafts,
		coherenceDrafts,
		backLinks,
		projectCatalog,
		portfolio,
		settingsRepo,
		operatorProfileRepo,
		activationRepo,
		projectResidue
	} = persistence;
	const clock = new SystemClock();
	const telemetry = new ConsoleTelemetry();
	const audit = new StructuredAuditLog();
	// Offline product activation: a signed licence key is verified locally against
	// the bundled public key — NO network, so it works fully air-gapped. Enforcement
	// (the activation wall) follows the declared edition; only an install that
	// declares none (the standalone MAP, a dev server) can boot unlicensed.
	const licenseVerifier = new Ed25519LicenseVerifier();
	// The edition this install declares. It binds the key as well as the gate: a
	// licence must cover the declared edition, so a free Community key cannot
	// unlock an Enterprise appliance.
	const installEdition = env.LYRIKS_EDITION;
	// EVERY declared edition is gated, Community included: its key is free and
	// perpetual, and it is how an air-gapped product knows who runs it. The flag
	// may switch enforcement on for an install that declares nothing (the
	// standalone MAP); it may never switch it off for one that does.
	//
	// It used to be purely opt-in, which meant a single environment variable — one
	// line in a .env an operator owns, or a stray override in a compose file — took
	// the activation wall down on a paid, licensed install and left the whole app
	// reachable. That is not a setting an Enterprise deployment should be able to
	// hold: the licence is the entitlement, and the appliance runs on the
	// customer's own hardware where nothing else stops them. Enforcement therefore
	// derives from the edition the install declares, not from a switch beside it.
	const licenseRequired = isLicenseEnforced({
		edition: installEdition,
		flag: env.LYRIKS_LICENSE_REQUIRED,
		// Vite folds this to `false` in the shipped build, so no appliance can reach
		// the exemption; it only spares `pnpm dev:community` from the wall.
		dev: import.meta.env.DEV
	});
	// The running release = the image tag this container was deployed as, handed in
	// by the appliance compose (LYRIKS_VERSION: ${LYRIKS_TAG}). An install on a
	// moving tag (`latest`) or with nothing set stays "unknown" and is never told it
	// is behind — see resolveUpdateStatus.
	const runningVersion = env.LYRIKS_VERSION ?? env.LYRIKS_TAG ?? '';
	// Update check: OFF by default to hold the zero-runtime-egress guarantee. When
	// an operator opts in, we ask the SAME registry the install already pulls its
	// images from — no new egress destination, and an internal mirror keeps the
	// check inside the customer's network.
	const updateFeed =
		env.LYRIKS_UPDATE_CHECK === '1'
			? new RegistryUpdateFeed({
					registry: env.LYRIKS_REGISTRY ?? 'registry.lyriks.io/enterprise',
					image: 'lyriks-platform',
					username: env.LYRIKS_REGISTRY_USERNAME,
					password: env.LYRIKS_REGISTRY_PASSWORD
				})
			: new NullUpdateFeed();
	// Feedback relay: where the in-app dialog's ONLINE channel posts. This URL is
	// only ever handed to the BROWSER, which calls it on an explicit user send;
	// the appliance server itself never contacts it, so the zero-egress guarantee
	// is untouched. `LYRIKS_FEEDBACK_URL=off` removes the online channel entirely
	// (the dialog then offers mailto and copy only), and an operator can also
	// switch it off at runtime in Settings → Feedback.
	const feedbackUrlRaw = (env.LYRIKS_FEEDBACK_URL ?? 'https://get.lyriks.io/api/v1/feedback').trim();
	const feedbackEndpoint = feedbackUrlRaw === 'off' || feedbackUrlRaw === '0' ? '' : feedbackUrlRaw;
	// AI Cost Governor gateway seam. OFF by default (air-gapped): only when BOTH
	// LITELLM_GATEWAY_URL and LITELLM_MASTER_KEY are set do we wire the real proxy
	// adapter; otherwise the Null adapter keeps the governor local/advisory. No new
	// default egress — this is opt-in, matching the enterprise appliance posture.
	const litellmGateway: LiteLLMGatewayPort =
		env.LITELLM_GATEWAY_URL && env.LITELLM_MASTER_KEY
			? new HttpLiteLLMGateway(env.LITELLM_GATEWAY_URL, env.LITELLM_MASTER_KEY)
			: new NullLiteLLMGateway();
	const finopsCheapModel = env.LITELLM_CHEAP_MODEL ?? 'gpt-4o-mini';
	// AI seam: brief heuristics stay offline (the stub). Feature suggestions have
	// no backend at all — the operator's LLM pushes them through the MCP write
	// path, gated by the Settings switch.
	const ai = new StubAiSuggester();
	const session = new RequestContextSessionAdapter();
	const notifier = new ConsoleToastNotifier();
	void notifier; // surfaced on the client via SSR-injected adapter; reference here pins the port wiring.
	// Behavior shells live in the shared kernel folder
	// `data/unspa/<kernel_project_id>/`. For wizard projects that id is always the
	// immutable local project id, whether the optional back service is running or
	// not.
	// `LYRIKS_UNSPA_ROOT` relocates that store (default `data/unspa`). It exists for
	// engine development: pointed at a COPY of the store, a locally-built
	// unspaghettit (UNSPAGHETTIT_MCP_BIN) can be exercised against real projects
	// without its writes reaching the canonical kernel. Deployments leave it unset.
	const localBehavior = new LocalFsBehaviorRepository(env.LYRIKS_UNSPA_ROOT || undefined);
	// The immutable local project id is the shared kernel identity. Lyriks-back
	// stores that same value as `kernel_project_id`; its own UUID is only a
	// transport/catalog identity and must never select a second filesystem folder.
	const behavior = localBehavior;
	// unify-unspa-kernel: the single kernel write boundary + the Lyriks residue store.
	// Community-safe — LocalBehaviorPort.apply persists the unspa-format kernel
	// with the back and DPO off (pure node:fs via `behavior`); residue stays in the
	// same PostgreSQL database used when Enterprise services are enabled.
	const behaviorPort = new LocalBehaviorPort(behavior, clock);
	// Reconciliation engine: folds legacy slug/UUID twins into the canonical local
	// project folder. Addresses the raw kernel store by exact folder key under an
	// exclusive per-project FS lock. On-demand only —
	// never runs at startup; execution is opt-in and stops on any real conflict.
	const reconciliationStore = new FsReconciliationStore(localBehavior.workspaceRoot());
	const projectLock = new FsProjectLock(localBehavior.workspaceRoot());
	const reconcileProject = new ReconcileProjectUseCase(reconciliationStore, projectLock, backLinks, clock);
	// Portability: a project as one downloadable archive. Reads and writes at
	// storage level (rows + kernel folder), *below* the section repositories —
	// those project the kernel, so a copy taken through them would re-derive the
	// project instead of copying it. Reuses the reconciliation store for the
	// kernel half: its staged-then-swapped promote is already the atomic folder
	// write an import needs.
	const portabilityStore = new PgProjectPortabilityStore();
	const archiveCodec = new ZipArchiveCodec();
	// Pure Lyriks-owned capabilities (no unspa kernel projection): one generic
	// repo per section over the consolidated project_section_documents store
	// (atomic save + revision in-row, like every other simple section).
	const documentsDrafts = new SectionDocumentDraftRepository(
		persistence.sectionDocuments,
		'documents',
		parseDocumentsDraft
	);
	const baselinesDrafts = new SectionDocumentDraftRepository(
		persistence.sectionDocuments,
		'baselines',
		parseBaselinesDraft
	);
	const approvalsDrafts = new SectionDocumentDraftRepository(
		persistence.sectionDocuments,
		'approvals',
		parseApprovalsDraft
	);
	const scopeDrafts = new SectionDocumentDraftRepository(
		persistence.sectionDocuments,
		'scope',
		parseScopeDraft
	);
	// Phase 1 — FEATURES flipped: the section now reads a projection of the kernel
	// (+ residue) and writes via BehaviorPort.apply, replacing the legacy draft-as-
	// truth and the sync-features-to-unspaghettit use-case. Same port → every
	// consumer (page, experience, coherence, scoring, …) is unchanged; the legacy
	// draft (`legacyFeaturesDrafts`) is kept only to backfill a pre-kernel project.
	const featuresDrafts = new KernelFeaturesDraftRepository(
		behaviorPort,
		projectResidue,
		legacyFeaturesDrafts
	);
	// Phase 4 — USERS flipped onto the generalized residue store: its behavioral half
	// (actor personas) already reaches the kernel via the Experience projection, so
	// this is residue-backed only — no BehaviorPort (mirrors Rules). Same port →
	// consumers unchanged; the old section document (`legacyUsersDrafts`) backfills once.
	const usersDrafts = new ResidueUsersDraftRepository(projectResidue, legacyUsersDrafts);
	// Phase 4 — EXPERIENCE flipped: load = residue (authored builder/journeys/library)
	// ⋈ the kernel's journey layer overlaid on top, so surfaces/actions/transitions
	// authored in unspa round-trip into the page (two-way binding); save projects the
	// behavior graph via BehaviorPort.apply (+ the Core-bridge mirror into consuming
	// leaves), retiring sync-experience-to-unspaghettit. Needs features (leaf mirror)
	// and users (actor-roles → personas). Built before dataDrafts, which reads it.
	const experienceDrafts = new KernelExperienceDraftRepository(
		behaviorPort,
		projectResidue,
		featuresDrafts,
		usersDrafts,
		legacyExperienceDrafts,
		// Lazy: dataDrafts is constructed just below (it reads experienceDrafts), so
		// the thunk closes over the binding and only resolves it at save time — the
		// Core-bridge re-mirror on an Experience save (Fix #5).
		() => dataDrafts,
		foundationDefinitionDrafts
	);
	// Phase 2 — DATA flipped: the section now reads a projection of the kernel's
	// central "Data Model" feature (+ residue) and writes via BehaviorPort.apply,
	// including the Core-bridge mirror into consuming leaf features. This retires
	// sync-data-to-unspaghettit. Same port → every consumer is unchanged.
	// Explicit port type breaks the type-inference cycle with experienceDrafts (which
	// closes over dataDrafts via the lazy re-mirror thunk).
	const dataDrafts: DataDraftRepositoryPort = new KernelDataDraftRepository(
		behaviorPort,
		projectResidue,
		foundationDefinitionDrafts,
		experienceDrafts,
		featuresDrafts
	);
	// Rules keeps its editable issue/scenario residue here; scenario acceptance criteria
	// are projected through BehaviorPort on save. The old section document backfills once.
	const rulesDrafts = new ResidueRulesDraftRepository(projectResidue, behaviorPort, legacyRulesDrafts);
	// Step 03's UpstreamCapabilityProviderPort: backed by the real Step 04 draft
	// (features), the Step 05 draft (journeys + pages) and the behavior kernel
	// (the dialogs/panels/forms that never become a page). Every half of the
	// matrix is now live.
	const upstream = new FeaturesDraftUpstreamProvider(featuresDrafts, experienceDrafts, behavior);

	// Unspaghettit engine as advisor — spawned as a stdio subprocess on first
	// query. We resolve the bin from the installed `unspaghettit` npm package so
	// production / CLI distribution works without sibling-repo path hacks.
	// Snapshots root is the same directory the behavior repo writes to, so the
	// engine and v3 share one view of the workspace.
	const unspaghettitBin = env.UNSPAGHETTIT_MCP_BIN ?? resolveUnspaMcpBin();
	const engineConfig = {
		mcpBinPath: unspaghettitBin,
		snapshotsRoot: behavior.workspaceRoot(),
		platformVersion: runningVersion || 'dev',
		// Ceiling for any single engine call. Deliberately below the request budget
		// an HTTP caller has, and tunable from the compose file so an install with
		// an unusually large model can be tuned without a new image.
		callTimeoutMs: msEnv('LYRIKS_ENGINE_CALL_TIMEOUT_MS', DEFAULT_CALL_TIMEOUT_MS)
	};
	// Two engine subprocesses over the same folder, split by who is waiting:
	//  - `advisor` answers a person: the leaf drawer, verify_experience, authoring.
	//  - `laneAdvisor` serves the background lane (coverage, advice, advisories),
	//    which re-reads every leaf of a project at once. On one shared stdio
	//    connection those bursts queued a drawer open behind seconds of model
	//    checking; on its own subprocess the lane can take as long as it needs.
	// The engine reads its store from disk on every call and validates what it
	// parsed by (inode, size, mtime), so the two processes never hold a stale
	// view of each other's writes.
	const advisor = new McpUnspaghettitAdvisor(engineConfig);
	const laneAdvisor = new McpUnspaghettitAdvisor(
		engineConfig,
		new UnspaEngineClient(engineConfig, 'unspa-lane')
	);
	// Code → spec rides the interactive subprocess (a sync answers the caller);
	// the coverage tier's reads ride the lane's.
	const codeAdoption = new McpCodeAdoption(advisor.engine);
	const laneCodeAdoption = new McpCodeAdoption(laneAdvisor.engine);
	// Product tier for this install (OSS / paid / enterprise). Single source: the
	// workspace plan. Read once here and surfaced via currentTier() so the shell
	// (sidebar gating, locked capabilities) and the tier-aware adapter swaps below
	// agree. Process-wide for now (single-tenant); becomes a per-request arg later.
	const workspacePlan = env.LYRIKS_BACK_DEV_PLAN ?? 'free';
	const tier: Tier = tierFromPlan(workspacePlan);
	// Hoisted (also served as `services.loadActivation`): the overlay needs it
	// to name the operator's workspace after the licence's customer.
	const loadActivation = new LoadActivationUseCase(
		activationRepo,
		licenseVerifier,
		clock,
		installEdition
	);
	// Project contributors, kept in the local project residue: the open-source
	// product has people to assign work to without any companion service.
	const localTeam = new ResidueTeamGateway(projectResidue);

	// ── The Enterprise overlay, if compiled in ──
	// The open-source tree is composed from ports that carry a single-operator
	// default: no project mirror, no formal verdict, no workspaces, the local
	// operator account. The overlay hands back its adapters for those same ports
	// here, BEFORE the use-cases are built, so nothing below branches on edition.
	const overlay = enterpriseOverlay();
	const overlayContext: OverlayContext = {
		env,
		tier,
		clock,
		audit,
		session,
		backLinks,
		projectResidue,
		preferredWorkspaceName: async () => {
			const view = await loadActivation.execute().catch(() => null);
			return displayNameFromLicenseCustomer(view?.entitlements?.customer ?? '');
		},
		localTeam,
		localBehavior,
		projectCatalog,
		loadExperienceDraft: (projectId) => loadExperienceDraft.execute(projectId),
		drafts: {
			foundationIdentity: foundationIdentityDrafts,
			foundationDefinition: foundationDefinitionDrafts,
			foundationOperations: foundationOperationsDrafts,
			users: usersDrafts,
			features: featuresDrafts,
			experience: experienceDrafts,
			rules: rulesDrafts,
			data: dataDrafts,
			architecture: architectureDrafts,
			coherence: coherenceDrafts
		}
	};
	const overlayPorts = overlay?.ports(overlayContext) ?? {};
	const identity: IdentityProviderPort =
		overlayPorts.identity ?? new LocalIdentityProvider(env.LYRIKS_JWT_SECRET ?? '');
	const projectMirror = overlayPorts.projectMirror ?? new NoProjectMirror();
	const formalVerdict = overlayPorts.formalVerdict ?? new NoFormalVerdict();
	const workspaces = overlayPorts.workspaces ?? new NoWorkspaceDirectory();
	const memberName = overlayPorts.memberName ?? new NoMemberName();
	// Feed a companion licence gate with the activated key (Enterprise: the
	// Back's seat gate). Inert without one.
	const syncBackLicence = new SyncBackLicenceUseCase(
		activationRepo,
		overlayPorts.licenceSync ?? new NoLicenceSync(),
		clock
	);
	// Settings → Versions: every component reports its OWN version (the engine
	// through its handshake, the back through its unauthenticated health/readiness
	// endpoints, PostgreSQL through the server banner). Nothing here is a
	// hand-kept number, and the probes only reach components this install already
	// talks to — no new egress.
	const loadPlatformComponents = new LoadPlatformComponentsUseCase(
		platformBuildInfo(env),
		advisor,
		overlayPorts.backProbe ?? new NoBackProbe(),
		new PgServerVersion(),
		clock,
		declaredEngineVersion(),
		// The machine itself, which this process cannot see: the appliance kit
		// reads it on the host at install and at every update and leaves the
		// record here, mounted read-only. LYRIKS_HOST_FACTS_FILE only exists so a
		// developer can point at a sample; the appliance never sets it.
		new HostFactsFile(env.LYRIKS_HOST_FACTS_FILE || undefined),
		new ProcessResources()
	);

	// Load use-cases extracted as consts so the global-coherence checker (Step 09)
	// can reuse them to aggregate every earlier step.
	const loadFoundationDraft = new LoadFoundationDraftUseCase(
		foundationIdentityDrafts,
		foundationDefinitionDrafts,
		foundationOperationsDrafts
	);
	const loadUsersDraft = new LoadUsersDraftUseCase(usersDrafts);
	const loadFeaturesDraft = new LoadFeaturesDraftUseCase(featuresDrafts);
	// Project team (collaborators): the enterprise back when connected, otherwise a
	// local residue team so the standalone product still has people to assign work
	// to. Hoisted so the portfolio/search use-cases apply the per-project scope.
	const teamGateway = overlayPorts.teamGateway ?? localTeam;
	const loadTeam = new LoadTeamUseCase(teamGateway);
	// Behavioral maturity comes from the ENGINE's own scorer (exported pure from
	// the unspaghettit package), so the platform never re-implements its weights.
	const maturityScorer = new EngineFeatureMaturityScorer();
	// Per-feature maturity for the Behavior Maturity reading — same ports the coherence
	// checker uses (features draft + behavior shells), read per-leaf here.
	const loadFeatureMaturity = new LoadFeatureMaturityUseCase(
		loadFeaturesDraft,
		behavior,
		maturityScorer
	);
	// Same two ports, one feature at a time, keeping the failed checks so the
	// leaf drawer can list what would raise its readiness level.
	const loadFeatureMaturityReport = new LoadFeatureMaturityReportUseCase(behavior, maturityScorer);
	// The engine addresses features globally; this reads the store's own folders
	// to say whether the id a caller sent belongs to somebody else.
	const detectFeatureIdCollision = new DetectFeatureIdCollisionUseCase(behavior);
	const loadImplementationCoverage = new LoadImplementationCoverageUseCase(
		loadFeaturesDraft,
		laneCodeAdoption,
		behavior
	);
	// The last snapshot is kept in the project residue so a restarted process
	// shows the chips at once instead of after a whole background cycle.
	const implementationCoverage = new CachedImplementationCoverage(loadImplementationCoverage, {
		store: new ResidueSnapshotStore(projectResidue, 'features-implementation')
	});
	const sweepImplementationGaps = new SweepImplementationGapsUseCase(loadFeaturesDraft, codeAdoption);
	// Reads coverage FRESH (not through the cache): it runs right after a sync
	// and must see what that sync just wrote.
	const reconcileImplementationStatuses = new ReconcileImplementationStatusesUseCase(
		loadFeaturesDraft,
		loadImplementationCoverage
	);
	const loadExperienceDraft = new LoadExperienceDraftUseCase(experienceDrafts, featuresDrafts);
	const loadRulesDraft = new LoadRulesDraftUseCase(
		rulesDrafts,
		foundationDefinitionDrafts,
		usersDrafts,
		experienceDrafts
	);
	const loadDataDraft = new LoadDataDraftUseCase(dataDrafts, experienceDrafts);
	const loadArchitectureDraft = new LoadArchitectureDraftUseCase(
		architectureDrafts,
		foundationDefinitionDrafts,
		dataDrafts
	);
	// Mirrors a project's metadata into the Unspaghettit workspace (the
	// Docker-shipped OSS dashboard). Hoisted to a const so project CREATION can
	// fire it too — not just the per-step save routes.
	const syncBehaviorProject = new SyncBehaviorProjectUseCase(
		behavior,
		projectMirror,
		clock,
		foundationDefinitionDrafts
	);

	// Step 09's global checker. The local aggregator is always the safety net;
	// when the back mirror is enabled (LYRIKS_BACK_URL set), we ENRICH it with
	// the formal Rust DPO engine's verdict (read through the back) — formal
	// violations become blocking gaps, a `formal` dimension folds into readiness.
	// If the engine is down/unwired we degrade to local alone. Single wiring,
	// no use-case/UI change — the seam is `GlobalCoherenceCheckerPort`.
	const loadGlossaryDraft = new LoadGlossaryDraftUseCase(glossaryDrafts);
	const localChecker = new LocalGlobalCoherenceChecker(
		loadFoundationDraft,
		loadUsersDraft,
		loadFeaturesDraft,
		loadExperienceDraft,
		loadRulesDraft,
		loadDataDraft,
		loadArchitectureDraft,
		loadGlossaryDraft,
		behavior,
		maturityScorer
	);
	// Behavior (unspa) advisory tier — cached read served instantly on every load,
	// the heavy verify runs in the background and pushes over live-sync. Independent
	// of the DPO, so it enriches the checker whether or not the back is wired.
	const behaviorAdvisories = new CachedBehaviorAdvisor(
		new ComputeBehaviorAdvisoriesUseCase(laneAdvisor, behavior),
		{ store: new ResidueSnapshotStore(projectResidue, 'features-advisories') }
	);
	// Per-leaf maturity scoring, cached the same way: the Features tree reads a
	// snapshot instantly and the heavy per-leaf engine scoring runs in the
	// background, pushing over live-sync when it lands (see CachedFeatureAdvisor).
	const featureAdvice = new CachedFeatureAdvisor(
		new ScoreFeaturesUseCase(featuresDrafts, laneAdvisor, behavior),
		{ store: new ResidueSnapshotStore(projectResidue, 'features-advice') }
	);
	// Always wrap with the enriched checker. Formal reads are policy-gated to
	// Enterprise even if a back URL is accidentally configured on another tier;
	// local and unspa coherence remain available to Community.
	const enrichedChecker: GlobalCoherenceCheckerPort =
		overlayPorts.wrapGlobalChecker?.(localChecker, { behaviorAdvisories }) ?? localChecker;
	// Outermost: traced decisions leave the open list here (so every score
	// agrees), and each analysis worth keeping appends a dated point to the
	// project's score history (what the Control Center draws over time).
	const scoreHistory = new ResidueSnapshotStore<ScoreHistory>(projectResidue, 'score-history');
	const globalChecker: GlobalCoherenceCheckerPort = new DecisionAwareCoherenceChecker(
		enrichedChecker,
		coherenceDrafts,
		scoreHistory,
		clock,
		(err) => console.warn('[coherence] decisions/history unavailable:', err)
	);

	// The central knowledge graph — a derived read model that folds every
	// per-context draft into one node/edge graph (the "Knowledge Base graph"
	// of the platform diagram). Drafts stay authoritative; this projects
	// them on demand. Swappable for an engine-backed provider via the same port.
	const knowledgeGraph = new ProjectedKnowledgeGraphProvider(
		loadFoundationDraft,
		loadFeaturesDraft,
		loadUsersDraft,
		loadExperienceDraft,
		loadDataDraft,
		loadRulesDraft,
		loadArchitectureDraft,
		clock,
		globalChecker,
		upstream
	);
	// Engine-backed variant of the SAME port: Enterprise-only DPO/MRS graph read
	// from Lyriks-back. Other tiers and unavailable engines yield an empty graph.
	const engineKnowledgeGraph =
		overlayPorts.engineKnowledgeGraph ?? new EmptyKnowledgeGraphProvider(() => clock.nowIso());
	// The default explorer view: wizard projection + readable unspa behavior +
	// the DPO verdict, in one graph (raw engine substrate stays on ?source=engine).
	const mergedKnowledgeGraph = new MergedKnowledgeGraphProvider(
		knowledgeGraph,
		behavior,
		formalVerdict,
		clock,
		(err) => console.warn('[graph] merged overlay degraded (best-effort):', err),
		overlayPorts.formalVerdict !== undefined
	);
	const loadScopeDraft = new LoadResidueDraftUseCase(scopeDrafts, (projectId) =>
		parseScopeDraft(null, projectId)
	);
	const loadDocumentRegister = new LoadDocumentRegisterUseCase(
		documentsDrafts,
		architectureDrafts
	);
	const loadApprovalsDraft = new LoadResidueDraftUseCase(
		approvalsDrafts,
		createEmptyApprovalsDraft
	);
	const loadCoherenceDraft = new LoadCoherenceDraftUseCase(coherenceDrafts, globalChecker);
	const verifyExperience = new VerifyExperienceUseCase(
		loadExperienceDraft,
		loadUsersDraft,
		loadDataDraft,
		advisor,
		{
			readMs: msEnv('LYRIKS_ENGINE_READ_BUDGET_MS', DEFAULT_ENGINE_READ_BUDGETS.readMs),
			explorationMs: msEnv(
				'LYRIKS_ENGINE_EXPLORATION_BUDGET_MS',
				DEFAULT_ENGINE_READ_BUDGETS.explorationMs
			),
			explorationWork: msEnv(
				'LYRIKS_ENGINE_EXPLORATION_WORK',
				DEFAULT_ENGINE_READ_BUDGETS.explorationWork
			)
		}
	);
	const projectModelRevision = new ProjectModelRevisionReader(
		SECTIONS.filter((section) => section !== 'scope'),
		persistence.sectionDocuments,
		persistence.draftLock
	);
	// The gate, the audit and the finish all read the SAME evidence; a caller that
	// retries reads it again. Memoizing it on the model's own fingerprints is what
	// turns closing a project into one computation instead of one per call.
	const completionEvidence = new CachedCompletionEvidence(
		new BuildCompletionEvidenceUseCase(
			loadDocumentRegister,
			loadApprovalsDraft,
			loadCoherenceDraft,
			loadFeatureMaturity,
			loadDataDraft,
			verifyExperience,
			projectModelRevision
		),
		projectModelRevision,
		(projectId) => localBehavior.kernelSignature(projectId)
	);
	const assessProjectCompleteness = new AssessProjectCompletenessUseCase(
		loadScopeDraft,
		completionEvidence
	);

	// Hoisted so the data-collection import can reuse the same save + push path the
	// experience autosave uses. The Experience adapter now projects the behavior graph
	// on save (Phase 4), so there is no separate sync-experience step to fire.
	const saveExperienceDraft = new SaveExperienceDraftUseCase(experienceDrafts, clock, telemetry);
	const pushEnvelopeToBack = new PushEnvelopeToBackUseCase(
		foundationIdentityDrafts,
		scopeDrafts,
		foundationDefinitionDrafts,
		usersDrafts,
		featuresDrafts,
		experienceDrafts,
		rulesDrafts,
		dataDrafts,
		architectureDrafts,
		coherenceDrafts,
		foundationOperationsDrafts,
		glossaryDrafts,
		documentsDrafts,
		baselinesDrafts,
		approvalsDrafts,
		supervisionDrafts,
		finopsDrafts,
		projectMirror,
		backLinks,
		behaviorPort,
		(projectId) => localBehavior.kernelSignature(projectId)
	);

	// Durable back-sync outbox (persistence-sync-remaining, item 5): every save
	// records its project (scheduleBackSync below) and this worker retries the
	// envelope push with backoff until Back has caught up. Armed only when the
	// back mirror is configured — standalone MAP never enqueues and never ticks.
	const drainBackSyncOutbox = new DrainBackSyncOutboxUseCase(
		persistence.backSyncOutbox,
		pushEnvelopeToBack
	);
	if (projectMirror.enabled) {
		startBackSyncDrain(drainBackSyncOutbox, persistence.ping);
	}

	// ── use-cases (depend on ports only) ──
	// The operations slice rides the generic section-document save under its
	// namespaced storage/sync key; the folded Foundation use-case wraps it.
	const saveOperationsDraft = new SaveSimpleSectionDraftUseCase<FoundationOperationsDraft>(
		'foundation.operations',
		foundationOperationsDrafts,
		clock,
		telemetry,
		{ coherence: computeOperationsCoherence }
	);
	const saveFoundationDraft = new SaveFoundationDraftUseCase(
		foundationIdentityDrafts,
		foundationDefinitionDrafts,
		clock,
		telemetry,
		saveOperationsDraft
	);
	const deletionPolicy = tierHasFormalDpo(tier)
		? overlayPorts.stateDeletionCheck ?? { checkStateDeletion: async () => null }
		: undefined;
	const deleteBehaviorState = new DeleteBehaviorStateUseCase(behaviorPort, advisor, deletionPolicy);
	const built: AppServices = {
		loadScopeDraft,
		saveScopeDraft: new SaveScopeDraftUseCase(scopeDrafts, clock),
		assessProjectCompleteness,
		auditProjectScope: new AuditProjectScopeUseCase(
			scopeDrafts,
			loadScopeDraft,
			completionEvidence,
			clock,
			session
		),
		finishProject: new FinishProjectUseCase(
			scopeDrafts,
			loadScopeDraft,
			completionEvidence,
			clock,
			session
		),
		loadFoundationDraft,
		saveFoundationDraft,
		loadUsersDraft,
		saveUsersDraft: new SaveUsersDraftUseCase(usersDrafts, clock, telemetry, upstream),
		loadFeaturesDraft,
		loadFeatureMaturity,
		loadFeatureMaturityReport,
		detectFeatureIdCollision,
		implementationCoverage,
		sweepImplementationGaps,
		reconcileImplementationStatuses,
		maturityScorer,
		saveFeaturesDraft: new SaveFeaturesDraftUseCase(featuresDrafts, clock, telemetry),
		loadExperienceDraft,
		saveExperienceDraft,
		loadRulesDraft,
		saveRulesDraft: new SaveRulesDraftUseCase(
			rulesDrafts,
			clock,
			telemetry,
			foundationDefinitionDrafts,
			usersDrafts,
			experienceDrafts
		),
		loadGlossaryDraft,
		saveGlossaryDraft: new SaveSimpleSectionDraftUseCase<ProjectGlossaryDraft>('glossary', glossaryDrafts, clock, telemetry, {
			coherence: computeGlossaryCoherence
		}),
		loadDocumentRegister,
		saveDocumentsDraft: new SaveResidueDraftUseCase(documentsDrafts, clock),
		loadBaselinesDraft: new LoadResidueDraftUseCase(baselinesDrafts, createEmptyBaselinesDraft),
		saveBaselinesDraft: new SaveResidueDraftUseCase(baselinesDrafts, clock),
		loadApprovalsDraft,
		saveApprovalsDraft: new SaveResidueDraftUseCase(approvalsDrafts, clock),
		loadReuseLibrary: new LoadReuseLibraryUseCase(projectResidue),
		exportRequirement: new ExportRequirementUseCase(
			projectResidue,
			loadFeaturesDraft,
			loadFoundationDraft,
			clock
		),
		importRequirement: new ImportRequirementUseCase(
			projectResidue,
			loadFeaturesDraft,
			new SaveFeaturesDraftUseCase(featuresDrafts, clock, telemetry)
		),
		removeReuseTemplate: new RemoveReuseTemplateUseCase(projectResidue),
		captureBaseline: new CaptureBaselineUseCase(
			baselinesDrafts,
			globalChecker,
			clock,
			loadFoundationDraft,
			loadUsersDraft,
			loadFeaturesDraft,
			loadExperienceDraft,
			loadRulesDraft,
			loadDataDraft,
			loadArchitectureDraft,
			new LoadResidueDraftUseCase(documentsDrafts, createEmptyDocumentsDraft)
		),
		loadSupervisionDraft: new LoadSupervisionDraftUseCase(supervisionDrafts),
		saveSupervisionDraft: new SaveSimpleSectionDraftUseCase<ProjectSupervisionDraft>(
			'supervision',
			supervisionDrafts,
			clock,
			telemetry,
			{ coherence: computeSupervisionCoherence }
		),
		loadFinopsDraft: new LoadFinopsDraftUseCase(finopsDrafts),
		// Draft-only coherence (live signals aren't available server-side); the
		// client shows the signal-aware score. Good enough for the autosave trail.
		saveFinopsDraft: new SaveSimpleSectionDraftUseCase<ProjectFinopsDraft>('finops', finopsDrafts, clock, telemetry, {
			coherence: computeFinopsCoherence
		}),
		pushFinopsRules: new PushFinopsRulesUseCase(
			finopsDrafts,
			litellmGateway,
			clock,
			telemetry,
			finopsCheapModel
		),
		pullFinopsUsage: new PullFinopsUsageUseCase(finopsDrafts, litellmGateway, clock, telemetry),
		pushMemberKeys: new PushMemberKeysUseCase(supervisionDrafts, litellmGateway, clock, telemetry),
		pullMemberSpend: new PullMemberSpendUseCase(supervisionDrafts, litellmGateway, clock, telemetry),
		litellmGatewayAvailable: () => litellmGateway.available,
		litellmGatewayBaseUrl: () => litellmGateway.baseUrl,
		loadDataDraft,
		saveDataDraft: new SaveDataDraftUseCase(dataDrafts, clock, telemetry),
		loadArchitectureDraft,
		saveArchitectureDraft: new SaveSimpleSectionDraftUseCase<ProjectArchitectureDraft>(
			'architecture',
			architectureDrafts,
			clock,
			telemetry,
			{
				// Don't persist the recomputed derived mirror — it's rebuilt on load.
				prepare: (d) => ({ ...d, derivedTech: [] }),
				coherence: computeArchitectureCoherence
			}
		),
		loadCoherenceDraft,
		saveCoherenceDraft: new SaveCoherenceDraftUseCase(
			coherenceDrafts,
			globalChecker,
			clock,
			telemetry
		),
		generateSpecs: new GenerateSpecsUseCase(
			coherenceDrafts,
			globalChecker,
			clock,
			telemetry,
			loadFoundationDraft,
			loadUsersDraft,
			loadFeaturesDraft,
			loadExperienceDraft,
			loadRulesDraft,
			loadDataDraft,
			loadArchitectureDraft,
			new LoadResidueDraftUseCase(documentsDrafts, createEmptyDocumentsDraft)
		),
		loadKnowledgeGraph: new LoadKnowledgeGraphUseCase(knowledgeGraph),
		loadEngineKnowledgeGraph: new LoadKnowledgeGraphUseCase(engineKnowledgeGraph),
		loadMergedKnowledgeGraph: new LoadKnowledgeGraphUseCase(mergedKnowledgeGraph),
		analyzeExperienceCoverage: new AnalyzeExperienceCoverageUseCase(
			loadExperienceDraft,
			loadUsersDraft,
			loadDataDraft
		),
		simulateExperience: new SimulateExperienceUseCase(loadExperienceDraft),
		verifyExperience,
		importDataCollections: new ImportDataCollectionsUseCase(
			loadExperienceDraft,
			loadDataDraft,
			saveExperienceDraft,
			pushEnvelopeToBack
		),
		generateAcceptanceTests: new GenerateAcceptanceTestsUseCase(loadExperienceDraft),
		generateRepoScaffold: new GenerateRepoScaffoldUseCase(loadExperienceDraft),
		scoreFeatures: new ScoreFeaturesUseCase(featuresDrafts, advisor, behavior),
		featureAdvice,
		assessFeature: new AssessFeatureUseCase(advisor),
		readBehaviorFeature: new ReadBehaviorFeatureUseCase(behaviorPort),
		deleteBehaviorState,
		scoreBehaviorFeature: new ScoreBehaviorFeatureUseCase(advisor),
		readBehaviorOperations: new ReadBehaviorOperationsUseCase(advisor),
		authorBehavior: new AuthorBehaviorUseCase(advisor, deleteBehaviorState),
		codeAdoption,
		resolveBehaviorContext: new ResolveBehaviorContextUseCase(advisor),
		suggestFeatures: new SuggestFeaturesUseCase(featuresDrafts, projectResidue, settingsRepo),
		submitFeatureSuggestions: new SubmitFeatureSuggestionsUseCase(projectResidue, settingsRepo),
		loadSettings: new LoadSettingsUseCase(settingsRepo),
		saveSettings: new SaveSettingsUseCase(settingsRepo),
		loadFeedbackSettings: new LoadFeedbackSettingsUseCase(settingsRepo),
		saveFeedbackSettings: new SaveFeedbackSettingsUseCase(settingsRepo),
		checkForUpdate: new CheckForUpdateUseCase(updateFeed, runningVersion, clock),
		loadOperatorProfile: new LoadOperatorProfileUseCase(operatorProfileRepo),
		saveOperatorProfile: new SaveOperatorProfileUseCase(operatorProfileRepo),
		resolveActiveMemberName: new ResolveActiveMemberNameUseCase(
			session,
			memberName,
			operatorProfileRepo
		),
		loadActivation,
		activateLicense: new ActivateLicenseUseCase(
			activationRepo,
			licenseVerifier,
			clock,
			audit,
			installEdition
		),
		seedActivationDefaults: new SeedActivationDefaultsUseCase(
			operatorProfileRepo,
			tier !== 'enterprise'
		),
		syncBackLicence,
		previewLicense: new PreviewLicenseUseCase(activationRepo, licenseVerifier, clock, installEdition),
		restorePreviousLicense: new RestorePreviousLicenseUseCase(
			activationRepo,
			licenseVerifier,
			clock,
			audit,
			installEdition
		),
		hasPreviousLicense: async () => (await activationRepo.loadPrevious()) !== null,
		deactivateLicense: new DeactivateLicenseUseCase(activationRepo, audit),
		loadInstallRegistration: new LoadInstallRegistrationUseCase(activationRepo, clock),
		licenseRequired: () => licenseRequired,
		installEdition: () => installEdition,
		advisorAvailable: () => advisor.available,
		behaviorAdvisories,
		primeProjectAnalysis: async (projectId: string) => {
			// Concurrent on purpose: the checker reads the advisories too, and the
			// advisor coalesces, so the two calls share the one verify.
			await Promise.allSettled([
				withDeadline(behaviorAdvisories.prime(projectId), PRIME_DEADLINE_MS),
				// `force` is what makes the engine recompute the DPO verdict for a
				// project it has never seen; the checker itself decides whether this
				// edition is entitled to ask.
				withDeadline(globalChecker.analyze(projectId, { force: true }), PRIME_DEADLINE_MS)
			]);
		},
		featureBehavior: (featureId: string) => advisor.getFeatureBehavior(featureId),
		refreshDerivedCapabilities: new RefreshDerivedCapabilitiesUseCase(upstream),
		analyzeBrief: new AnalyzeBriefUseCase(ai, telemetry),
		suggestFromSection: new SuggestFromSectionUseCase(ai, telemetry),
		suggestPersonas: new SuggestPersonasUseCase(ai),
		syncBehaviorProject,
		reconcileProject,
		exportProject: new ExportProjectUseCase(
			portabilityStore,
			reconciliationStore,
			portfolio,
			archiveCodec,
			clock,
			sha256Hex,
			runningVersion || 'dev'
		),
		importProject: new ImportProjectUseCase(
			portabilityStore,
			reconciliationStore,
			behavior,
			projectCatalog,
			portfolio,
			projectLock,
			archiveCodec,
			clock
		),
		pushEnvelopeToBack,
		// Enqueue is awaited (durable before we answer the caller's fire-and-forget
		// promise); the drain kick is deliberately detached — it must never slow a
		// save, and its outcome lands on the outbox row / back link, not here.
		scheduleBackSync: async (projectId: string) => {
			if (!projectMirror.enabled) return;
			await persistence.backSyncOutbox.enqueue(projectId);
			void drainBackSyncOutbox.execute();
		},
		backSyncConfigured: () => projectMirror.enabled,
		backSyncOutbox: persistence.backSyncOutbox,
		loadPlatformComponents,
		listProjects: new ListProjectsUseCase(projectCatalog),
		projectExists: async (projectId) => (await foundationIdentityDrafts.load(projectId)) !== null,
		createProject: new CreateProjectUseCase(
			foundationIdentityDrafts,
			clock,
			portfolio,
			syncBehaviorProject
		),
		updateProject: new UpdateProjectUseCase(
			foundationIdentityDrafts,
			clock,
			portfolio,
			syncBehaviorProject,
			persistence.draftLock
		),
		markProjectShipped: new MarkProjectShippedUseCase(portfolio, clock),
		deleteProject: new DeleteProjectUseCase(projectCatalog, behavior, projectMirror, teamGateway),
		listDomains: new ListDomainsUseCase(portfolio),
		createDomain: new CreateDomainUseCase(portfolio, clock),
		updateDomain: new UpdateDomainUseCase(portfolio),
		removeDomain: new RemoveDomainUseCase(portfolio),
		buildPortfolio: new BuildPortfolioUseCase(
			projectCatalog,
			portfolio,
			localChecker,
			loadFeaturesDraft,
			backLinks,
			loadTeam,
			loadFoundationDraft
		),
		searchPortfolio: new SearchPortfolioUseCase(
			projectCatalog,
			loadFeaturesDraft,
			backLinks,
			loadTeam,
			portfolio
		),
		currentSession: () => session.current(),
		clock,
		scoreHistory,
		behaviorWorkspaceRoot: () => behavior.workspaceRoot(),
		behaviorPort,
		projectResidue,
		currentTier: () => tier,
		feedbackEndpoint: () => feedbackEndpoint,
		backLinks,
		projectAccess: overlayPorts.projectAccess ?? new SingleOperatorProjectAccess(),
		roleGate: overlayPorts.roleGate ?? new SingleOperatorRoleGate(),
		identity,
		enterpriseHooks: overlayPorts.hooks ?? null,
		audit,
		draftLock: persistence.draftLock,
		sectionDocuments: persistence.sectionDocuments,
		pingDatastore: persistence.ping,
		workspaces,
		portfolio,
		loadTeam,
		addCollaborator: new AddCollaboratorUseCase(teamGateway),
		removeCollaborator: new RemoveCollaboratorUseCase(teamGateway),
		// Authoring skills are bundled into the server build — no runtime IO (air-gap).
		skillCatalog: new BundledSkillCatalog()
	};
	services = built;
	overlay?.attach(built, overlayContext);
	return built;
}
