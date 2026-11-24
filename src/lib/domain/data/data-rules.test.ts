import { describe, expect, it } from 'vitest';
import { createEmptyDataDraft, createEntity, createField, type ProjectDataDraft } from './draft';
import {
	automaticLinks,
	dataRuleGroups,
	linkCandidates,
	dataRules,
	generatedInvariants,
	incompatibility,
	missingForProof,
	startsTheSame,
	suggestedStates,
	type BehaviourState,
	existenceProblem,
	existenceReading,
	existenceText,
	parseExistence
} from './data-rules';

/** The shop of the acceptance criterion: Person, Property, CrimeIncident, Order, Item. */
function shop(): ProjectDataDraft {
	const d = createEmptyDataDraft('p1');
	const person = createEntity({ name: 'Person' });
	const property = createEntity({ name: 'Property' });
	const incident = createEntity({ name: 'CrimeIncident' });
	const order = createEntity({ name: 'Order' });
	const item = createEntity({ name: 'Item' });
	d.entities.push(person, property, incident, order, item);
	const rel = (from: string, name: string, to: string, extra = {}) =>
		d.fields.push(createField(from, { name, type: 'relation', relationTargetEntityId: to, ...extra }));
	d.fields.push(createField(person.id, { name: 'id', type: 'uuid', isId: true, isRequired: true }));
	d.fields.push(createField(person.id, { name: 'email', type: 'string', isUnique: true }));
	rel(property.id, 'owner_id', person.id, { isRequired: true });
	rel(incident.id, 'suspectPersonId', person.id);
	rel(order.id, 'items', item.id, { isList: true });
	d.fields.push(
		createField(order.id, {
			name: 'status',
			type: 'enum',
			isRequired: true,
			enumValues: ['draft', 'paid', 'shipped'],
			defaultValue: 'draft'
		})
	);
	return d;
}

const byName = (d: ProjectDataDraft, name: string) => d.entities.find((e) => e.name === name)!;
const fieldOf = (d: ProjectDataDraft, name: string) => d.fields.find((f) => f.name === name)!;
const earsOf = (d: ProjectDataDraft, table: string, lang: 'en' | 'fr' = 'en') =>
	dataRules(d, lang)
		.filter((r) => r.entityId === byName(d, table).id)
		.map((r) => r.ears);

describe('the data model reads as EARS requirements', () => {
	it('writes the sentences of the acceptance criterion, with no column name', () => {
		const d = shop();
		expect(earsOf(d, 'Property')).toEqual(['While a Property exists, the system shall ensure that it has an owner.']);
		expect(earsOf(d, 'CrimeIncident')).toEqual(['The system shall allow a CrimeIncident to have no suspect.']);
		expect(earsOf(d, 'Person')).toEqual(['The system shall prevent two Persons from sharing the same email.']);
		expect(earsOf(d, 'Order')).toEqual([
			'The system shall allow an Order to have any number of Items.',
			'While an Order exists, the system shall ensure that it has a status.',
			'The system shall restrict the status of an Order to draft, paid or shipped.',
			'When an Order is created, the system shall set its status to draft.'
		]);
	});

	it('says how each rule is known, and why the solver does not answer some', () => {
		const rules = dataRules(shop());
		const checkOf = (shape: string) => rules.find((r) => r.shape === shape)!;
		expect(checkOf('required').check).toBe('solver');
		expect(checkOf('choice').check).toBe('solver');
		expect(checkOf('starts-as').check).toBe('compare');
		expect(checkOf('may-have').check).toBe('none');
		expect(checkOf('unique')).toMatchObject({ check: 'out-of-reach', outOfReach: expect.stringContaining('one record at a time') });
	});

	it('reads the rules of one kind a table states for several fields as one sentence', () => {
		const d = createEmptyDataDraft('p1');
		const world = createEntity({ name: 'World' });
		d.entities.push(world);
		for (const name of ['name', 'clock', 'coordinates', 'status']) {
			d.fields.push(createField(world.id, { name, type: 'string', isRequired: true }));
		}
		d.fields.push(createField(world.id, { name: 'motto', type: 'string' }));
		const rules = dataRules(d);
		const [group, ...others] = dataRuleGroups(d, rules);
		expect(others).toEqual([]);
		expect(group?.ears).toBe('While a World exists, the system shall ensure that it has a name, a clock, coordinates and a status.');
		expect(group?.ruleKeys).toEqual(rules.filter((r) => r.shape === 'required').map((r) => r.key));
		expect(dataRuleGroups(d, rules, 'fr')[0]?.ears.replaceAll('\u00a0', ' ')).toBe(
			"Tant qu'un enregistrement « World » existe, le système doit garantir que son « name », son « clock », son « coordinates » et son « status » sont renseignés."
		);
		expect(dataRuleGroups(shop(), dataRules(shop()))).toEqual([]);
	});

	it('writes French around « enregistrement » and the quoted names, never guessing a gender', () => {
		const [sentence] = earsOf(shop(), 'Property', 'fr');
		expect(sentence).toBe(
			"Tant qu'un enregistrement « Property » existe, le système doit garantir que son « owner » est renseigné."
		);
	});
});

