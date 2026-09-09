import { describe, expect, it } from 'vitest';
import { createEmptyFinopsDraft, createRule, type ProjectFinopsDraft } from './draft';
import {
	compileRules,
	deriveScopedPlans,
	finopsKeyValue,
	governorVerdict,
	isFrozen,
	spentRatio,
	type FinopsSignals
} from './compile';

describe('createRule id robustness', () => {
	it('always mints a string id, even when overrides carry id: undefined', () => {
		// An untrusted payload with no id parses to `id: undefined`; it must not
		// clobber the generated id (else keyed-each blocks collide on `undefined`).
		const a = createRule({ id: undefined, kind: 'block_scope' });
		const b = createRule({ id: undefined, kind: 'route_cheap_model' });
		expect(typeof a.id).toBe('string');
		expect(a.id.length).toBeGreaterThan(0);
		expect(a.id).not.toBe(b.id);
	});

	it('keeps an explicitly provided string id', () => {
		expect(createRule({ id: 'fixed-id' }).id).toBe('fixed-id');
	});
});

/** A draft + signals tuned like the corresponding unspa scenario (feature 133c6adc). */
function setup(
	draft: Partial<ProjectFinopsDraft> = {},
	signals: Partial<FinopsSignals> = {}
): { draft: ProjectFinopsDraft; signals: FinopsSignals } {
	return {
		// A named scope means the governor gates on `scopeReadiness` (these cases
		// exercise per-scope readiness); with no scope it gates on the live signal.
		draft: { ...createEmptyFinopsDraft('p'), scopeLabel: 'Checkout', ...draft },
		signals: { readinessScore: 90, coherenceScore: 90, blockingGapCount: 0, ...signals }
	};
}

describe('finops compileRules — mirror of unspa feature 133c6adc scenarios', () => {
	it('blocks an immature scope and freezes generation under enforcement', () => {
		const { draft, signals } = setup(
			{ scopeReadiness: 40, maturityThreshold: 70, enforcementMode: 'enforced' },
			{ coherenceScore: 90 }
		);
		const rules = compileRules(draft, signals);
		expect(rules).toHaveLength(1);
		expect(rules[0].kind).toBe('block_scope');
		expect(isFrozen(draft, signals)).toBe(true);
	});

	it('leaves a green scope unrestricted', () => {
		const { draft, signals } = setup({
			scopeReadiness: 95,
			enforcementMode: 'enforced'
		});
		expect(compileRules(draft, signals)).toHaveLength(0);
		expect(isFrozen(draft, signals)).toBe(false);
	});

	it('proposes a route-to-cheaper-model rule when coherence is weak', () => {
		const { draft, signals } = setup(
			{ scopeReadiness: 95, coherenceThreshold: 80 },
			{ coherenceScore: 55 }
		);
		const rules = compileRules(draft, signals);
		expect(rules).toHaveLength(1);
		expect(rules[0].kind).toBe('route_cheap_model');
		expect(isFrozen(draft, signals)).toBe(false);
	});

	it('freezes on a blown budget under enforcement but never in advisory mode', () => {
		const enforced = setup({
			monthlyBudgetUsd: 100,
			spentUsd: 120,
			enforcementMode: 'enforced'
		});
		expect(spentRatio(enforced.draft)).toBeCloseTo(1.2);
		expect(isFrozen(enforced.draft, enforced.signals)).toBe(true);

		const advisory = setup({
			monthlyBudgetUsd: 100,
			spentUsd: 120,
			enforcementMode: 'advisory'
		});
		expect(isFrozen(advisory.draft, advisory.signals)).toBe(false);
	});

	it('caps the budget when spend crosses the tighten line', () => {
		const { draft, signals } = setup({
			monthlyBudgetUsd: 100,
			spentUsd: 90,
			budgetTightenRatio: 0.8,
			scopeReadiness: 95
		});
		const rules = compileRules(draft, signals);
		expect(rules.map((r) => r.kind)).toContain('budget_cap');
	});

	it('blocks when a blocking coherence gap is open even if readiness is high', () => {
		const { draft, signals } = setup(
			{ scopeReadiness: 95, enforcementMode: 'enforced' },
			{ blockingGapCount: 2 }
		);
		const rules = compileRules(draft, signals);
		expect(rules.some((r) => r.kind === 'block_scope' && r.source === 'coherence')).toBe(true);
		expect(isFrozen(draft, signals)).toBe(true);
	});
});

