import { describe, expect, it } from 'vitest';
import { buildRuleInventory } from './build-rule-inventory';
import { createEmptyDefinitionDraft, type FoundationDefinitionDraft } from '$domain/foundation';
import { createEmptyUsersDraft, createRole, type ProjectUsersDraft } from '$domain/users';
import { createEmptyExperienceDraft, createJourney, createOperation, createStep } from '$domain/experience';

const NB = ' ';

function definition(): FoundationDefinitionDraft {
	const d = createEmptyDefinitionDraft('p1');
	d.business.slas = [{ metric: 'Uptime', commitment: '99.9%', penalty: '5% credit' } as never];
	d.security.authentication = ['email_password', 'sso'];
	d.security.dataRetention = [{ dataType: 'Invoices', duration: '10 years', actionAfter: 'archival' }];
	return d;
}

function users(): ProjectUsersDraft {
	const u = createEmptyUsersDraft('p1');
	return {
		...u,
		roles: [createRole({ id: 'R1', name: 'Accountant' })],
		offStructureCapabilities: [{ id: 'cap1', label: 'Ledger' } as never],
		// Stored before 2026-11-02, so with verbs: two lines read as one access.
		permissions: [
			{ roleId: 'R1', capabilityId: 'cap1', capabilitySource: 'off_structure', action: 'read' } as never,
			{ roleId: 'R1', capabilityId: 'cap1', capabilitySource: 'off_structure', action: 'update' } as never
		]
	};
}

function experience() {
	const e = createEmptyExperienceDraft('p1');
	e.journeys = [createJourney('c', 0, { id: 'J1', name: 'Close month' })];
	e.steps = [createStep('J1', 0, { id: 'S1', name: 'Review' }), createStep('J1', 1, { id: 'S2', name: 'Lock' })];
	e.stepOperations = [createOperation('S2', 0, { id: 'O1', kind: 'api', label: 'lockPeriod' })];
	return e;
}

const statements = (lang?: 'en' | 'fr') =>
	Object.fromEntries(
		buildRuleInventory(definition(), users(), experience(), lang).map((r) => [r.id, [r.label, r.statement]])
	);

describe('buildRuleInventory in the spec language', () => {
	it('keeps the English wording by default', () => {
		const en = statements();
		// SLAs no longer read as rules (spec: criterion e8a65d93).
		expect(en['sla-0']).toBeUndefined();
		expect(en['sec-auth']).toEqual(['Authentication', 'Sign-in is via: Email / password, SSO.']);
		expect(en['ret-0']).toEqual(['Retention · Invoices', 'Keep Invoices for 10 years, then archival.']);
		expect(en['perm-R1-cap1-access']).toEqual(['Accountant → Ledger', 'Accountant has access to ledger.']);
		expect(Object.keys(en).filter((id) => id.startsWith('perm-'))).toEqual(['perm-R1-cap1-access']);
		expect(en['jr-J1']).toEqual(['Close month', 'Steps: Review → Lock. Calls: lockPeriod.']);
	});

	it('writes every label and statement in French, names quoted as they are', () => {
		const fr = statements('fr');
		expect(fr['sla-0']).toBeUndefined();
		expect(fr['sec-auth']).toEqual([
			'Authentification',
			`Connexion par${NB}: e-mail et mot de passe, SSO.`
		]);
		expect(fr['ret-0']).toEqual([
			'Conservation · Invoices',
			`Conserver «${NB}Invoices${NB}» pendant 10 years, puis archiver.`
		]);
		expect(fr['perm-R1-cap1-access']).toEqual([
			'Accountant → Ledger',
			`«${NB}Accountant${NB}» a accès à «${NB}Ledger${NB}».`
		]);
		expect(fr['jr-J1']).toEqual(['Close month', `Étapes${NB}: Review → Lock. Appels${NB}: lockPeriod.`]);
	});

	it('keeps the same rule ids in every language', () => {
		expect(Object.keys(statements('fr'))).toEqual(Object.keys(statements('en')));
	});
});
