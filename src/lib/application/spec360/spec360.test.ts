import { describe, expect, it } from 'vitest';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft, createEmptyOperationsDraft } from '$domain/foundation';
import { createEmptyUsersDraft, actionCapabilityId } from '$domain/users';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyDataDraft } from '$domain/data';
import { createEmptyExperienceDraft } from '$domain/experience';
import type { GlossaryTerm } from '$domain/glossary';
import { glanceView, stackChips } from './glance';
import { leadSentence, paragraphsOf, withUnit } from './labels';
import { specOutline, locateInOutline } from './outline';
import { featureView, journeyOf } from './features';
import { permissionMatrix } from './users';
import { experienceView } from './experience';
import { healthItems, requirementGroups, stackLayers } from './tech';
import { glossaryEntries } from './glossary';

/**
 * The Specification 360° shows the spec as stored: each view is built from
 * the sections alone, and a block whose source is empty is left out rather
 * than filled with an invented value.
 */

const P = 'p1';

function features() {
	const f = createEmptyFeaturesDraft(P);
	f.cores.push({ id: 'c1', name: 'Invoicing', description: 'Issuing and credit notes.', tone: 'operations' } as never);
	f.features.push(
		{ id: 'f1', name: 'Issuance', coreId: 'c1', parentFamilyId: null, description: 'Create and validate invoices.', unspaghettitFeatureId: 'f1' },
		{ id: 'f2', name: 'Credit notes', coreId: 'c1', parentFamilyId: null, description: 'Cancel an invoice in part.', unspaghettitFeatureId: 'f2' }
	);
	return f;
}

const actions = {
	f1: [
		{ id: 'a1', name: 'Create an invoice', intent: 'Start an invoice', surfaceId: 's1', surfaceName: 'New invoice' },
		{ id: 'a2', name: 'Validate an invoice', intent: 'Lock it', surfaceId: 's1', surfaceName: 'New invoice' }
	]
};

describe('the outline', () => {
	it('lists each core with its features from A to Z and tells a core from a feature [criterion:4b3d2b4d]', () => {
		const outline = specOutline(features());
		expect(outline.cores[0].features.map((f) => f.name)).toEqual(['Credit notes', 'Issuance']);
		expect(locateInOutline(outline, 'c1')?.kind).toBe('core');
		expect(locateInOutline(outline, 'f2')?.kind).toBe('feature');
		expect(locateInOutline(outline, 'nope')).toBeNull();
	});
});

describe('at a glance', () => {
	it('reads the pitch, the identity chips, the objective and the stack from the spec', () => {
		const identity = { ...createEmptyIdentityDraft(P), brief: 'Facturo is invoicing for SMBs. It also exports.', industry: 'fintech', formFactors: ['web_interface'] } as never;
		const definition = createEmptyDefinitionDraft(P);
		definition.lastSavedAt = '2026-10-01T00:00:00.000Z';
		definition.market.marketType = 'b2b';
		definition.businessObjective.mainProblem = 'Invoices are typed by hand.';
		definition.businessObjective.kpis = [{ name: 'Time to invoice', currentValue: 15, targetValue: 2, unit: 'min' }];
		const users = createEmptyUsersDraft(P);
		users.roles.push({ id: 'r1', name: 'Accountant', description: '', userCountMin: 0, userCountMax: null, tone: 'customer', sourceIds: [] });
		const architecture = createEmptyArchitectureDraft(P);
		architecture.techChoices.push({ id: 't1', layer: 'backend', name: 'NestJS', role: 'API', version: '10', referenceDocId: null, description: '' });
		architecture.techChoices.push({ id: 't2', layer: 'frontend', name: 'React', role: 'UI', version: '', referenceDocId: null, description: '' });
		const view = glanceView({
			identity,
			definition,
			users,
			outline: specOutline(features()),
			architecture,
			counts: { features: 2, actions: 2, rules: 1, users: 1, entities: 0, terms: 3 }
		});
		expect(view.pitch).toBe('Facturo is invoicing for SMBs. It also exports.');
		expect(view.meta.flatMap((g) => g.labels)).toContain('B2B');
		// A definition never saved holds the form's defaults, not answers.
		const unsaved = glanceView({ identity, definition: createEmptyDefinitionDraft(P), users, outline: specOutline(features()), architecture, counts: { features: 0, actions: 0, rules: 0, users: 0, entities: 0, terms: 0 } });
		expect(unsaved.meta.flatMap((g) => g.labels)).not.toContain('B2B');
		expect(view.outcomes).toEqual([{ label: 'Time to invoice', from: '15 min', to: '2 min' }]);
		expect(view.symptoms).toEqual([]);
		expect(view.users[0]).toMatchObject({ name: 'Accountant', userClass: 'end' });
		expect(view.cores[0].featureCount).toBe('2 features');
		expect(stackChips(architecture)).toEqual(['React', 'NestJS 10']);
		expect(view.numbers).toBe('2 features · 2 actions · 1 rule · 1 user · 0 entities · 3 terms');
	});

	it('keeps a long first sentence alone, and units after values', () => {
		expect(leadSentence('A very long opening sentence that already says what the product is for. Then more.')).toBe(
			'A very long opening sentence that already says what the product is for.'
		);
		expect(withUnit(null, '%')).toBe('');
		expect(withUnit(100, '%')).toBe('100 %');
	});

	it('reads the product summary whole, paragraph by paragraph [criterion:416e4885]', () => {
		expect(paragraphsOf('First  line\nwraps.\n\n  Second paragraph.  ')).toEqual(['First line wraps.', 'Second paragraph.']);
		expect(paragraphsOf('')).toEqual([]);
	});
});

