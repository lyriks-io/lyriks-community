import { describe, expect, it } from 'vitest';
import { createEmptyArchitectureDraft } from '../architecture';
import { createEmptyDataDraft } from '../data';
import { createEmptyDocumentsDraft } from '../documents';
import { createEmptyExperienceDraft } from '../experience';
import { createEmptyFeaturesDraft } from '../features';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft, createEmptyOperationsDraft } from '../foundation';
import { createEmptyGlossaryDraft } from '../glossary';
import { createEmptyRulesDraft } from '../rules';
import { createEmptyScopeDraft } from '../scope';
import { createEmptyUsersDraft } from '../users';
import { readRetrospec, type RetrospecSpec } from './reading';
import { retrospecFindings } from './findings';
import { codeCoverage, rebuiltTiles, summaryNote, tracedShare } from './summary';

const P = 'p-1';

function spec(): RetrospecSpec {
	const identity = { ...createEmptyIdentityDraft(P), productName: 'Facturo', brief: 'Invoicing for small companies.', formFactors: ['web_interface' as const, 'api' as const] };
	const definition = createEmptyDefinitionDraft(P);
	definition.businessObjective.mainProblem = 'Invoices are numbered by hand.';
	definition.businessObjective.painPoints = ['Gaps and duplicates in the numbering'];
	const features = createEmptyFeaturesDraft(P);
	features.cores = [{ id: 'core-1', name: 'Invoicing', description: 'Issuing invoices. And more.', tone: 'operations' as never }];
	features.features = [
		{ id: 'feat-1', name: 'Issue an invoice', coreId: 'core-1', parentFamilyId: null, description: 'Create and send.', unspaghettitFeatureId: 'feat-1' },
		{ id: 'feat-2', name: 'Credit notes', coreId: 'core-1', parentFamilyId: null, description: 'Cancel part of an invoice. Later.', unspaghettitFeatureId: 'feat-2' }
	];
	features.leafMeta = { 'feat-1': { sourceIds: ['src-1'] } as never };
	const users = createEmptyUsersDraft(P);
	users.roles = [
		{ id: 'r-sales', name: 'Sales rep', description: 'Creates invoices.', userCountMin: 0, userCountMax: null, tone: 'customer', sourceIds: ['src-1'] },
		{ id: 'r-admin', name: 'Administrator', description: 'Manages users.', userCountMin: 0, userCountMax: null, tone: 'admin', sourceIds: [] }
	];
	users.permissions = [
		{ roleId: 'r-sales', capabilityId: 'action:feat-1:a-create', capabilitySource: 'feature' },
		{ roleId: 'r-admin', capabilityId: 'manage_users', capabilitySource: 'off_structure' }
	];
	users.offStructureCapabilities = [{ id: 'manage_users', label: 'Manage users', note: null }];
	const data = createEmptyDataDraft(P);
	data.hosts = [{ id: 'h-1', name: 'EU VPS', kind: 'cloud', provider: 'Scaleway', region: 'eu-west-3', description: 'Two servers.' }];
	data.databases = [{ id: 'db-1', hostId: 'h-1', name: 'Core', engine: 'postgres', description: '' }];
	const field = (id: string, entityId: string, name: string, extra: object = {}) => ({ id, entityId, name, type: 'string' as never, isId: false, isUnique: false, isRequired: false, isList: false, defaultValue: '', relationTargetEntityId: null, ...extra });
	data.entities = [
		{ id: 'e-inv', name: 'Invoice', databaseId: 'db-1', description: '', derivedFrom: 'manual' as never, sourceRefId: null },
		{ id: 'e-cus', name: 'Customer', databaseId: 'db-1', description: '', derivedFrom: 'manual' as never, sourceRefId: null },
		{ id: 'e-promo', name: 'Promotion', databaseId: null, description: '', derivedFrom: 'manual' as never, sourceRefId: null }
	];
	data.fields = [field('f1', 'e-inv', 'id', { isId: true }), field('f2', 'e-inv', 'customer', { type: 'relation', relationTargetEntityId: 'e-cus' }), field('f3', 'e-cus', 'id', { isId: true })];
	const glossary = createEmptyGlossaryDraft(P);
	glossary.terms = [{ id: 't-1', term: 'Invoice', definition: 'A request for payment.', synonymsAllowed: ['Bill'], synonymsAvoid: ['Facture'], example: '', locale: 'en' as never, status: 'approved' as never, sourceIds: [] }];
	const rules = createEmptyRulesDraft(P);
	rules.issues = [
		{ id: 'i-1', kind: 'contradiction', title: 'Two VAT rounding rules', detail: 'Per line and per total.', severity: 'major', status: 'open', ownerRoleId: null, resolutionNote: '', relatedRuleIds: [], relatedFeatureId: 'feat-1', relatedJourneyId: null, autoDetected: false, sourceIds: ['src-1'] },
		{ id: 'i-2', kind: 'dead_rule', title: 'Old discount', detail: '', severity: 'minor', status: 'accepted_risk', ownerRoleId: null, resolutionNote: '', relatedRuleIds: [], relatedFeatureId: null, relatedJourneyId: null, autoDetected: false, sourceIds: [] }
	];
	const experience = createEmptyExperienceDraft(P);
	experience.journeys = [{ id: 'j-1', coreId: 'core-1', name: 'Send an invoice', description: 'The most frequent journey.', order: 0, actorRoleIds: [] }];
	experience.steps = [
		{ id: 's-2', journeyId: 'j-1', name: 'Send', order: 1, linkedScreenId: null },
		{ id: 's-1', journeyId: 'j-1', name: 'New invoice', order: 0, linkedScreenId: 'sc-1' }
	];
	const architecture = createEmptyArchitectureDraft(P);
	architecture.techChoices = [{ id: 't-react', layer: 'frontend', name: 'React', role: '', version: '18', referenceDocId: null, description: '' }];
	const documents = createEmptyDocumentsDraft(P);
	documents.sources = [{ id: 'src-1', title: 'invoice.service.ts', kind: 'code' as never, url: 'src/invoice.service.ts', note: '' }];
	return {
		foundation: { projectId: P, identity, definition, operations: createEmptyOperationsDraft(P) },
		scope: createEmptyScopeDraft(P),
		users,
		features,
		data,
		experience,
		rules,
		glossary,
		architecture,
		documents,
		behavior: {
			actionsByFeature: { 'feat-1': [{ id: 'a-create', name: 'Create an invoice', intent: 'Draft a new invoice' }] },
			rulesByAction: { 'feat-1:a-create': [{ id: 'r-num', text: 'Numbering is continuous' }] },
			authoredFeatureIds: ['feat-1']
		}
	};
}

