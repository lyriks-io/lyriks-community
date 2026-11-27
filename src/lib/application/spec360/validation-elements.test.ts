import { describe, expect, it } from 'vitest';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyUsersDraft } from '$domain/users';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyExperienceDraft } from '$domain/experience';
import { reviewJobsOf } from '$domain/retrospec';
import { specElements, type SpecElementsInput } from './elements';
import { addCore, addUser, coreDeletionRefusal, deleteUser, editArchitecture, editDefinition, editFeatures, editGlossary, editIdentity, editShapeOf, editUsers } from './edits';
import { usedByOf } from './feature-extras';
import { experienceView } from './experience';
import { specOutline } from './outline';

const P = 'p1';

function features() {
	const f = createEmptyFeaturesDraft(P);
	f.cores.push({ id: 'c1', name: 'Invoicing', description: 'Issuing.', tone: 'custom' }, { id: 'c2', name: 'Reports', description: '', tone: 'custom' });
	f.features.push({ id: 'f1', name: 'Issuance', coreId: 'c1', parentFamilyId: null, description: 'Create invoices.', unspaghettitFeatureId: 'f1' });
	return f;
}

function input(over: Partial<SpecElementsInput> = {}): SpecElementsInput {
	return {
		pitch: 'Invoicing for SMBs.',
		hasProblem: true,
		hasTarget: false,
		users: [{ id: 'r1', name: 'Accountant', description: '', tone: 'customer', userClass: 'end' }],
		hasPermissions: true,
		outline: specOutline(features()),
		actions: { f1: [{ id: 'a1', name: 'Create an invoice', intent: '', surfaceId: 's1', surfaceName: 'New invoice' }] as never },
		rules: {
			groups: [
				{
					featureId: 'f1',
					rules: [
						{ nodeId: 'r-12', statement: 'Numbering is continuous', origin: { kind: 'action', featureId: 'f1', actionId: 'a1' } },
						{ nodeId: 'r-13', statement: 'A surface rule', origin: { kind: 'surface', featureId: 'f1' } }
					]
				}
			],
			total: 2,
			missingDescription: 0
		} as never,
		experience: experienceView(createEmptyExperienceDraft(P)),
		entityCount: 0,
		dataFacts: [],
		stack: [],
		health: [{ key: 'implementation', title: 'Implementation', description: '', chips: [] }],
		requirements: [],
		constraints: [],
		terms: [{ id: 't1', term: 'Invoice' }, { id: 't2', term: '  ' }],
		...over
	};
}

describe('the elements a team validates', () => {
	it('are the blocks the pages show, in page order, under their discussion anchors', () => {
		expect(specElements(input()).map((e) => e.id)).toEqual([
			'product',
			'problem',
			'role:r1',
			'core:c1',
			'core:c2',
			'feature:f1',
			'action:f1:a1',
			'rule:f1:r-12',
			'flow:f1',
			'permissions',
			'health:implementation',
			'term:t1'
		]);
	});

	it('leaves out what the spec says nothing about', () => {
		const ids = specElements(input({ pitch: ' ', hasProblem: false, users: [], actions: {} })).map((e) => e.id);
		expect(ids).not.toContain('product');
		expect(ids).not.toContain('permissions');
		expect(ids).not.toContain('flow:f1');
	});

	it('reads the jobs an element waits on from its anchor alone', () => {
		expect(reviewJobsOf('rule:f1:r-12')).toEqual(['product', 'development', 'qa']);
		expect(reviewJobsOf('flow:f1')).toEqual(['design', 'development']);
		expect(reviewJobsOf('component:x')).toEqual(['design']);
		expect(reviewJobsOf('health:implementation')).toEqual(['tech', 'qa']);
	});
});

