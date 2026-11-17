import { describe, expect, it } from 'vitest';
import type { ProjectDataDraft } from '$domain/data';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { actionData, actionsData, fieldsTouched, statesTouched } from './action-data';

/** Change my password, as Kutt's spec writes it: reads the role and the password, writes the password. */
const snapshot = {
	feature: {
		id: 'feat-account',
		surfaces: [
			{
				id: 's1',
				name: 'Settings',
				actions: [
					{
						id: 'a1',
						name: 'Change my password',
						parameters: [{ id: 'p1', name: 'newPassword', type: 'string' }],
						rules: [
							{ id: 'r1', condition: { left: 'session.role', operator: 'equals', right: 'guest' }, effect: { type: 'block_action' } },
							{ id: 'r2', condition: { left: { kind: 'param', name: 'currentPassword' }, operator: 'not_equals', right: { kind: 'state', path: 'account.password' } }, effect: { type: 'block_action' } },
							{ id: 'r3', condition: { left: 'account.email', operator: 'is_empty' }, effect: { type: 'set_state', path: 'account.flagged', value: true } }
						],
						effects: [{ type: 'set_state', path: 'account.password', value: { kind: 'param', name: 'newPassword' } }]
					},
					{ id: 'a2', name: 'Look around', rules: [], effects: [] }
				]
			}
		]
	}
} as unknown as UnspaFeatureSnapshot;

const data = {
	entities: [
		{ id: 'user', name: 'User' },
		{ id: 'audit', name: 'Audit' }
	],
	fields: [
		{ id: 'f-email', entityId: 'user', name: 'email' },
		{ id: 'f-password', entityId: 'user', name: 'password' },
		{ id: 'f-flag', entityId: 'audit', name: 'flagged' }
	],
	rules: { existence: { user: 'account.exists' }, generated: {} }
} as unknown as Pick<ProjectDataDraft, 'entities' | 'fields' | 'rules'>;

describe("a feature's data map marks the fields its actions read or write [criterion:c72a7e79]", () => {
	it('lists each linked field an action reads or writes once, and none no action touches', () => {
		const links = new Map([
			['f-email', 'account.email'],
			['f-password', 'account.password'],
			['f-flag', 'account.flagged'],
			['f-ghost', 'account.password']
		]);
		const quiet = { ...data, fields: [...data.fields, { id: 'f-spare', entityId: 'user', name: 'spare' }] } as typeof data;
		expect(fieldsTouched(snapshot, quiet, links).sort()).toEqual(['f-email', 'f-flag']);
	});

	it('counts a state that carries a field as a further carrier', () => {
		const further = { ...data, rules: { ...data.rules, alsoCarriedBy: { 'f-password': ['account.password'] } } } as typeof data;
		expect(fieldsTouched(snapshot, further, new Map())).toEqual(['f-password']);
	});

	it('marks nothing when no state carries a field', () => {
		expect(fieldsTouched(snapshot, data, new Map())).toEqual([]);
	});
});

describe("an action's details read the data it reads and writes [criterion:d0e0e1a5]", () => {
	const links = new Map([
		['f-email', 'account.email'],
		['f-password', 'account.password'],
		['f-flag', 'account.flagged']
	]);

	it('reads every action of the feature, and nothing without its behavior model', () => {
		const out = actionsData(snapshot, data, links);
		expect(Object.keys(out).sort()).toEqual(['a1', 'a2']);
		expect(out.a1.tables.map((t) => t.table)).toEqual(['Audit', 'User']);
		expect(out.a2).toEqual({ tables: [], untracked: [] });
		expect(actionsData(null, data, links)).toEqual({});
	});

	it('finds what the action reads and what its effects and its rules write', () => {
		const touched = statesTouched(snapshot, 'a1')!;
		expect(touched.writes.sort()).toEqual(['account.flagged', 'account.password']);
		expect(touched.reads.sort()).toEqual(['account.email', 'session.role']);
	});

	it('puts each linked field under its table, a field read and written under Writes', () => {
		const out = actionData(statesTouched(snapshot, 'a1')!, data, links);
		expect(out.tables).toEqual([
			{ tableId: 'audit', table: 'Audit', reads: [], writes: ['flagged'], records: null },
			{ tableId: 'user', table: 'User', reads: ['email'], writes: ['password'], records: null }
		]);
		// The role is a state no field carries: named apart.
		expect(out.untracked).toEqual(['session.role']);
	});

	it('names every state it uses when nothing is linked, the way Kutt read before its links', () => {
		const out = actionData(statesTouched(snapshot, 'a1')!, data, new Map());
		expect(out.tables).toEqual([]);
		expect(out.untracked).toEqual(['account.email', 'account.flagged', 'account.password', 'session.role']);
	});

	it("counts the table's existence state: written, a record is created or removed; read, one is needed", () => {
		const deleted = actionData({ reads: ['session.role'], writes: ['account.exists'] }, data, links);
		expect(deleted.tables).toEqual([{ tableId: 'user', table: 'User', reads: [], writes: [], records: 'written' }]);
		expect(deleted.untracked).toEqual(['session.role']);
		expect(actionData({ reads: ['account.exists', 'account.email'], writes: [] }, data, links).tables).toEqual([
			{ tableId: 'user', table: 'User', reads: ['email'], writes: [], records: 'read' }
		]);
	});

	it('reads nothing for an action that touches no state, and null for an action the feature does not hold', () => {
		expect(actionData(statesTouched(snapshot, 'a2')!, data, links)).toEqual({ tables: [], untracked: [] });
		expect(statesTouched(snapshot, 'nope')).toBeNull();
	});
});