describe('what the solver is given', () => {
	const statusState: BehaviourState = { path: 'order.status', type: 'enum', enumValues: ['draft', 'paid', 'shipped'], defaultValue: 'draft' };
	const ownerState: BehaviourState = { path: 'property.ownerId', type: 'string', defaultValue: '' };
	const states = new Map([
		[statusState.path, statusState],
		[ownerState.path, ownerState]
	]);

	it('gives nothing for a field no state carries, and says what is missing', () => {
		const d = shop();
		const required = dataRules(d).find((r) => r.shape === 'required' && r.entityId === byName(d, 'Property').id)!;
		expect(missingForProof(required, d, new Map())).toBe('link');
		const linked = new Map([[fieldOf(d, 'owner_id').id, 'property.ownerId']]);
		expect(missingForProof(required, d, linked)).toBe('existence');
		expect(generatedInvariants(d, linked, states)).toEqual([]);
	});

	it('turns a required field into "while the record exists, the state has a value"', () => {
		const d = shop();
		d.rules = { existence: { [byName(d, 'Property').id]: 'property.listed' }, generated: {} };
		const links = new Map([[fieldOf(d, 'owner_id').id, 'property.ownerId']]);
		const [owner] = generatedInvariants(d, links, states);
		expect(owner?.kind).toBe('required');
		expect(owner?.invariant.name).toBe('While a Property exists, the system shall ensure that it has an owner.');
		expect(owner?.invariant.message).toBe('A Property exists without an owner.');
		expect(owner?.invariant.condition).toEqual({
			kind: 'any',
			conditions: [
				{ kind: 'not', condition: { left: 'property.listed', operator: 'is_true' } },
				{
					kind: 'all',
					conditions: [
						{ left: 'property.ownerId', operator: 'exists' },
						{ left: 'property.ownerId', operator: 'not_equals', right: '' }
					]
				}
			]
		});
	});

	it('reads a record as existing while its status says so', () => {
		const d = shop();
		d.rules = { existence: { [byName(d, 'Property').id]: 'property.status != none' }, generated: {} };
		const links = new Map([[fieldOf(d, 'owner_id').id, 'property.ownerId']]);
		const [owner] = generatedInvariants(d, links, states);
		expect(owner?.invariant.condition).toMatchObject({
			kind: 'any',
			conditions: [{ kind: 'not', condition: { left: 'property.status', operator: 'not_equals', right: 'none' } }, {}]
		});
		d.rules = { existence: { [byName(d, 'Property').id]: 'property.status in listed|sold' }, generated: {} };
		const [among] = generatedInvariants(d, links, states);
		expect((among?.invariant.condition as { conditions: unknown[] }).conditions[0]).toEqual({
			kind: 'not',
			condition: {
				kind: 'any',
				conditions: [
					{ left: 'property.status', operator: 'equals', right: 'listed' },
					{ left: 'property.status', operator: 'equals', right: 'sold' }
				]
			}
		});
	});

	it('turns a choice field into "the state holds one of its values"', () => {
		const d = shop();
		const links = new Map([[fieldOf(d, 'status').id, 'order.status']]);
		const choice = generatedInvariants(d, links, states).find((g) => g.kind === 'choice');
		expect(choice?.invariant.message).toBe('An Order has a status other than draft, paid or shipped.');
		expect(choice?.invariant.condition).toEqual({
			kind: 'any',
			conditions: ['draft', 'paid', 'shipped'].map((value) => ({ left: 'order.status', operator: 'equals', right: value }))
		});
	});
});

