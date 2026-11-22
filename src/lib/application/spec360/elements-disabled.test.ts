import { describe, expect, it } from 'vitest';
import { specElements, type SpecElementsInput } from './elements';

const marker = { by: 'Sam', at: '2026-11-18T10:00:00.000Z', reason: 'Testing without it' };
const input = (over: { actions?: unknown; rules?: unknown; disabledFeatures?: unknown }) =>
	({
		pitch: '',
		hasProblem: false,
		hasTarget: false,
		users: [],
		hasPermissions: false,
		outline: { cores: [{ id: 'c', name: 'Access', description: '', features: [{ id: 'f', name: 'Accounts', description: '' }] }] },
		actions: over.actions ?? { f: [{ id: 'a', name: 'Sign in' }, { id: 'b', name: 'Sign out' }] },
		disabledFeatures: over.disabledFeatures,
		rules: over.rules ?? {
			groups: [{ featureId: 'f', rules: [
				{ nodeId: 'r1', statement: 'When the user signs in', origin: { kind: 'action', actionId: 'a' } },
				{ nodeId: 'r2', statement: 'When the account is locked', origin: { kind: 'action', actionId: 'a' } }
			] }]
		},
		experience: { authored: false, journeys: [], components: [] },
		entityCount: 0,
		dataFacts: [],
		stack: [],
		health: [],
		requirements: [],
		constraints: [],
		terms: []
	}) as unknown as SpecElementsInput;

const ids = (i: SpecElementsInput) => specElements(i).map((e) => e.id);

describe('In Knowledge a disabled element leaves the validation counts while it is disabled [criterion:ac-leaf-8642c6f0-caac-4953-81b3-0987ea0dd613]', () => {
	it('counts every element in force', () => {
		expect(ids(input({}))).toEqual(expect.arrayContaining(['action:f:a', 'action:f:b', 'rule:f:r1', 'rule:f:r2']));
	});

	it('leaves out a disabled rule, and leaves the rules in force as they were', () => {
		const off = input({ rules: { groups: [{ featureId: 'f', rules: [
			{ nodeId: 'r1', statement: 'When the user signs in', origin: { kind: 'action', actionId: 'a' } },
			{ nodeId: 'r2', statement: 'When the account is locked', origin: { kind: 'action', actionId: 'a' }, disabled: marker }
		] }] } });
		expect(ids(off)).not.toContain('rule:f:r2');
		expect(ids(off)).toContain('rule:f:r1');
		// The rule in force beside it reads exactly as before: its validation stands.
		const kept = (i: SpecElementsInput) => specElements(i).find((e) => e.id === 'rule:f:r1')?.fingerprint;
		expect(kept(off)).toBe(kept(input({})));
	});

	it('leaves out a disabled action with the rules it holds', () => {
		const off = input({ actions: { f: [{ id: 'a', name: 'Sign in', disabled: marker }, { id: 'b', name: 'Sign out' }] } });
		expect(ids(off)).not.toContain('action:f:a');
		expect(ids(off)).not.toContain('rule:f:r1');
		expect(ids(off)).toContain('action:f:b');
	});

	it('leaves out a feature disabled as a whole, with everything it holds', () => {
		const off = ids(input({ disabledFeatures: { f: marker } }));
		expect(off).not.toContain('feature:f');
		expect(off.filter((id) => id.includes(':f:'))).toEqual([]);
		expect(ids(input({}))).toContain('feature:f');
	});
});
