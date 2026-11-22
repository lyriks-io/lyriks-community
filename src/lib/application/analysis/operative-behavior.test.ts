import { describe, expect, it, vi } from 'vitest';
import { operativeBehavior } from './operative-behavior';
import { ComputeBehaviorAdvisoriesUseCase } from './compute-behavior-advisories';

const marker = { by: 'Sam', at: '2026-11-18T10:00:00.000Z', reason: 'Testing without it' };
const snapshot = (rules: Record<string, unknown>[], updatedAt = '2026-11-18T09:00:00.000Z') => ({
	format: 'unspaghettit' as const,
	version: 1 as const,
	feature: { id: 'feat-validation', name: 'Validation', updatedAt, surfaces: [{ id: 's', rules: [], invariants: [], actions: [{ id: 'a', rules, invariants: [] }] }] }
});

describe('the coherence check reads the operative model', () => {
	it('leaves the disabled elements out of what it reads [criterion:ac-leaf-61afcec9-fa08-4043-b6c3-9ea40d28348f]', async () => {
		const models = { loadProject: vi.fn(async () => null), loadFeature: vi.fn(async () => snapshot([{ id: 'r1' }, { id: 'r2', disabled: marker }])) };
		const read = await operativeBehavior(models).loadFeature('p', 'feat-validation');
		const rules = (read?.feature.surfaces as { actions: { rules: { id: string }[] }[] }[])[0]!.actions[0]!.rules;
		expect(rules.map((r) => r.id)).toEqual(['r1']);
	});

	it('reads again what it kept from before an element was disabled [criterion:ac-leaf-05a1f32d-5f1b-4a5b-947e-95cc26fd0236]', async () => {
		let current = snapshot([{ id: 'r1' }, { id: 'r2' }]);
		const advisor = {
			available: true,
			verify: vi.fn(async () => ({ passed: true, featuresChecked: 1, featuresPassed: 1, featuresFailed: 0, scenariosRun: 0, scenariosFailed: 0, invariantViolations: 0, features: [] })),
			getSpecGaps: vi.fn(async () => [])
		};
		const behavior = {
			loadProject: vi.fn(async () => ({ project: { featureIds: ['feat-validation'] } })),
			loadFeature: vi.fn(async () => current)
		};
		const useCase = new ComputeBehaviorAdvisoriesUseCase(advisor as never, operativeBehavior(behavior as never));
		await useCase.execute('p');
		await useCase.execute('p');
		// Kept: the feature did not move, the engine is not asked again.
		expect(advisor.verify).toHaveBeenCalledTimes(1);
		// Disabling an element writes the feature: what was kept is read again.
		current = snapshot([{ id: 'r1' }, { id: 'r2', disabled: marker }], '2026-11-18T10:00:00.000Z');
		await useCase.execute('p');
		expect(advisor.verify).toHaveBeenCalledTimes(2);
	});
});