describe('a feature page', () => {
	it('walks the screens and actions, says who may act and lists the rules of each action', () => {
		const users = createEmptyUsersDraft(P);
		users.roles.push({ id: 'r1', name: 'Sales rep', description: '', userCountMin: 0, userCountMax: null, tone: 'customer', sourceIds: [] });
		users.roles.push({ id: 'r2', name: 'Admin', description: '', userCountMin: 0, userCountMax: null, tone: 'admin', sourceIds: [] });
		users.permissions.push({ roleId: 'r2', capabilityId: actionCapabilityId('f1', 'a2'), capabilitySource: 'feature' });
		const rules = {
			groups: [
				{
					featureId: 'f1',
					label: 'Issuance',
					rules: [
						{ id: 'x', nodeId: 'r-lock', kind: 'rule' as const, title: 'state', statement: 'When validated, the invoice is locked.', description: '', hasDescription: false, reads: [], origin: { kind: 'action' as const, featureId: 'f1', featureName: 'Issuance', actionId: 'a2' } }
					]
				}
			],
			total: 1,
			missingDescription: 1
		};
		const view = featureView({ core: specOutline(features()).cores[0], featureId: 'f1', features: features(), actions, rules, users });
		expect(view.actions.map((a) => a.name)).toEqual(['Create an invoice', 'Validate an invoice']);
		expect(view.actions[0]).toMatchObject({ description: 'Start an invoice', who: [], rulesCount: '0 rules' });
		expect(view.actions[1].who.map((w) => w.name)).toEqual(['Admin']);
		expect(view.actions[1].rules).toEqual([{ id: 'r-lock', text: 'When validated, the invoice is locked.', kind: 'rule', blocks: false }]);
		expect(view.actionCount).toBe(2);
		expect(journeyOf([])).toEqual([]);
	});

	it('reads names written as code identifiers in words, the journey keeping the stored ones [criterion:ac-leaf-ac-tree-readable-actions]', () => {
		const coded = { f1: [{ id: 'a1', name: 'await_risk_inputs', intent: '', surfaceId: 's1', surfaceName: 'RiskAnalysis' }] };
		const view = featureView({ core: specOutline(features()).cores[0], featureId: 'f1', features: features(), actions: coded, rules: { groups: [], total: 0, missingDescription: 0 }, users: createEmptyUsersDraft(P) });
		expect(view.actions[0].name).toBe('Await Risk Inputs');
		// What a validation of the list of actions is taken from stays the stored names.
		expect(journeyOf(coded.f1).map((n) => n.label)).toEqual(['RiskAnalysis', 'await_risk_inputs']);
	});

	it('reads the sentence an action’s refusals share once, each refusal then by its condition and message', () => {
		const lead = 'When the user asks to validate an invoice, the system shall refuse to validate an invoice if any of these holds:';
		const origin = { kind: 'action' as const, featureId: 'f1', featureName: 'Issuance', actionId: 'a2' };
		const refusal = (nodeId: string, condition: string, message: string) => ({
			id: `k-${nodeId}`, nodeId, kind: 'rule' as const, title: 'Validation', effect: 'block' as const, description: '', hasDescription: false, reads: [], origin,
			statement: `When the user asks to validate an invoice, if ${condition}, then the system shall refuse to validate an invoice and show "${message}"`,
			refusal: { lead, case: condition, message }
		});
		const lock = { id: 'k-lock', nodeId: 'r-lock', kind: 'rule' as const, title: 'State', statement: 'When the user asks to validate an invoice, the system shall set the invoice locked to true.', description: '', hasDescription: false, reads: [], origin };
		const view = (rules: object[]) =>
			featureView({
				core: specOutline(features()).cores[0], featureId: 'f1', features: features(), actions,
				rules: { groups: [{ featureId: 'f1', label: 'Issuance', rules: rules as never }], total: rules.length, missingDescription: 0 },
				users: createEmptyUsersDraft(P)
			}).actions[1];

		const grouped = view([refusal('r-empty', 'the invoice lines count is 0', 'Add a line first.'), lock, refusal('r-done', 'the invoice validated is true', 'Already validated.')]);
		expect(grouped.refusalLead).toBe(lead);
		expect(grouped.rules.map((r) => r.refusal ?? null)).toEqual([
			{ case: 'the invoice lines count is 0', message: 'Add a line first.' },
			null,
			{ case: 'the invoice validated is true', message: 'Already validated.' }
		]);
		// Each rule is still named by its whole sentence wherever it is discussed.
		expect(grouped.rules[0].text).toContain('if the invoice lines count is 0');

		// A single refusal shares its start with nothing: it reads whole.
		const alone = view([refusal('r-empty', 'the invoice lines count is 0', 'Add a line first.'), lock]);
		expect(alone.refusalLead).toBeNull();
		expect(alone.rules.every((r) => r.refusal === undefined)).toBe(true);
	});
});

