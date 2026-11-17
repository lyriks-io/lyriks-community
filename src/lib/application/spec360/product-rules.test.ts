import { describe, expect, it } from 'vitest';
import type { KernelRulesReadModel } from '../specification/index-feature-rules';
import { productRules } from './product-rules';

const invariant = (nodeId: string, statement: string, kind: 'project' | 'action' = 'project') => ({
	nodeId,
	statement,
	origin: kind === 'project' ? { kind, featureId: null, featureName: null } : { kind, featureId: 'f1', featureName: 'F1', actionId: 'a1' }
});

const model = (groups: { featureId: string | null; rules: ReturnType<typeof invariant>[] }[]) =>
	({ groups: groups.map((g) => ({ ...g, label: g.featureId ?? 'Project-wide' })), total: 0, missingDescription: 0 }) as unknown as KernelRulesReadModel;

describe('the rules the whole product keeps [criterion:ac-leaf-ac-rules-product-card]', () => {
	it('are the project-level invariants, each as its sentence', () => {
		const rules = model([
			{ featureId: 'f1', rules: [invariant('r1', 'A feature rule', 'action')] },
			{ featureId: null, rules: [invariant('inv-1', 'The system shall always ensure that an expired link never redirects.')] }
		]);
		expect(productRules(rules)).toEqual([{ id: 'inv-1', text: 'The system shall always ensure that an expired link never redirects.' }]);
	});

	it('leave out the rules generated from the Data map: they read with their table', () => {
		const rules = model([
			{ featureId: null, rules: [invariant('gen-7', 'A Link has an address'), invariant('inv-2', 'A domain answers only for its owner')] }
		]);
		expect(productRules(rules, { 'gen-7': { entityId: 'e', fieldId: 'f', kind: 'required' } })).toEqual([{ id: 'inv-2', text: 'A domain answers only for its owner' }]);
	});

	it('are none when the project holds no invariant of its own', () => {
		expect(productRules(model([{ featureId: 'f1', rules: [invariant('r1', 'x', 'action')] }]))).toEqual([]);
		expect(productRules(model([{ featureId: null, rules: [invariant('gen-1', 'x')] }]), { 'gen-1': {} })).toEqual([]);
	});
});
