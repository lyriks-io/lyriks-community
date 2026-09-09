import type { Tier } from '$domain/tier/tier';
import type { StateDeletionCheckPort } from '$application/ports/state-deletion-check';
import type { ProjectExperienceDraft } from '$domain/experience';
import type {
	ArchitectureDraftRepositoryPort,
	AuditLogPort,
	BackLicenceSyncPort,
	BehaviorRepositoryPort,
	CoherenceDraftRepositoryPort,
	DataDraftRepositoryPort,
	ExperienceDraftRepositoryPort,
	FeaturesDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	FoundationIdentityRepositoryPort,
	FoundationOperationsRepositoryPort,
	ProjectCatalogPort,
	RulesDraftRepositoryPort,
	UsersDraftRepositoryPort,
	BackLinkRepositoryPort,
	BackSystemProbePort,
	BehaviorAdvisoryPort,
	ClockPort,
	FormalVerdictPort,
	GlobalCoherenceCheckerPort,
	IdentityProviderPort,
	KnowledgeGraphProviderPort,
	ProjectAccessPort,
	ProjectMirrorPort,
	ProjectResidueRepositoryPort,
	RoleGatePort,
	SessionPort,
	TeamGatewayPort,
	WorkspaceDirectoryPort,
	WorkspaceMemberNamePort
} from '$application/ports';
import type { Capability } from '$ui/shell/capabilities';
import type { EnterpriseHooks } from './enterprise-hooks';

/**
 * The seam between the open-source composition root and the Enterprise
 * overlay (`ee/`, copied to `src/lib/ee` by `pnpm ee:link`).
 *
 * The open-source tree composes every use-case from ports that carry a
 * single-operator default: no project mirror, no formal verdict, no workspaces,
 * a local operator account. The overlay, when compiled in, hands back the
 * Enterprise adapters for those same ports BEFORE the use-cases are built, so
 * the composition itself never branches on edition. What the overlay needs to
 * build them travels in `OverlayContext`.
 */
export interface OverlayContext {
	readonly env: Record<string, string | undefined>;
	readonly tier: Tier;
	readonly clock: ClockPort;
	readonly audit: AuditLogPort;
	readonly session: SessionPort;
	readonly backLinks: BackLinkRepositoryPort;
	readonly projectResidue: ProjectResidueRepositoryPort;
	/** The name the licence gives the customer, for a workspace created on first run. */
	readonly preferredWorkspaceName: () => Promise<string>;
	readonly localTeam: TeamGatewayPort;
	readonly localBehavior: BehaviorRepositoryPort;
	readonly projectCatalog: ProjectCatalogPort;
	/** Resolved lazily: the draft loaders are built after the overlay is consulted. */
	readonly loadExperienceDraft: (projectId: string) => Promise<ProjectExperienceDraft>;
	/** The per-section draft repositories the Community reclaim copies from. */
	readonly drafts: {
		readonly foundationIdentity: FoundationIdentityRepositoryPort;
		readonly foundationDefinition: FoundationDefinitionRepositoryPort;
		readonly foundationOperations: FoundationOperationsRepositoryPort;
		readonly users: UsersDraftRepositoryPort;
		readonly features: FeaturesDraftRepositoryPort;
		readonly experience: ExperienceDraftRepositoryPort;
		readonly rules: RulesDraftRepositoryPort;
		readonly data: DataDraftRepositoryPort;
		readonly architecture: ArchitectureDraftRepositoryPort;
		readonly coherence: CoherenceDraftRepositoryPort;
	};
}

/** Ports the overlay may replace. Anything omitted keeps its open-source default. */
export interface OverlayPorts {
	identity?: IdentityProviderPort;
	projectAccess?: ProjectAccessPort;
	/** Who may write or open the MCP, from the session token; the one operator by default. */
	roleGate?: RoleGatePort;
	projectMirror?: ProjectMirrorPort;
	licenceSync?: BackLicenceSyncPort;
	backProbe?: BackSystemProbePort;
	formalVerdict?: FormalVerdictPort;
	stateDeletionCheck?: StateDeletionCheckPort;
	engineKnowledgeGraph?: KnowledgeGraphProviderPort;
	teamGateway?: TeamGatewayPort;
	workspaces?: WorkspaceDirectoryPort;
	memberName?: WorkspaceMemberNamePort;
	hooks?: EnterpriseHooks;
	capabilities?: Capability[];
	/** Wrap the heuristic checker with the formal verdict; built late, once the drafts exist. */
	wrapGlobalChecker?: (
		local: GlobalCoherenceCheckerPort,
		deps: { behaviorAdvisories: BehaviorAdvisoryPort }
	) => GlobalCoherenceCheckerPort;
}

export interface EnterpriseOverlay {
	/** The adapters this overlay contributes, from what the composition root already built. */
	ports(ctx: OverlayContext): OverlayPorts;
	/**
	 * Called once the open-source services exist, so the overlay can build the
	 * services its own routes use (member administration, reclaim) on top of them.
	 */
	attach(services: unknown, ctx: OverlayContext): void;
}

// Vite resolves the glob at build time: an empty object in the open-source
// tree (the file does not exist), the overlay's module when it is linked in.
const modules = import.meta.glob<{ overlay: EnterpriseOverlay }>('/src/lib/ee/register.server.ts', {
	eager: true
});

/** The Enterprise overlay compiled into this build, or null (open source). */
export function enterpriseOverlay(): EnterpriseOverlay | null {
	const found = Object.values(modules)[0];
	return found?.overlay ?? null;
}
