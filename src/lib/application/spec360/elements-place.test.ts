import { describe, expect, it } from 'vitest';
import { specElements, type SpecElementsInput } from './elements';

const input = {
	pitch: 'A pitch',
	hasProblem: false,
	hasTarget: false,
	users: [{ id: 'u', name: 'Admin' }],
	hasPermissions: false,
	outline: { cores: [{ id: 'c', name: 'Access', description: '', features: [{ id: 'f', name: 'Accounts', description: '' }] }] },
	actions: { f: [{ id: 'a', name: 'Sign in' }] },
	rules: { groups: [{ featureId: 'f', rules: [{ nodeId: 'r', statement: 'When the user signs in', origin: { kind: 'action', actionId: 'a' } }] }] },
	experience: { authored: false, journeys: [], components: [] },
	entityCount: 0,
	dataFacts: [],
	stack: [],
	health: [],
	requirements: [],
	constraints: [],
	terms: [{ id: 't', term: 'Link' }]
} as unknown as SpecElementsInput;

describe('each element says where it sits in the specification [criterion:03192a6e]', () => {
	const at = (id: string) => specElements(input).find((e) => e.id === id);

	it('names the page of Knowledge when no feature says more', () => {
		expect(at('product')?.place).toBe('Overview');
		expect(at('role:u')?.place).toBe('Users');
		expect(at('core:c')?.place).toBe('Features');
		expect(at('term:t')?.place).toBe('Glossary');
	});

	it('names the core feature and the feature, and the action a rule belongs to', () => {
		expect(at('feature:f')?.place).toBe('Access');
		expect(at('action:f:a')).toMatchObject({ place: 'Access › Accounts' });
		expect(at('action:f:a')?.under).toBeUndefined();
		expect(at('rule:f:r')).toMatchObject({ place: 'Access › Accounts', under: 'action:f:a' });
	});
});
