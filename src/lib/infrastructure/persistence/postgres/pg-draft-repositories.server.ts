import { createEmptyIdentityDraft, type FoundationIdentityDraft } from '$domain/foundation';
import { type FoundationDefinitionDraft } from '$domain/foundation';
import { parseDefinitionDraft } from '$application/parse-foundation-definition';
import { createEmptyUsersDraft, type ProjectUsersDraft } from '$domain/users';
import { createEmptyFeaturesDraft, isCoreTone, type ProjectFeaturesDraft } from '$domain/features';
import { createEmptyExperienceDraft, type ProjectExperienceDraft } from '$domain/experience';
import { createEmptyRulesDraft, type ProjectRulesDraft } from '$domain/rules';
import { createEmptyGlossaryDraft, type ProjectGlossaryDraft } from '$domain/glossary';
import { createEmptySupervisionDraft, type ProjectSupervisionDraft } from '$domain/supervision';
import { createEmptyFinopsDraft, type ProjectFinopsDraft } from '$domain/finops';
import { createEmptyOperationsDraft, type FoundationOperationsDraft } from '$domain/foundation';
import { createEmptyDataDraft, type ProjectDataDraft } from '$domain/data';
import { createEmptyArchitectureDraft, type ProjectArchitectureDraft } from '$domain/architecture';
import { createEmptyCoherenceDraft, type ProjectCoherenceDraft } from '$domain/coherence';
import type {
	ArchitectureDraftRepositoryPort,
	CoherenceDraftRepositoryPort,
	DataDraftRepositoryPort,
	FoundationIdentityRepositoryPort,
	ExperienceDraftRepositoryPort,
	FeaturesDraftRepositoryPort,
	FoundationOperationsRepositoryPort,
	FoundationDefinitionRepositoryPort,
	FinopsDraftRepositoryPort,
	GlossaryDraftRepositoryPort,
	RulesDraftRepositoryPort,
	SectionDocumentStorePort,
	SupervisionDraftRepositoryPort,
	UsersDraftRepositoryPort
} from '$application/ports';
import { PgDocumentRepository } from './pg-document-repository.server';
import { SectionDocumentDraftRepository } from '../section-document-draft-repository.server';

/**
 * The wizard-section repositories on PostgreSQL. The simple sections (no
 * kernel projection) live in the consolidated `project_section_documents`
 * table behind the section-document store (atomic save, revision in-row); the
 * sections that still carry kernel projections or bespoke read models keep
 * their dedicated per-section tables via the generic document repository.
 * Each repository receives its context-specific stored-document parser.
 */
export interface PgDraftRepositories {
	readonly foundationIdentity: FoundationIdentityRepositoryPort;
	readonly foundationDefinition: FoundationDefinitionRepositoryPort;
	readonly users: UsersDraftRepositoryPort;
	readonly features: FeaturesDraftRepositoryPort;
	readonly experience: ExperienceDraftRepositoryPort;
	readonly rules: RulesDraftRepositoryPort;
	readonly glossary: GlossaryDraftRepositoryPort;
	readonly supervision: SupervisionDraftRepositoryPort;
	readonly finops: FinopsDraftRepositoryPort;
	readonly foundationOperations: FoundationOperationsRepositoryPort;
	readonly data: DataDraftRepositoryPort;
	readonly architecture: ArchitectureDraftRepositoryPort;
	readonly coherence: CoherenceDraftRepositoryPort;
}

export function buildPgDraftRepositories(store: SectionDocumentStorePort): PgDraftRepositories {
	return {
		foundationIdentity: new PgDocumentRepository<FoundationIdentityDraft>(
			'project_drafts',
			(stored, id) => ({
				...createEmptyIdentityDraft(id),
				...stored,
				projectId: id
			})
		),
		foundationDefinition: new PgDocumentRepository<FoundationDefinitionDraft>(
			'project_definition_drafts',
			(stored, id) => {
				const draft = parseDefinitionDraft(stored, id);
				return {
					...draft,
					lastSavedAt:
						typeof stored.lastSavedAt === 'string' ? stored.lastSavedAt : draft.lastSavedAt
				};
			}
		),
		users: new PgDocumentRepository<ProjectUsersDraft>('project_users_drafts', (stored, id) => ({
			...createEmptyUsersDraft(id),
			...stored,
			projectId: id
		})),
		features: new PgDocumentRepository<ProjectFeaturesDraft>(
			'project_features_drafts',
			(stored, id) => {
				const merged = { ...createEmptyFeaturesDraft(id), ...stored, projectId: id };
				merged.cores = merged.cores.map((c) => (isCoreTone(c.tone) ? c : { ...c, tone: 'custom' }));
				return merged;
			}
		),
		experience: new PgDocumentRepository<ProjectExperienceDraft>(
			'project_experience_drafts',
			(stored, id) => ({ ...createEmptyExperienceDraft(id), ...stored, projectId: id })
		),
		rules: new PgDocumentRepository<ProjectRulesDraft>('project_rules_drafts', (stored, id) => ({
			...createEmptyRulesDraft(id),
			...stored,
			inventory: [],
			projectId: id
		})),
		glossary: new SectionDocumentDraftRepository<ProjectGlossaryDraft>(
			store,
			'glossary',
			(stored, id) => ({ ...createEmptyGlossaryDraft(id), ...(stored as object), projectId: id })
		),
		supervision: new SectionDocumentDraftRepository<ProjectSupervisionDraft>(
			store,
			'supervision',
			(stored, id) => ({ ...createEmptySupervisionDraft(id), ...(stored as object), projectId: id })
		),
		finops: new SectionDocumentDraftRepository<ProjectFinopsDraft>(
			store,
			'finops',
			(stored, id) => ({ ...createEmptyFinopsDraft(id), ...(stored as object), projectId: id })
		),
		foundationOperations: new SectionDocumentDraftRepository<FoundationOperationsDraft>(
			store,
			'foundation.operations',
			(stored, id) => ({ ...createEmptyOperationsDraft(id), ...(stored as object), projectId: id })
		),
		data: new PgDocumentRepository<ProjectDataDraft>('project_data_drafts', (stored, id) => ({
			...createEmptyDataDraft(id),
			...stored,
			derivedEntities: [],
			projectId: id
		})),
		architecture: new SectionDocumentDraftRepository<ProjectArchitectureDraft>(
			store,
			'architecture',
			(stored, id) => ({
				...createEmptyArchitectureDraft(id),
				...(stored as object),
				derivedTech: [],
				projectId: id
			})
		),
		coherence: new SectionDocumentDraftRepository<ProjectCoherenceDraft>(
			store,
			'coherence',
			(stored, id) => ({
				...createEmptyCoherenceDraft(id),
				...(stored as object),
				projectId: id
			})
		)
	};
}