describe('who can do what', () => {
	it('groups the action rows under core and feature, with the roles holding any right', () => {
		const users = createEmptyUsersDraft(P);
		users.roles.push({ id: 'r1', name: 'Sales rep', description: '', userCountMin: 0, userCountMax: null, tone: 'customer', sourceIds: [] });
		users.permissions.push({ roleId: 'r1', capabilityId: 'action:f1:a1', capabilitySource: 'feature' });
		const groups = permissionMatrix(users, [
			{ id: 'action:f1:a1', label: 'Create an invoice', source: 'feature', sourceRefId: 'c1', sourceRefLabel: 'Invoicing', featureId: 'f1', featureLabel: 'Issuance' },
			{ id: 'action:f1:a2', label: 'Validate an invoice', source: 'feature', sourceRefId: 'c1', sourceRefLabel: 'Invoicing', featureId: 'f1', featureLabel: 'Issuance' },
			{ id: 'feature:f9', label: 'Not an action row', source: 'feature', sourceRefId: 'c1', sourceRefLabel: 'Invoicing' }
		]);
		expect(groups).toEqual([
			{
				heading: 'Invoicing · Issuance',
				featureId: 'f1',
				rows: [
					{ capabilityId: 'action:f1:a1', featureId: 'f1', action: 'Create an invoice', roleIds: ['r1'] },
					{ capabilityId: 'action:f1:a2', featureId: 'f1', action: 'Validate an invoice', roleIds: [] }
				]
			}
		]);
	});
});

describe('experience', () => {
	it('shows nothing of a never-authored experience, not even the default theme', () => {
		const view = experienceView(createEmptyExperienceDraft(P));
		expect(view.authored).toBe(false);
		expect(view.palette).toEqual([]);
		expect(view.surfaces).toEqual([]);
	});
});

describe('tech and data', () => {
	it('builds the stack by layer from the board only', () => {
		const architecture = createEmptyArchitectureDraft(P);
		architecture.techChoices.push({ id: 't1', layer: 'data', name: 'PostgreSQL', role: 'Store', version: '15', referenceDocId: null, description: '', repository: 'api/prisma' });
		architecture.derivedTech.push({ name: 'Redis', layer: 'data' });
		expect(stackLayers(architecture)).toEqual([
			{ code: 'data', label: 'DATA', components: [{ id: 't1', name: 'PostgreSQL', role: 'Store', version: 'Version 15', repository: 'api/prisma' }] }
		]);
	});

	it('says an unanswered requirement is not declared rather than guessing it', () => {
		const groups = requirementGroups({ identity: createEmptyIdentityDraft(P), definition: createEmptyDefinitionDraft(P), operations: createEmptyOperationsDraft(P) });
		const security = groups.find((g) => g.key === 'security')!;
		expect(security.rows.find((r) => r.label === 'Encryption')?.values).toEqual([]);
	});

	it('produces no health item without a fact to show', () => {
		expect(healthItems({ data: createEmptyDataDraft(P), definition: createEmptyDefinitionDraft(P), operations: createEmptyOperationsDraft(P), coverage: [] })).toEqual([]);
	});
});

describe('glossary', () => {
	it('counts uses by place and where a term appears, and leaves its words to avoid out [criterion:badcf09f]', () => {
		const term = { id: 't', term: 'Invoice', synonymsAllowed: ['Bill'], synonymsAvoid: ['Facture'], definition: 'A request for payment.' } as unknown as GlossaryTerm;
		const [entry] = glossaryEntries(
			[term],
			[
				{ place: 'Features', text: 'Create an invoice. Send the bill.' },
				{ place: 'Screens', text: 'Facture list' },
				{ place: 'Data', text: '' }
			],
			[{ kind: 'Table', name: 'Invoice' }, { kind: 'Screen', name: 'Customers' }]
		);
		expect(entry.uses).toBe(2);
		expect(entry.places).toEqual([{ place: 'Features', uses: 2 }]);
		expect(entry).not.toHaveProperty('banned');
		expect(entry.where).toEqual(['Table · Invoice']);
	});

	it('lists a place once when two elements of one kind share its name', () => {
		const term = { id: 't', term: 'Domain', synonymsAllowed: [], synonymsAvoid: [], definition: '' } as unknown as GlossaryTerm;
		const [entry] = glossaryEntries(
			[term],
			[],
			[{ kind: 'Screen', name: 'Delete domain' }, { kind: 'Feature', name: 'Custom domain' }, { kind: 'Screen', name: 'Delete domain' }]
		);
		expect(entry.where).toEqual(['Feature · Custom domain', 'Screen · Delete domain']);
	});
});