describe('reading the rebuilt specification', () => {
	const reading = readRetrospec(spec(), 'Facturo');
	const tab = (key: string) => reading.tabs.find((t) => t.key === key)!;

	it('leaves out the tabs the specification holds nothing for', () => {
		expect(reading.tabs.map((t) => t.key)).toEqual(['foundations', 'features', 'actions', 'users', 'experience', 'tech', 'data', 'infra']);
		const empty = { ...spec(), architecture: createEmptyArchitectureDraft(P) };
		expect(readRetrospec(empty, 'Facturo').tabs.map((t) => t.key)).not.toContain('tech');
	});

	it('reads the foundations the way the design numbers them, only those that hold something', () => {
		const items = tab('foundations').items;
		expect(items.map((i) => [i.ref, i.title])).toEqual([
			['1.1', 'Product identity'],
			['1.2', 'Current situation'],
			['1.3', 'Form factor'],
			['1.4', 'Who it serves'],
			['1.5', 'Scope'],
			['1.6', 'Business vocabulary']
		]);
		expect(items[0].tiles?.[0]).toEqual({ k: 'Product name', v: 'Facturo' });
		expect(items[1]).toMatchObject({ lead: { kicker: 'PROBLEM', text: 'Invoices are numbered by hand.' }, symptoms: ['Gaps and duplicates in the numbering'] });
		expect(items[2].formFactors).toEqual([
			{ group: 'Visual interfaces', options: ['Web interface'] },
			{ group: 'Programmatic', options: ['API'] }
		]);
		expect(items[5].lexicon?.[0]).toEqual({ term: 'Invoice', definition: 'A request for payment.', synonyms: ['Bill'], banned: ['Facture'] });
	});

	it('groups the features under their core and lists what a person can do in each', () => {
		const groups = tab('features').featureGroups!;
		expect(groups[0]).toMatchObject({ title: 'Invoicing', desc: 'Issuing invoices.' });
		expect(groups[0].items.map((i) => [i.id, i.desc])).toEqual([
			['feature:feat-1', 'Create an invoice'],
			['feature:feat-2', 'Cancel part of an invoice.']
		]);
	});

	it('nests each action’s rules under it, by the specification’s own ids', () => {
		const actions = tab('actions');
		expect(actions.items.map((i) => i.id)).toEqual(['action:feat-1:a-create', 'rule:feat-1:a-create:r-num']);
		expect(actions.actionFeatures?.[0]).toMatchObject({ core: 'Invoicing', name: 'Issue an invoice' });
	});

	it('splits end users from admins and draws the permissions as granted', () => {
		const users = tab('users').users!;
		expect(users.groups.map((g) => [g.label, g.roles.map((r) => r.item.title)])).toEqual([
			['END USERS', ['Sales rep']],
			['ADMIN USERS', ['Administrator']]
		]);
		expect(users.permissions?.rows).toEqual([
			{ head: 'Issue an invoice' },
			{ label: 'Create an invoice', access: [true, false] },
			{ head: 'Other capabilities' },
			{ label: 'Manage users', access: [false, true] }
		]);
		expect(tab('users').items.at(-1)?.id).toBe('users:permissions');
	});

	it('files the tables under their host and database, keys and relations named', () => {
		const map = tab('data').datamap!;
		expect(map.hosts[0]).toMatchObject({ name: 'EU VPS', kind: 'Cloud', where: 'Scaleway · eu-west-3' });
		expect(map.hosts[0].databases[0].tables[0].rows).toEqual([
			{ key: 'PK', name: 'id', type: 'string' },
			{ key: 'FK', name: 'customer', type: '→ Customer' }
		]);
		expect(map.loose.map((t) => t.name)).toEqual(['Promotion']);
		expect(tab('data').items.map((i) => i.id)).toEqual(['data:datamap', 'data:orphans']);
	});

	it('reads where the product runs from its hosts and databases, a kind with nothing in it left out', () => {
		expect(tab('infra').items.map((i) => [i.title, i.desc])).toEqual([
			['Hosting', 'Two servers.'],
			['Databases', '1 database.']
		]);
		const noHost = spec();
		noHost.data.hosts = [];
		expect(readRetrospec(noHost, 'Facturo').tabs.find((t) => t.key === 'infra')?.items.map((i) => i.title)).toEqual(['Databases']);
	});

	it('orders the journey steps and counts what the summary shows', () => {
		const journey = tab('experience').items.find((i) => i.id === 'journey:j-1')!;
		expect(journey.steps).toEqual(['New invoice', 'Send']);
		expect(reading.counts).toMatchObject({ features: 2, featuresWithBehavior: 1, actions: 1, rules: 1, entities: 3, relations: 1, orphanTables: 1, openIssues: 1, steps: 2, stepsOnScreen: 1 });
	});
});

