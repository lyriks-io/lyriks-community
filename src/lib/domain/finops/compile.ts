import { createRule, type CompiledRule, type ProjectFinopsDraft } from './draft';

/**
 * The live Lyriks context the governor reads to decide how to spend tokens.
 * Recomputed on every load from Global Coherence / the Control Center — never
 * persisted (mirrors `CoherenceAnalysis`).
 */
export interface FinopsSignals {
	/** Spec-Readiness score (0-100) from Global Coherence. */
	readinessScore: number;
	/** Coherence score (0-100) — the structural-alignment lens. */
	coherenceScore: number;
	/** Number of blocking coherence gaps; any blocker forbids spending on generation. */
	blockingGapCount: number;
}

export const ZERO_SIGNALS: FinopsSignals = {
	readinessScore: 0,
	coherenceScore: 0,
	blockingGapCount: 0
};

/** spentUsd / monthlyBudgetUsd, guarded against a zero/negative budget. */
export function spentRatio(draft: ProjectFinopsDraft): number {
	if (draft.monthlyBudgetUsd <= 0) return 0;
	return draft.spentUsd / draft.monthlyBudgetUsd;
}

/** The budget left before the ceiling, never negative. */
export function remainingBudgetUsd(draft: ProjectFinopsDraft): number {
	return Math.max(0, draft.monthlyBudgetUsd - draft.spentUsd);
}

/**
 * The readiness the governor actually gates on: a specific scope's readiness
 * when one is named, otherwise the live project-wide Spec-Readiness signal — so
 * the page works out of the box with no manual input.
 */
export function effectiveReadiness(draft: ProjectFinopsDraft, signals: FinopsSignals): number {
	return draft.scopeLabel.trim() ? draft.scopeReadiness : signals.readinessScore;
}

/** Is the scope up for generation too immature to spend tokens on? */
export function scopeIsImmature(draft: ProjectFinopsDraft, signals: FinopsSignals): boolean {
	return effectiveReadiness(draft, signals) < draft.maturityThreshold || signals.blockingGapCount > 0;
}

/**
 * Whether AI generation is currently frozen. Only ever true under enforcement —
 * advisory mode surfaces warnings but never blocks (the air-gap-safe default).
 * Freezes on an immature scope OR a blown budget. Derived, never stored.
 */
export function isFrozen(draft: ProjectFinopsDraft, signals: FinopsSignals): boolean {
	if (draft.enforcementMode !== 'enforced') return false;
	return scopeIsImmature(draft, signals) || spentRatio(draft) > 1;
}

/**
 * THE core lever. Derive the LiteLLM guardrail rules the current Lyriks context
 * warrants — one per fired signal:
 *   1. immature scope → block generation (don't burn tokens on an immature feature)
 *   2. weak coherence → route to a cheaper model while the spec is shaky
 *   3. high spend → cap the per-key budget
 * Pure: returns fresh `proposed` rules; the store decides when to add them.
 */
export function compileRules(draft: ProjectFinopsDraft, signals: FinopsSignals): CompiledRule[] {
	const proposals: CompiledRule[] = [];
	// `scopeField` is the canonical grouping key (empty = whole project); `scope`
	// is only the human name used in the rationale sentence.
	const scopeField = draft.scopeLabel.trim();
	const scope = scopeDisplay(scopeField);
	const budget = draft.monthlyBudgetUsd;

	if (scopeIsImmature(draft, signals)) {
		const reason =
			signals.blockingGapCount > 0
				? `${signals.blockingGapCount} blocking coherence gap(s) open`
				: `scope readiness ${Math.round(effectiveReadiness(draft, signals))} < readiness threshold ${draft.maturityThreshold}`;
		proposals.push(
			createRule({
				kind: 'block_scope',
				source: signals.blockingGapCount > 0 ? 'coherence' : 'maturity',
				scopeLabel: scopeField,
				rationale: `Block AI generation for ${scope}: ${reason}. Don't spend tokens on a scope that isn't ready.`,
				estimatedSavingUsd: Math.round(budget * 0.2)
			})
		);
	}

	if (signals.coherenceScore < draft.coherenceThreshold) {
		proposals.push(
			createRule({
				kind: 'route_cheap_model',
				source: 'coherence',
				scopeLabel: scopeField,
				rationale: `Route ${scope} to a cheaper model: coherence ${signals.coherenceScore} < threshold ${draft.coherenceThreshold}. Spend less while the spec is still shaky.`,
				estimatedSavingUsd: Math.round(budget * 0.1)
			})
		);
	}

	if (spentRatio(draft) > draft.budgetTightenRatio) {
		const overshoot = Math.max(0, draft.spentUsd - budget * draft.budgetTightenRatio);
		proposals.push(
			createRule({
				kind: 'budget_cap',
				source: 'budget',
				scopeLabel: scopeField,
				rationale: `Cap the per-key budget: spend ratio ${(spentRatio(draft) * 100).toFixed(0)}% is over the ${(draft.budgetTightenRatio * 100).toFixed(0)}% tighten line.`,
				estimatedSavingUsd: Math.round(overshoot)
			})
		);
	}

	return proposals;
}