describe('tying a field to a state', () => {
	it('refuses another kind of value, or other choices, and says which', () => {
		const d = shop();
		const status = fieldOf(d, 'status');
		expect(incompatibility(status, { path: 'order.status', type: 'string', defaultValue: '' })).toBe(
			'That state holds a string, the field an enum.'
		);
		expect(
			incompatibility(status, { path: 'order.status', type: 'enum', enumValues: ['draft', 'shipped', 'cancelled'], defaultValue: 'draft' })
		).toBe('That state allows draft, shipped or cancelled, the field draft, paid or shipped.');
		expect(
			incompatibility(status, { path: 'order.status', type: 'enum', enumValues: ['shipped', 'draft', 'paid'], defaultValue: 'draft' })
		).toBeNull();
	});

	it('suggests a status only from a path that names the table', () => {
		const d = shop();
		const states: BehaviourState[] = [
			{ path: 'order.status', type: 'enum', enumValues: ['draft', 'paid', 'shipped'], defaultValue: 'draft' },
			{ path: 'accident.status', type: 'enum', enumValues: ['draft', 'paid', 'shipped'], defaultValue: 'draft' },
			{ path: 'order.total', type: 'number', defaultValue: 0 },
			{ path: 'order.state', type: 'string', defaultValue: '' }
		];
		expect(suggestedStates(fieldOf(d, 'status'), byName(d, 'Order'), states).map((s) => s.path)).toEqual([
			'order.status'
		]);
		expect(suggestedStates(fieldOf(d, 'status'), byName(d, 'Order'), states.slice(1))).toEqual([]);
	});

	it('never suggests a state that names only part of a telling field name', () => {
		const d = shop();
		const person = byName(d, 'Person');
		const field = (name: string) => createField(person.id, { name, type: 'string' });
		const states: BehaviourState[] = [
			{ path: 'counter.unitPrice', type: 'string', defaultValue: '' },
			{ path: 'business.formName', type: 'string', defaultValue: '' }
		];
		expect(suggestedStates(field('unitMass'), person, states)).toEqual([]);
		expect(suggestedStates(field('displayName'), person, states)).toEqual([]);
	});

	it('suggests only states whose path names the table, even for a telling field name', () => {
		const d = shop();
		const states: BehaviourState[] = [
			{ path: 'account.email', type: 'string', defaultValue: '' },
			{ path: 'person.email', type: 'string', defaultValue: '' },
			{ path: 'person.name', type: 'string', defaultValue: '' }
		];
		expect(suggestedStates(fieldOf(d, 'email'), byName(d, 'Person'), states).map((s) => s.path)).toEqual([
			'person.email'
		]);
	});

	it('compares a starting value with the state’s', () => {
		const status = fieldOf(shop(), 'status');
		expect(startsTheSame(status, { path: 'order.status', type: 'enum', defaultValue: 'draft' })).toBe(true);
		expect(startsTheSame(status, { path: 'order.status', type: 'enum', defaultValue: 'paid' })).toBe(false);
	});
});