describe('deriveScopedPlans — one LiteLLM key per governed feature', () => {
	const enforced = (): ProjectFinopsDraft => ({
		...createEmptyFinopsDraft('p'),
		enforcementMode: 'enforced',
		monthlyBudgetUsd: 100,
		budgetTightenRatio: 0.8
	});

	it('scopes each guardrail to its own key — a feature rule never touches another', () => {
		const draft = enforced();
		draft.rules = [
			createRule({ kind: 'block_scope', status: 'active', scopeLabel: 'Checkout' }),
			createRule({ kind: 'route_cheap_model', status: 'active', scopeLabel: 'Search' })
		];
		const plans = deriveScopedPlans(draft);
		expect(plans.map((p) => p.scope).sort()).toEqual(['Checkout', 'Search']);
		const checkout = plans.find((p) => p.scope === 'Checkout')!;
		const search = plans.find((p) => p.scope === 'Search')!;
		expect(checkout.plan.blocked).toBe(true);
		expect(search.plan.blocked).toBe(false);
		expect(search.plan.models).toEqual(['gpt-4o-mini']);
		// The Checkout block must not leak into Search's key.
		expect(search.plan.models).not.toEqual([]);
	});

	it('maps the whole-project scope to the bare project key, features to suffixed keys', () => {
		expect(finopsKeyValue('p')).toBe('sk-lyriks-p');
		expect(finopsKeyValue('p', '')).toBe('sk-lyriks-p');
		expect(finopsKeyValue('p', 'Checkout Flow')).toBe('sk-lyriks-p-checkout-flow');
	});

	it('leaves every key unrestricted in advisory mode (air-gap default)', () => {
		const draft = { ...enforced(), enforcementMode: 'advisory' as const };
		draft.rules = [createRule({ kind: 'block_scope', status: 'active', scopeLabel: 'Checkout' })];
		const [checkout] = deriveScopedPlans(draft);
		expect(checkout.plan.blocked).toBe(false);
	});

	it('ignores retired rules and produces no key when nothing is active', () => {
		const draft = enforced();
		draft.rules = [createRule({ kind: 'block_scope', status: 'retired', scopeLabel: 'Checkout' })];
		expect(deriveScopedPlans(draft)).toHaveLength(0);
	});

	it('caps each feature key at its own explicit per-feature budget', () => {
		const draft = enforced(); // monthlyBudget 100, tighten 0.8 → fallback cap 80
		draft.rules = [
			createRule({ kind: 'budget_cap', status: 'active', scopeLabel: 'Checkout', capUsd: 30 }),
			createRule({ kind: 'budget_cap', status: 'active', scopeLabel: 'Search' }) // no explicit cap
		];
		const plans = deriveScopedPlans(draft);
		expect(plans.find((p) => p.scope === 'Checkout')!.plan.maxBudgetUsd).toBe(30);
		expect(plans.find((p) => p.scope === 'Search')!.plan.maxBudgetUsd).toBe(80);
	});
});

describe('governorVerdict — the one-glance answer', () => {
	it('holds when the (live) project readiness is below the bar', () => {
		// No named scope → gates on the live readiness signal (dead-simple default).
		const { draft, signals } = setup({ scopeLabel: '', maturityThreshold: 70 }, { readinessScore: 45 });
		expect(governorVerdict(draft, signals).level).toBe('hold');
	});

	it('holds on open blocking gaps regardless of readiness', () => {
		const { draft, signals } = setup({ scopeLabel: '' }, { readinessScore: 95, blockingGapCount: 1 });
		expect(governorVerdict(draft, signals).level).toBe('hold');
	});

	it('recommends guardrails when coherence is weak but the scope is mature', () => {
		const { draft, signals } = setup(
			{ scopeLabel: '', coherenceThreshold: 80 },
			{ readinessScore: 95, coherenceScore: 55 }
		);
		expect(governorVerdict(draft, signals).level).toBe('guardrails');
	});

	it('is clear when readiness, coherence and budget are all healthy', () => {
		const { draft, signals } = setup(
			{ scopeLabel: '', monthlyBudgetUsd: 500, spentUsd: 50 },
			{ readinessScore: 95, coherenceScore: 95 }
		);
		expect(governorVerdict(draft, signals).level).toBe('clear');
	});
});
