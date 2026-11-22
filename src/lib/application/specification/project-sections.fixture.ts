import { createEmptyArchitectureDraft, type ProjectArchitectureDraft } from '$domain/architecture';
import { createEmptyDataDraft, type ProjectDataDraft } from '$domain/data';
import { createEmptyDocumentsDraft, type ProjectDocumentsDraft } from '$domain/documents';
import { createEmptyExperienceDraft, type ProjectExperienceDraft } from '$domain/experience';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import {
	createEmptyDefinitionDraft,
	createEmptyIdentityDraft,
	createEmptyOperationsDraft,
	type FoundationDefinitionDraft,
	type FoundationIdentityDraft,
	type FoundationOperationsDraft
} from '$domain/foundation';
import { createEmptyGlossaryDraft, type ProjectGlossaryDraft } from '$domain/glossary';
import { createEmptyRulesDraft, type ProjectRulesDraft } from '$domain/rules';
import { createEmptyUsersDraft, type ProjectUsersDraft } from '$domain/users';

/**
 * The authored sections of one project, held in memory for tests: each one
 * defaults to its empty draft. Test support only.
 */
export interface ProjectSections {
	readonly identity?: FoundationIdentityDraft;
	readonly definition?: FoundationDefinitionDraft;
	readonly operations?: FoundationOperationsDraft;
	readonly users?: ProjectUsersDraft;
	readonly features?: ProjectFeaturesDraft;
	readonly experience?: ProjectExperienceDraft;
	readonly rules?: ProjectRulesDraft;
	readonly data?: ProjectDataDraft;
	readonly architecture?: ProjectArchitectureDraft;
	readonly glossary?: ProjectGlossaryDraft;
	readonly documents?: ProjectDocumentsDraft;
}

const answer = <T>(value: T) => ({ execute: async () => value });

/** One loader per section, each answering the section it was given. */
export function sectionLoaders(project: ProjectSections, projectId: string) {
	return {
		loadFoundation: {
			loadIdentity: async () => project.identity ?? createEmptyIdentityDraft(projectId),
			loadDefinition: async () => project.definition ?? createEmptyDefinitionDraft(projectId),
			loadOperations: async () => project.operations ?? createEmptyOperationsDraft(projectId)
		},
		loadUsers: answer(project.users ?? createEmptyUsersDraft(projectId)),
		loadFeatures: answer(project.features ?? createEmptyFeaturesDraft(projectId)),
		loadExperience: answer(project.experience ?? createEmptyExperienceDraft(projectId)),
		loadRules: answer(project.rules ?? createEmptyRulesDraft(projectId)),
		loadData: answer(project.data ?? createEmptyDataDraft(projectId)),
		loadArchitecture: answer(project.architecture ?? createEmptyArchitectureDraft(projectId)),
		loadGlossary: answer(project.glossary ?? createEmptyGlossaryDraft(projectId)),
		loadDocuments: answer(project.documents ?? createEmptyDocumentsDraft(projectId))
	};
}