/** Total monthly saving the active rules protect, in USD. */
export function activeSavingUsd(draft: ProjectFinopsDraft): number {
	return draft.rules
		.filter((r) => r.status === 'active')
		.reduce((sum, r) => sum + Math.max(0, r.estimatedSavingUsd), 0);
}

/* ── The verdict — one plain-language answer the whole page is built around ── */

export type VerdictLevel = 'clear' | 'guardrails' | 'hold';

export interface GovernorVerdict {
	level: VerdictLevel;
	/** Short status, e.g. "Hold generation". */
	headline: string;
	/** One-line gist under the headline. */
	tagline: string;
	/** The specific reasons behind the verdict, in plain language. */
	reasons: string[];
}

/**
 * Answer the only question that matters: is it worth spending AI tokens on this
 * project right now? `hold` = don't (immature / blocking gaps / budget blown);
 * `guardrails` = yes but keep cost in check (weak coherence / hot spend);
 * `clear` = spend freely. Pure and signal-driven, so the UI just renders it.
 */
export function governorVerdict(
	draft: ProjectFinopsDraft,
	signals: FinopsSignals
): GovernorVerdict {
	const readiness = effectiveReadiness(draft, signals);
	const ratio = spentRatio(draft);
	const reasons: string[] = [];

	const immature = readiness < draft.maturityThreshold;
	const gaps = signals.blockingGapCount > 0;
	const blown = ratio > 1;

	if (immature)
		reasons.push(
			`Readiness ${Math.round(readiness)} is below the ${draft.maturityThreshold} bar, not ready to implement.`
		);
	if (gaps)
		reasons.push(
			`${signals.blockingGapCount} blocking coherence gap${signals.blockingGapCount > 1 ? 's' : ''} still open.`
		);
	if (blown) reasons.push(`AI budget is spent in full (${Math.round(ratio * 100)}%).`);

	if (immature || gaps || blown) {
		return {
			level: 'hold',
			headline: 'Hold generation',
			tagline: "Don't spend tokens yet: fix the spec first.",
			reasons
		};
	}

	const weakCoherence = signals.coherenceScore < draft.coherenceThreshold;
	const hotSpend = ratio > draft.budgetTightenRatio;
	if (weakCoherence)
		reasons.push(
			`Coherence ${signals.coherenceScore} is below ${draft.coherenceThreshold}: use a cheaper model until it firms up.`
		);
	if (hotSpend)
		reasons.push(
			`Spend crossed the ${Math.round(draft.budgetTightenRatio * 100)}% line: cap the budget.`
		);

	if (weakCoherence || hotSpend) {
		return {
			level: 'guardrails',
			headline: 'Generate with guardrails',
			tagline: 'Safe to generate, but keep the cost in check.',
			reasons
		};
	}

	return {
		level: 'clear',
		headline: 'Clear to generate',
		tagline: 'Spend freely: the spec is ready.',
		reasons: ['Readiness, coherence and budget are all healthy.']
	};
}

/* ── Gateway projection — active rules → a concrete LiteLLM key plan ─────── */

/** The default "cheaper" model a route-to-cheap-model rule pins traffic to. */
export const DEFAULT_CHEAP_MODEL = 'gpt-4o-mini';

/** Empty scope means the guardrail governs the whole project (the default key). */
export const WHOLE_PROJECT_SCOPE = '';

/** Plain-language name for a scope — the whole project when unscoped. */
export function scopeDisplay(scope: string): string {
	return scope.trim() || 'the whole project';
}

/**
 * Key-safe slug for a scope (a feature name). Empty for the whole-project scope,
 * so it maps to the base project key; otherwise a stable, lowercased segment.
 */
