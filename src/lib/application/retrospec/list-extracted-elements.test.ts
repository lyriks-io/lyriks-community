import { describe, expect, it } from 'vitest';
import { createEmptyDataDraft, createEntity } from '$domain/data';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import { createEmptyIdentityDraft, type ProjectFoundationDraft } from '$domain/foundation';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { createEdgeCase, createEmptyRulesDraft, createIssue } from '$domain/rules';
import { createEmptyUsersDraft, createRole } from '$domain/users';
import { ListExtractedElementsUseCase } from './list-extracted-elements';

const loader = <T>(value: T) => ({ execute: async () => value });
type Mode = 'code_to_spec' | 'from_document' | 'from_figma' | 'greenfield';
const foundation = (sourceMode: Mode) =>
	({ projectId: 'p', identity: { ...createEmptyIdentityDraft('p'), sourceMode } }) as unknown as ProjectFoundationDraft;
const features: ProjectFeaturesDraft = {
	...createEmptyFeaturesDraft('p'),
	features: [{ id: 'f1', name: 'Send a message', coreId: 'c', parentFamilyId: null, description: '', unspaghettitFeatureId: 'f1' }],
	leafMeta: { f1: { sourceIds: ['src-code'] } }
};
const rules = {
	...createEmptyRulesDraft('p'),
	issues: [createIssue({ title: 'One draft per thread', sourceIds: [] }), createIssue({ title: 'Found by the scan', autoDetected: true })],
	scenarios: [createEdgeCase({ title: 'Archived thread', sourceIds: ['src-jira'] })]
};
const glossary = { ...createEmptyGlossaryDraft('p'), terms: [{ id: 't', term: 'Thread', definition: '', synonymsAllowed: [], synonymsAvoid: [], example: '', locale: 'en', status: 'approved', sourceIds: [] }] };
const users = { ...createEmptyUsersDraft('p'), roles: [createRole({ name: 'Moderator', sourceIds: ['src-notion'] })] };
const data = {
	...createEmptyDataDraft('p'),
	entities: [createEntity({ id: 'messages', name: 'Messages', sourceIds: ['src-model'] }), createEntity({ id: 'threads', name: 'Threads' })]
};

const useCase = (mode: Mode) =>
	new ListExtractedElementsUseCase(loader(foundation(mode)), loader(features), loader(rules), loader(glossary as never), loader(users), loader(data));

describe('the elements a project read from its code extracted (ac-src-extracted)', () => {
	it('lists every feature, rule, edge case, term, role and table with its sources, never what the platform detected itself [criterion:ac-leaf-ac-src-extracted]', async () => {
		expect((await useCase('code_to_spec').execute('p'))?.elements).toEqual([
			{ kind: 'feature', name: 'Send a message', sourceIds: ['src-code'] },
			{ kind: 'rule', name: 'One draft per thread', sourceIds: [] },
			{ kind: 'edge_case', name: 'Archived thread', sourceIds: ['src-jira'] },
			{ kind: 'term', name: 'Thread', sourceIds: [] },
			{ kind: 'role', name: 'Moderator', sourceIds: ['src-notion'] },
			{ kind: 'table', name: 'Messages', sourceIds: ['src-model'] },
			{ kind: 'table', name: 'Threads', sourceIds: undefined }
		]);
	});

	it('says nothing of a project started from scratch', async () => {
		expect(await useCase('greenfield').execute('p')).toBeNull();
	});

	it('lists the same elements for a project read from its documentation or its design, and says what it was read from [criterion:7a8be13f]', async () => {
		expect((await useCase('code_to_spec').execute('p'))?.from).toBe('code');
		const documents = await useCase('from_document').execute('p');
		const design = await useCase('from_figma').execute('p');
		expect(documents?.from).toBe('documents');
		expect(design?.from).toBe('design');
		expect(design?.elements).toEqual((await useCase('code_to_spec').execute('p'))?.elements);
	});
});
