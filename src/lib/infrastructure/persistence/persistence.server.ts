import type {
	ArchitectureDraftRepositoryPort,
	BackLinkRepositoryPort,
	BackSyncOutboxPort,
	CoherenceDraftRepositoryPort,
	DataDraftRepositoryPort,
	DraftLockPort,
	FoundationIdentityRepositoryPort,
	ExperienceDraftRepositoryPort,
	FeaturesDraftRepositoryPort,
	FinopsDraftRepositoryPort,
	FoundationOperationsRepositoryPort,
	ActivationRepositoryPort,
	FoundationDefinitionRepositoryPort,
	GlossaryDraftRepositoryPort,
	PortfolioRepositoryPort,
	ProjectCatalogPort,
	ProjectResidueRepositoryPort,
	RulesDraftRepositoryPort,
	SettingsRepositoryPort,
	OperatorProfileRepositoryPort,
	SectionChangePublisher,
	SectionDocumentStorePort,
	SupervisionDraftRepositoryPort,
	UsersDraftRepositoryPort
} from '$application/ports';

// PostgreSQL is the single platform datastore in Community and Enterprise.
import { pgQuery } from './postgres/pg-database.server';
import { buildPgDraftRepositories } from './postgres/pg-draft-repositories.server';
import { PgBackLinkRepository } from './postgres/pg-back-link-repository.server';
import { PgProjectCatalogRepository } from './postgres/pg-project-catalog-repository.server';
import { PgPortfolioRepository } from './postgres/pg-portfolio-repository.server';
import { PgDraftLock } from './postgres/pg-draft-lock.server';
import { PgSettingsRepository } from './postgres/pg-settings-repository.server';
import { PgOperatorProfileRepository } from './postgres/pg-operator-profile-repository.server';
import { PgActivationRepository } from './postgres/pg-activation-repository.server';
import { PgProjectResidueRepository } from './postgres/pg-project-residue-repository.server';
import { PgSectionDocumentStore } from './postgres/pg-section-documents.server';
import { PgBackSyncOutbox } from './postgres/pg-back-sync-outbox.server';

/** Every persistence port the composition root wires, backend-agnostic. */
export interface Persistence {
	readonly foundationIdentityDrafts: FoundationIdentityRepositoryPort;
	readonly foundationDefinitionDrafts: FoundationDefinitionRepositoryPort;
	readonly usersDrafts: UsersDraftRepositoryPort;
	readonly featuresDrafts: FeaturesDraftRepositoryPort;
	readonly experienceDrafts: ExperienceDraftRepositoryPort;
	readonly rulesDrafts: RulesDraftRepositoryPort;
	readonly glossaryDrafts: GlossaryDraftRepositoryPort;
	readonly supervisionDrafts: SupervisionDraftRepositoryPort;
	readonly finopsDrafts: FinopsDraftRepositoryPort;
	readonly foundationOperationsDrafts: FoundationOperationsRepositoryPort;
	readonly dataDrafts: DataDraftRepositoryPort;
	readonly architectureDrafts: ArchitectureDraftRepositoryPort;
	readonly coherenceDrafts: CoherenceDraftRepositoryPort;
	readonly backLinks: BackLinkRepositoryPort;
	/** Durable back-mirror retry record (one coalescing row per project). */
	readonly backSyncOutbox: BackSyncOutboxPort;
	readonly projectCatalog: ProjectCatalogPort;
	readonly portfolio: PortfolioRepositoryPort;
	readonly settingsRepo: SettingsRepositoryPort;
	readonly operatorProfileRepo: OperatorProfileRepositoryPort;
	readonly activationRepo: ActivationRepositoryPort;
	readonly projectResidue: ProjectResidueRepositoryPort;
	readonly draftLock: DraftLockPort;
	/** Consolidated store for the simple sections (atomic save, revision in-row). */
	readonly sectionDocuments: SectionDocumentStorePort;
	/** Readiness probe for PostgreSQL (throws if it cannot answer). */
	readonly ping: () => Promise<void>;
}

/**
 * Build the platform persistence layer. Both Community and Enterprise start on
 * PostgreSQL, so enabling enterprise services never requires a data migration.
 * The section-change publisher (from the sync bus) is injected so a
 * consolidated-section save can broadcast inside its own transaction.
 */
export function buildPersistence(sectionChanges: SectionChangePublisher): Persistence {
	const sectionDocuments = new PgSectionDocumentStore(sectionChanges);
	const d = buildPgDraftRepositories(sectionDocuments);
	return {
		foundationIdentityDrafts: d.foundationIdentity,
		foundationDefinitionDrafts: d.foundationDefinition,
		usersDrafts: d.users,
		featuresDrafts: d.features,
		experienceDrafts: d.experience,
		rulesDrafts: d.rules,
		glossaryDrafts: d.glossary,
		supervisionDrafts: d.supervision,
		finopsDrafts: d.finops,
		foundationOperationsDrafts: d.foundationOperations,
		dataDrafts: d.data,
		architectureDrafts: d.architecture,
		coherenceDrafts: d.coherence,
		backLinks: new PgBackLinkRepository(),
		backSyncOutbox: new PgBackSyncOutbox(),
		projectCatalog: new PgProjectCatalogRepository(),
		portfolio: new PgPortfolioRepository(),
		settingsRepo: new PgSettingsRepository(),
		operatorProfileRepo: new PgOperatorProfileRepository(),
		activationRepo: new PgActivationRepository(),
		projectResidue: new PgProjectResidueRepository(),
		draftLock: new PgDraftLock(),
		sectionDocuments,
		ping: () =>
			Promise.race([
				pgQuery('SELECT 1').then(() => undefined),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('datastore ping timeout')), 3000)
				)
			])
	};
}