describe('links Lyriks makes by itself', () => {
	const statuses = ['draft', 'paid', 'shipped'];
	const enumState = (path: string): BehaviourState => ({ path, type: 'enum', enumValues: statuses, defaultValue: 'draft' });

	it('links a field only one state can hold: its table in the path, its own name last', () => {
		const d = shop();
		const status = fieldOf(d, 'status');
		const states = [enumState('order.status'), enumState('accident.status'), { path: 'order.statusLabel', type: 'string', defaultValue: '' } as BehaviourState];
		expect(automaticLinks(d, states, new Map())).toEqual([{ fieldId: status.id, statePath: 'order.status' }]);
	});

	it('finds the same link among thousands of states, words in any order, a state already carrying a field left out', () => {
		const d = shop();
		const status = fieldOf(d, 'status');
		const noise = Array.from({ length: 5000 }, (_, i) => ({ path: `area${i}.record${i}.value${i}`, type: 'string', defaultValue: '' }) as BehaviourState);
		// Whatever the order of the states, the one named like the field under its table is found.
		expect(automaticLinks(d, [...noise, enumState('order.status'), ...noise], new Map())).toEqual([{ fieldId: status.id, statePath: 'order.status' }]);
		// A state another field already carries holds no second one.
		const other = byName(d, 'Order');
		const carrier = createField(other.id, { name: 'Note', type: 'string' });
		d.fields.push(carrier);
		expect(automaticLinks(d, [enumState('order.status')], new Map([[carrier.id, 'order.status']]))).toEqual([]);
	});

	it('leaves alone a linked field, a field a person unlinked, two candidates, or two fields for one state', () => {
		const d = shop();
		const status = fieldOf(d, 'status');
		const one = [enumState('order.status')];
		expect(automaticLinks(d, one, new Map([[status.id, 'order.other']]))).toEqual([]);
		expect(automaticLinks(d, one, new Map(), new Set([status.id]))).toEqual([]);
		expect(automaticLinks(d, [...one, enumState('shipping.order.status')], new Map())).toEqual([]);
		const order = byName(d, 'Order');
		d.fields.push(createField(order.id, { name: 'Status', type: 'enum', enumValues: statuses }));
		expect(automaticLinks(d, one, new Map())).toEqual([]);
	});

	it('never takes a state that already carries another field, nor one of another kind', () => {
		const d = shop();
		expect(automaticLinks(d, [enumState('order.status')], new Map([['someone-else', 'order.status']]))).toEqual([]);
		expect(automaticLinks(d, [{ path: 'order.status', type: 'number', defaultValue: 0 }], new Map())).toEqual([]);
	});

	it('gives an AI client wider candidates, those naming the table first', () => {
		const d = shop();
		const found = linkCandidates(fieldOf(d, 'status'), byName(d, 'Order'), [
			enumState('accident.status'),
			enumState('order.status'),
			{ path: 'order.total', type: 'number', defaultValue: 0 }
		]);
		expect(found.map((s) => s.path)).toEqual(['order.status', 'accident.status']);
	});
});

describe('when a record exists', () => {
	const status: BehaviourState = { path: 'service.status', type: 'enum', enumValues: ['none', 'offered', 'active'], defaultValue: 'none' };
	const flag: BehaviourState = { path: 'integrity.receiptExists', type: 'boolean', defaultValue: false };
	const count: BehaviourState = { path: 'service.count', type: 'number', defaultValue: 0 };

	it('reads a yes-or-no state, or a condition on a status, and writes it back the same', () => {
		expect(parseExistence('integrity.receiptExists')).toEqual({ path: 'integrity.receiptExists', operator: 'is_true', values: [] });
		expect(parseExistence('service.status != none')).toEqual({ path: 'service.status', operator: 'not_in', values: ['none'] });
		expect(parseExistence('service.status = "active"')).toEqual({ path: 'service.status', operator: 'in', values: ['active'] });
		expect(parseExistence('service.status in offered|active')).toEqual({ path: 'service.status', operator: 'in', values: ['offered', 'active'] });
		expect(parseExistence('service.status not in none, closed')).toEqual({ path: 'service.status', operator: 'not_in', values: ['none', 'closed'] });
		for (const text of ['service.status != none', 'service.status in offered|active', 'integrity.receiptExists']) {
			expect(existenceText(parseExistence(text)!)).toBe(text);
		}
		expect(parseExistence('status')).toBeNull();
		expect(parseExistence('service.status !=')).toBeNull();
		expect(parseExistence('service.status = a|b')).toBeNull();
	});

	it('refuses a number, a value the status does not allow, and a condition on a yes-or-no state', () => {
		expect(existenceProblem(parseExistence('service.status != none')!, status)).toBeNull();
		expect(existenceProblem(parseExistence('integrity.receiptExists')!, flag)).toBeNull();
		expect(existenceProblem(parseExistence('service.status != gone')!, status)).toBe(
			'"service.status" does not allow "gone": it allows "none", "offered", "active".'
		);
		expect(existenceProblem(parseExistence('service.count != 0')!, count)).toMatch(/Only a yes-or-no state/);
		expect(existenceProblem(parseExistence('service.status')!, status)).toMatch(/not a yes-or-no state/);
		expect(existenceProblem(parseExistence('integrity.receiptExists = true')!, flag)).toMatch(/name it alone/);
	});

	it('says it on the page', () => {
		expect(existenceReading(parseExistence('service.status != none')!)).toBe('service.status is not "none"');
		expect(existenceReading(parseExistence('service.status in offered|active')!)).toBe('service.status is one of "offered", "active"');
		expect(existenceReading(parseExistence('integrity.receiptExists')!)).toBe('integrity.receiptExists is true');
	});
});