describe('what Lyriks noticed', () => {
	it('lists the open issues the AI recorded, then the gaps it computes, major first', () => {
		const s = spec();
		const findings = retrospecFindings({ rules: s.rules, features: s.features, data: s.data, experience: s.experience, sources: s.documents.sources, authoredFeatureIds: s.behavior.authoredFeatureIds });
		expect(findings.map((f) => [f.tone, f.text])).toEqual([
			['major', 'Two VAT rounding rules'],
			['minor', '1 table related to nothing: possibly dead code'],
			['minor', '1 journey step on no screen'],
			['minor', '1 feature with no action described']
		]);
		expect(findings[0].sheet.kicker).toBe('PROBLEM SHEET · CONTRADICTION · MAJOR IMPACT');
		// An issue asks its question, answered on its sheet, then says where it waits meanwhile (criterion e0f69b3c).
		expect(findings[0].sheet.sections.map((x) => x.heading)).toEqual(['IN SHORT', 'WHERE IT APPLIES', 'WHERE IT COMES FROM', 'WHERE YOU FIND IT AGAIN']);
		expect(findings[0].decision).toEqual({ issueId: s.rules.issues[0].id, question: 'Is what the specification says now the right behaviour?' });
		// What Lyriks computes is not an issue a person settles: it keeps saying what to do.
		expect(findings[1].decision).toBeUndefined();
		expect(findings[1].sheet.sections.some((x) => x.heading === 'WHAT YOU CAN DO')).toBe(true);
	});

	it('asks the question each kind of issue raises [criterion:e0f69b3c]', () => {
		const s = spec();
		const asked = (kind: string) =>
			retrospecFindings({ rules: { ...s.rules, issues: [{ ...s.rules.issues[0], kind } as (typeof s.rules.issues)[number]] }, features: s.features, data: s.data, experience: s.experience, sources: s.documents.sources, authoredFeatureIds: s.behavior.authoredFeatureIds })[0].decision?.question;
		expect(asked('ambiguity')).toBe('Is this how the product should behave?');
		expect(asked('missing_rule')).toBe('Is the product right without this rule?');
		expect(asked('unhandled_edge')).toBe('Is this how the product should behave here?');
	});

	it('reads a missing failure path Lyriks found as EARS, and keeps the title of what an AI wrote, its description on hover [criterion:ad34b2f4]', () => {
		const s = spec();
		const input = (rules: typeof s.rules) => ({ rules, features: s.features, data: s.data, experience: s.experience, sources: s.documents.sources, authoredFeatureIds: s.behavior.authoredFeatureIds });
		const edge = { ...s.rules.issues[0], id: 'edge', kind: 'unhandled_edge' as const, autoDetected: true, title: 'What if “payment” fails in Checkout?', detail: 'Checkout relies on payment.' };
		const [detected, written] = retrospecFindings(input({ ...s.rules, issues: [edge, s.rules.issues[0]] }));
		expect(detected.ears).toBe('If “payment” fails in Checkout, then the system shall …');
		expect(detected.hint).toBe('Checkout relies on payment.');
		expect(written.ears).toBeUndefined();
		expect(written.text).toBe('Two VAT rounding rules');
		expect(written.hint).toBe(s.rules.issues[0].detail.trim());
	});
});

