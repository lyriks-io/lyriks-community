import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureRuleVerdicts, RuleVerdict } from '$application/analysis/rule-verdicts';
import { RuleVerdictsStore } from './rule-verdicts.svelte';

const clean: RuleVerdict = { kind: 'no-flaw', label: 'No flaw found', tone: 'success', flaw: false };
const answer = (over: Partial<FeatureRuleVerdicts> = {}): FeatureRuleVerdicts => ({ featureId: 'f', solver: 'ran', scope: null, rules: { r1: clean }, actions: {}, flaws: 0, ...over });
const asks = (body: FeatureRuleVerdicts) => {
	const fetcher = vi.fn(async () => new Response(JSON.stringify(body)));
	vi.stubGlobal('fetch', fetcher);
	return fetcher;
};
const rules = (text: string, kind: 'rule' | 'invariant' = 'rule') => [{ rules: [{ id: 'r1', text, kind }] }];

describe('a rule reads what the solver says about it [criterion:be4c97ee]', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('proves a feature once while its rules read the same', async () => {
		const fetcher = asks(answer());
		const store = new RuleVerdictsStore('p');
		store.proveFeature('f', rules('When a, the system shall b.'));
		await vi.waitFor(() => expect(store.ruleVerdict('f', 'r1')).toEqual(clean));
		store.proveFeature('f', rules('When a, the system shall b.'));
		await Promise.resolve();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('drops the verdict and proves again once the rules read otherwise', async () => {
		const fetcher = asks(answer());
		const store = new RuleVerdictsStore('p');
		store.proveFeature('f', rules('When a, the system shall b.'));
		await vi.waitFor(() => expect(store.ruleVerdict('f', 'r1')).toEqual(clean));
		store.proveFeature('f', rules('When a, the system shall c.'));
		expect(store.ruleVerdict('f', 'r1')).toBeUndefined();
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
	});

	it('asks for the statements only when the feature holds some', async () => {
		const fetcher = asks(answer());
		new RuleVerdictsStore('p').proveFeature('f', rules('When a, the system shall b.'));
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
		expect(String(fetcher.mock.calls[0])).toContain('part=rules');

		const both = asks(answer());
		new RuleVerdictsStore('p').proveFeature('f', rules('The system shall always b.', 'invariant'));
		await vi.waitFor(() => expect(both).toHaveBeenCalledTimes(2));
		expect(String(both.mock.calls[1])).toContain('part=statements');
	});

	it('says why a feature carries no verdict, and nothing when the solver ran', async () => {
		asks(answer({ solver: 'unavailable', scope: { text: 'The solver could not read this feature.', open: true }, rules: {} }));
		const store = new RuleVerdictsStore('p');
		expect(store.unproven('f')).toBeNull();
		store.proveFeature('f', rules('When a, the system shall b.'));
		await vi.waitFor(() => expect(store.unproven('f')).toBe('The solver could not read this feature.'));

		asks(answer());
		const ran = new RuleVerdictsStore('p');
		ran.proveFeature('f', rules('When a, the system shall b.'));
		await vi.waitFor(() => expect(ran.ruleVerdict('f', 'r1')).toEqual(clean));
		expect(ran.unproven('f')).toBeNull();
	});
});