describe('editing in place', () => {
	it('offers the fields the page shows, and nothing for what the spec derives', () => {
		expect(editShapeOf('problem')).toMatchObject({ section: 'definition', tags: 'Symptoms' });
		expect(editShapeOf('term:t1')).toMatchObject({ section: 'glossary', desc: 'Definition', tags: 'Synonyms' });
		expect(editShapeOf('flow:f1')).toBeNull();
		expect(editShapeOf('rule:f1:r1')).toBeNull();
	});

	it('writes the title and description into the section that holds them, never a blank title', () => {
		const users = createEmptyUsersDraft(P);
		users.roles.push({ id: 'r1', name: 'Accountant', description: '', userCountMin: 1, userCountMax: null, tone: 'customer', sourceIds: [] });
		expect(editUsers(users, 'role:r1', { text: 'Bookkeeper', desc: 'Closes the month.' })?.roles[0]).toMatchObject({ name: 'Bookkeeper', description: 'Closes the month.' });
		expect(editUsers(users, 'role:r1', { text: '   ' })?.roles[0].name).toBe('Accountant');
		expect(editUsers(users, 'role:nope', { text: 'X' })).toBeNull();
		expect(editFeatures(features(), 'feature:f1', { text: 'Invoices', desc: 'Issue them.' })?.features[0]).toMatchObject({ name: 'Invoices', description: 'Issue them.' });
		expect(editIdentity(createEmptyIdentityDraft(P), 'product', { text: 'A new pitch.' })?.brief).toBe('A new pitch.');
	});

	it('keeps the users a linked symptom points at, and stores a typed one as plain', () => {
		const def = createEmptyDefinitionDraft(P);
		def.businessObjective.painPointLinks = [{ id: 'pp1', text: 'Late payments', roleIds: ['r1'] }, { id: 'pp2', text: 'Typos', roleIds: [] }];
		const next = editDefinition(def, 'problem', { text: 'Invoices by hand.', tags: ['Late payments', 'Double entry'] })!;
		expect(next.businessObjective.mainProblem).toBe('Invoices by hand.');
		expect(next.businessObjective.painPointLinks).toEqual([{ id: 'pp1', text: 'Late payments', roleIds: ['r1'] }]);
		expect(next.businessObjective.painPoints).toEqual(['Double entry']);
	});

	it('edits a technology, a constraint and a term with its synonyms', () => {
		const arch = createEmptyArchitectureDraft(P);
		arch.techChoices.push({ id: 't1', layer: 'backend', name: 'Node', role: '', version: '20', referenceDocId: null, description: '' } as never);
		expect(editArchitecture(arch, 'stack:t1', { text: 'Node.js', desc: 'Runs the API' })?.techChoices[0]).toMatchObject({ name: 'Node.js', role: 'Runs the API' });
		const glossary = createEmptyGlossaryDraft(P);
		glossary.terms.push({ id: 'g1', term: 'Invoice', definition: '', synonymsAllowed: [], synonymsAvoid: [], example: '', locale: 'en', status: 'draft', sourceIds: [] } as never);
		expect(editGlossary(glossary, 'term:g1', { text: 'Invoice', desc: 'A request for payment.', tags: ['Bill', 'Bill', ' '] })?.terms[0]).toMatchObject({ definition: 'A request for payment.', synonymsAllowed: ['Bill'] });
	});
});

describe('adding and deleting', () => {
	it('adds a user and a core feature, named for the reader to rename', () => {
		const user = addUser(createEmptyUsersDraft(P));
		expect(user.draft.roles[0]).toMatchObject({ name: 'New user', tone: 'customer' });
		expect(user.anchor).toBe(`role:${user.draft.roles[0].id}`);
		expect(addCore(features()).draft.cores.at(-1)?.name).toBe('New core feature');
	});

	it('deletes a user with its rights, and refuses a core feature that still holds features', () => {
		const users = createEmptyUsersDraft(P);
		users.roles.push({ id: 'r1', name: 'A', description: '', userCountMin: 1, userCountMax: null, tone: 'customer', sourceIds: [] });
		users.permissions.push({ roleId: 'r1', capabilityId: 'c', capabilitySource: 'feature' } as never);
		expect(deleteUser(users, 'role:r1')).toMatchObject({ roles: [], permissions: [] });
		expect(coreDeletionRefusal(features(), 'core:c1')).toBe('It still holds features, and no page moves or deletes a feature: ask your AI to move them to another core feature or remove them (Ask my AI), then delete it here.');
		expect(coreDeletionRefusal(features(), 'core:c2')).toBeNull();
	});
});

describe('a feature page', () => {
	it('names who uses it', () => {
		const who = (name: string) => ({ id: name, name, tone: 'customer', userClass: 'end' as const });
		expect(usedByOf([{ who: [who('Sales rep'), who('Accountant')] }, { who: [who('Admin'), who('Accountant')] }] as never)).toBe('Sales rep, Accountant and Admin');
		expect(usedByOf([])).toBe('');
	});
});

describe('the rules the whole product keeps are validated like the other elements [criterion:ac-leaf-ac-rules-product-card]', () => {
	it('head the Features page: after the core features of At a glance, before the first feature', () => {
		const ids = specElements(input({ productRules: [{ id: 'inv-1', text: 'An expired link never redirects' }] })).map((e) => e.id);
		expect(ids.slice(2, 7)).toEqual(['role:r1', 'core:c1', 'core:c2', 'rule:project:inv-1', 'feature:f1']);
		expect(reviewJobsOf('rule:project:inv-1')).toContain('product');
	});

	it('add nothing when the project holds none', () => {
		expect(specElements(input({ productRules: [] })).map((e) => e.id)).not.toContain('rule:project:inv-1');
	});
});