describe('the summary', () => {
	const s = spec();
	const reading = readRetrospec(s, 'Facturo');

	it('measures what is traced to a source and what the code index found', () => {
		// The three tables count among what must cite a source, and cite none here (criterion 3918b2ea).
		expect(tracedShare(s)).toEqual({ cited: 3, total: 10, pct: 30 });
		const cited = { ...s, data: { ...s.data, entities: s.data.entities.map((e) => ({ ...e, sourceIds: [s.documents.sources[0].id] })) } };
		expect(tracedShare(cited)).toEqual({ cited: 6, total: 10, pct: 60 });
		expect(codeCoverage([{ found: 8, expected: 10 }, { found: 1, expected: 2 }])).toEqual({ found: 9, expected: 12, pct: 75 });
		expect(codeCoverage([]).pct).toBeNull();
	});

	it('shows a tile per zone the specification holds, with its coverage when it measures one', () => {
		const tiles = rebuiltTiles(reading.counts, 50);
		expect(tiles.map((t) => [t.n, t.label, t.coverage?.pct ?? null])).toEqual([
			[1, 'core feature', null],
			[2, 'features', 50],
			[1, 'action', null],
			[1, 'rule', null],
			[3, 'entities', 67],
			[2, 'roles', 50]
		]);
	});

	it('writes the note from the counts', () => {
		const note = summaryNote(reading.counts, 'Facturo');
		expect(note.title).toBe('We rebuilt the specification of Facturo.');
		expect(note.taken.map((l) => l.text)).toEqual(['Rebuilt 2 features and 1 action.', 'Mapped 3 entities and 1 relation.', 'Described the stack and architecture.']);
	});
});