export function scopeKeySegment(scope: string): string {
	return scope
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-+|-+$)/g, '');
}

/**
 * Stable per-SCOPE LiteLLM identifiers (alias + deterministic virtual key). The
 * whole-project scope keeps the bare `lyriks-<projectId>` id (backward compatible);
 * each governed feature gets its own `…-<slug>` key so guardrails bite per feature.
 */
export function finopsKeyAlias(projectId: string, scope: string = WHOLE_PROJECT_SCOPE): string {
	const seg = scopeKeySegment(scope);
	return seg ? `lyriks-${projectId}-${seg}` : `lyriks-${projectId}`;
}
export function finopsKeyValue(projectId: string, scope: string = WHOLE_PROJECT_SCOPE): string {
	const seg = scopeKeySegment(scope);
	return seg ? `sk-lyriks-${projectId}-${seg}` : `sk-lyriks-${projectId}`;
}

/**
 * The concrete restriction a project's LiteLLM virtual key should carry, derived
 * from the ACTIVE compiled rules. `models: []` means "all models allowed".
 */
export interface GatewayKeyPlan {
	blocked: boolean;
	models: string[];
	maxBudgetUsd: number;
}

/** A concrete key plan bound to the scope (feature / whole-project) it governs. */
export interface ScopedKeyPlan {
	/** '' = the whole-project key; otherwise a feature name. */
	scope: string;
	plan: GatewayKeyPlan;
}

/**
 * Project ONE scope's active rules onto a LiteLLM key plan. Only ENFORCED mode
 * ever restricts real traffic — in advisory the key is left unrestricted, so the
 * gateway never blocks (the air-gap-safe default, faithful to the model).
 *
 * Budget note: there is a single project-level budget, so every capped key reuses
 * `monthlyBudgetUsd * budgetTightenRatio`; uncapped keys carry the full budget.
 */
function planForRules(
	rules: readonly CompiledRule[],
	draft: ProjectFinopsDraft,
	cheapModel: string
): GatewayKeyPlan {
	if (draft.enforcementMode !== 'enforced') {
		return { blocked: false, models: [], maxBudgetUsd: draft.monthlyBudgetUsd };
	}
	const blocked = rules.some((r) => r.kind === 'block_scope');
	const route = rules.some((r) => r.kind === 'route_cheap_model');
	const caps = rules.filter((r) => r.kind === 'budget_cap');
	return {
		blocked,
		models: route && !blocked ? [cheapModel] : [],
		maxBudgetUsd: caps.length ? scopedCapUsd(caps, draft) : draft.monthlyBudgetUsd
	};
}

/**
 * The tightest budget the cap rules impose on a scope's key. Each rule uses its
 * own explicit per-feature ceiling (`capUsd`) when set; a rule with no explicit
 * amount falls back to the project-wide tighten formula. Multiple caps → the
 * lowest wins.
 */
function scopedCapUsd(caps: readonly CompiledRule[], draft: ProjectFinopsDraft): number {
	const fallback = Math.round(draft.monthlyBudgetUsd * draft.budgetTightenRatio);
	return Math.min(...caps.map((r) => (r.capUsd > 0 ? Math.round(r.capUsd) : fallback)));
}

/**
 * THE per-feature projection. Group the active rules by their scope and derive
 * one LiteLLM key plan per scope — so a guardrail on "Checkout" restricts the
 * Checkout key alone, never the whole project. Scopes with no active rule get no
 * key (nothing to enforce). Deterministic order: whole-project first, then scopes
 * in first-seen order.
 */
export function deriveScopedPlans(
	draft: ProjectFinopsDraft,
	cheapModel: string = DEFAULT_CHEAP_MODEL
): ScopedKeyPlan[] {
	const active = draft.rules.filter((r) => r.status === 'active');
	const scopes: string[] = [];
	for (const r of active) {
		const s = r.scopeLabel.trim();
		if (!scopes.includes(s)) scopes.push(s);
	}
	scopes.sort((a, b) => (a === WHOLE_PROJECT_SCOPE ? -1 : b === WHOLE_PROJECT_SCOPE ? 1 : 0));
	return scopes.map((scope) => ({
		scope,
		plan: planForRules(
			active.filter((r) => r.scopeLabel.trim() === scope),
			draft,
			cheapModel
		)
	}));
}