describe('a record always in play, and a text that is not empty', () => {
	const text: BehaviourState = { path: 'speech.text', type: 'string', defaultValue: '' };

	it('reads always, and an empty text quoted, and writes them back the same', () => {
		expect(parseExistence('always')).toEqual({ path: '', operator: 'always', values: [] });
		expect(parseExistence('speech.text != ""')).toEqual({ path: 'speech.text', operator: 'not_in', values: [''] });
		expect(existenceText(parseExistence('speech.text != ""')!)).toBe('speech.text != ""');
		expect(existenceText(parseExistence('always')!)).toBe('always');
		expect(existenceProblem(parseExistence('speech.text != ""')!, text)).toBeNull();
		expect(existenceReading(parseExistence('always')!)).toBe('always');
	});

	it('gives the solver "the field has a value" alone for a record always in play', () => {
		const d = shop();
		d.rules = { existence: { [byName(d, 'Property').id]: 'always' }, generated: {} };
		const owner: BehaviourState = { path: 'property.ownerId', type: 'string', defaultValue: 'p1' };
		const links = new Map([[fieldOf(d, 'owner_id').id, 'property.ownerId']]);
		const [rule] = generatedInvariants(d, links, new Map([[owner.path, owner]]));
		expect(rule?.invariant.condition).toEqual({
			kind: 'all',
			conditions: [
				{ left: 'property.ownerId', operator: 'exists' },
				{ left: 'property.ownerId', operator: 'not_equals', right: '' }
			]
		});
	});
});

describe('a field links to the state that carries it in the behaviour\'s own terms [criterion:c8ff60f9]', () => {
	const d = shop();
	const entity = d.entities[0]!;
	const optional = (type: 'string' | 'datetime' | 'relation') => createField(entity.id, { name: 'token', type });

	it('takes a time on the clock for a date', () => {
		expect(incompatibility(optional('datetime'), { path: 'reset.expiresAt', type: 'number', defaultValue: 0 })).toBeNull();
		expect(incompatibility(optional('datetime'), { path: 'reset.expiresAt', type: 'string', defaultValue: '' })).toBeNull();
	});

	it('takes a yes-or-no state for an optional field, as whether it is filled', () => {
		expect(incompatibility(optional('string'), { path: 'account.resetPending', type: 'boolean', defaultValue: false })).toBeNull();
		expect(incompatibility(optional('relation'), { path: 'link.hasOwner', type: 'boolean', defaultValue: false })).toBeNull();
	});

	it('reads choices written in another case as the same values', () => {
		const role = createField(entity.id, { name: 'role', type: 'enum', isRequired: true, enumValues: ['USER', 'ADMIN'] });
		expect(incompatibility(role, { path: 'account.role', type: 'enum', enumValues: ['user', 'admin'], defaultValue: 'user' })).toBeNull();
	});

	it('refuses it for a required field, a choice, or another pairing', () => {
		const required = createField(entity.id, { name: 'email', type: 'string', isRequired: true });
		expect(incompatibility(required, { path: 'account.hasEmail', type: 'boolean', defaultValue: false })).toBe(
			'A required field never links to a yes-or-no state that only says whether it is filled.'
		);
		expect(incompatibility(fieldOf(d, 'status'), { path: 'order.paid', type: 'boolean', defaultValue: false })).toBe(
			'That state holds a boolean, the field an enum.'
		);
		expect(incompatibility(optional('string'), { path: 'account.count', type: 'number', defaultValue: 0 })).toBe(
			'That state holds a number, the field a string.'
		);
	});
});
