import {
	activeSavingUsd,
	compileRules,
	computeFinopsCoherence,
	createRule,
	scopeDisplay,
	RULE_KINDS,
	effectiveReadiness,
	governorVerdict,
	isFrozen,
	remainingBudgetUsd,
	spentRatio,
	ZERO_SIGNALS,
	type CompiledRule,
	type EnforcementMode,
	type FinopsSignals,
	type GovernorVerdict,
	type ProjectFinopsDraft,
	type RuleKind
} from '$domain/finops';
import type { CoherenceResult } from '$domain/shared';
import type { Session, ToastNotifierPort } from '$application/ports';
import { clientId } from '$ui/shell/live-sync.client';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';
import { REVISION_HEADER } from '$lib/shared/draft-revision';

export type { SaveStatus };

/** One provisioned LiteLLM key as the push endpoint reports it, tagged by scope. */
export interface AppliedKeyView {
	/** '' = the whole-project key; otherwise the feature name. */
	scope: string;
	state: { blocked: boolean; models: string[]; maxBudgetUsd: number | null; spendUsd: number };
}

/** Human rationale for a hand-added guardrail, per kind. `label` is the scope's display name. */
function manualRationale(kind: RuleKind, label: string, capUsd: number): string {
	switch (kind) {
		case 'block_scope':
			return `Block AI generation for ${label} (added manually).`;
		case 'route_cheap_model':
			return `Route ${label} to a cheaper model (added manually).`;
		case 'budget_cap':
			return capUsd > 0
				? `Cap ${label} AI budget at $${Math.round(capUsd)}/mo (added manually).`
				: `Cap the per-key budget for ${label} (added manually).`;
	}
}

/**
 * AI Cost Governor store — orchestrator for the FinOps screen. Mirror of the
 * other section stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `133c6adc` is honored uniformly. The live
 * readiness/coherence signals are hydrated in alongside the draft (they are
 * recomputed server-side, never persisted) and every FinOps verdict — the
 * recommendation, whether generation is frozen, saving protected — derives from them.
 */
export class FinopsStore {
	draft = $state<ProjectFinopsDraft>(null as unknown as ProjectFinopsDraft);
	signals = $state<FinopsSignals>(ZERO_SIGNALS);
	/** True when a real LiteLLM proxy is wired server-side (env-gated). */
	gatewayConfigured = $state<boolean>(false);
	/** What the proxy actually enforces after the last push — one key per scope. */
	lastPushState = $state<AppliedKeyView[] | null>(null);

	coherence = $derived.by<CoherenceResult>(() => computeFinopsCoherence(this.draft, this.signals));
	ratio = $derived.by(() => spentRatio(this.draft));
	frozen = $derived.by(() => isFrozen(this.draft, this.signals));
	remaining = $derived.by(() => remainingBudgetUsd(this.draft));
	protectedSaving = $derived.by(() => activeSavingUsd(this.draft));

	/** The one-glance answer the whole page is built around. */
	verdict = $derived.by<GovernorVerdict>(() => governorVerdict(this.draft, this.signals));
	/** The readiness the governor actually gates on (live signal or named scope). */
	readiness = $derived.by(() => effectiveReadiness(this.draft, this.signals));
	/** Live preview of the guardrails the current signals warrant (not yet applied). */
	recommendation = $derived.by<CompiledRule[]>(() => compileRules(this.draft, this.signals));

	activeRules = $derived.by<CompiledRule[]>(() =>
		this.draft.rules.filter((r) => r.status === 'active')
	);

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<ProjectFinopsDraft>;

	constructor(
		initial: ProjectFinopsDraft,
		signals: FinopsSignals,
		session: Session,
		notifier: ToastNotifierPort,
		gatewayConfigured = false,
		revision = 0
	) {
		this.draft = initial;
		this.signals = signals;
		this.gatewayConfigured = gatewayConfigured;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/finops',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
	}

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}

	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	hydrate = (
		incoming: ProjectFinopsDraft,
		signals: FinopsSignals,
		gatewayConfigured = false,
		revision = 0
	) => {
		// Signals are cheap and always fresh from the server — refresh them even
		// while a save is mid-flight so the live verdicts stay honest.
		this.signals = signals;
		this.gatewayConfigured = gatewayConfigured;
		this.#autosave.hydrate(incoming, revision);
	};

	#requireAuth = () => {
		if (!this.session.isAuthenticated) throw new Error('blocked: unauthenticated session');
	};

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/* ─────────────────────────── COST GOVERNOR ─────────────────────────── */
	setMonthlyBudget = (usd: number) => {
		this.draft.monthlyBudgetUsd = Math.max(0, Math.round(usd));
		this.#touch('finops.monthlyBudgetUsd');
	};

	setEnforcementMode = (mode: EnforcementMode) => {
		this.draft.enforcementMode = mode;
		this.#touch('finops.enforcementMode');
	};

	recordSpend = (amountUsd: number) => {
		if (!(amountUsd > 0)) return;
		this.draft.spentUsd = Math.max(0, this.draft.spentUsd + amountUsd);
		this.#touch('finops.spentUsd');
		this.notifier.notify('info', `Recorded $${amountUsd} of AI spend.`);
	};

	/* ─────────────────── RULE POLICY (thresholds & scope) ──────────────── */
	evaluateScope = (label: string, readiness: number) => {
		this.draft.scopeLabel = label.trim();
		this.draft.scopeReadiness = Math.max(0, Math.min(100, Math.round(readiness)));
		this.#touch('finops.scope');
	};

	tuneThresholds = (patch: {
		maturityThreshold?: number;
		coherenceThreshold?: number;
		budgetTightenRatio?: number;
	}) => {
		if (typeof patch.maturityThreshold === 'number')
			this.draft.maturityThreshold = Math.max(0, Math.min(100, Math.round(patch.maturityThreshold)));
		if (typeof patch.coherenceThreshold === 'number')
			this.draft.coherenceThreshold = Math.max(0, Math.min(100, Math.round(patch.coherenceThreshold)));
		if (typeof patch.budgetTightenRatio === 'number')
			this.draft.budgetTightenRatio = Math.max(0, Math.min(1, patch.budgetTightenRatio));
		this.#touch('finops.thresholds');
	};

	/**
	 * The dead-simple primary action. Set the rule set to exactly the current
	 * recommendation (all active), persist it, then provision the LiteLLM key —
	 * one click from "here's what you should do" to "the gateway enforces it".
	 */
	applyRecommendation = async () => {
		if (!this.session.isAuthenticated) {
			this.notifier.notify('error', 'Sign in to apply guardrails.');
			return;
		}
		const recs = compileRules(this.draft, this.signals).map(
			(r): CompiledRule => ({ ...r, status: 'active' })
		);
		this.draft.rules = recs;
		this.draft.gateway.pendingPushCount = recs.length;
		this.#touch('finops.rules');
		await this.flushNow(); // persist before the push endpoint reads the draft
		if (this.gatewayConfigured) {
			await this.pushActiveRules();
		} else {
			this.notifier.notify(
				'info',
				recs.length
					? `${recs.length} guardrail(s) set. Connect a LiteLLM proxy to enforce them.`
					: 'No guardrails needed: the spec is healthy.'
			);
		}
	};

	/**
	 * Add one guardrail by hand — active immediately. Complements the auto-compiled
	 * recommendation: when the spec is healthy no rule is warranted, so this is the
	 * explicit way an operator creates a guardrail regardless of the live signals.
	 */
	addRule = (kind: RuleKind, scopeLabel = '', capUsd = 0) => {
		this.#requireAuth();
		// Keep the raw scope ('' = whole project) as the canonical grouping key that
		// maps to one LiteLLM key per feature; the display name is only for copy.
		const scope = scopeLabel.trim();
		const label = scopeDisplay(scope);
		// A per-feature budget only applies to a budget-cap guardrail.
		const cap = kind === 'budget_cap' ? Math.max(0, Math.round(capUsd)) : 0;
		const rule = createRule({
			kind,
			status: 'active',
			source: 'manual',
			scopeLabel: scope,
			capUsd: cap,
			rationale: manualRationale(kind, label, cap)
		});
		this.draft.rules = [...this.draft.rules, rule];
		this.draft.gateway.pendingPushCount += 1;
		this.#touch('finops.rules');
		const kindLabel = RULE_KINDS.find((k) => k.code === kind)?.label ?? kind;
		const budgetNote = kind === 'budget_cap' && cap > 0 ? ` ($${cap}/mo)` : '';
		this.notifier.notify(
			'info',
			`Added a “${kindLabel}” guardrail for ${label}${budgetNote}.`
		);
	};

	/** Retire one active guardrail (removes it on the next push). */
	retireRule = (ruleId: string) => {
		const r = this.draft.rules.find((r) => r.id === ruleId);
		if (!r || r.status !== 'active') return;
		r.status = 'retired';
		this.draft.gateway.pendingPushCount += 1;
		this.#touch('finops.rules');
	};

	/* ──────────────────────────── GATEWAY SYNC ─────────────────────────── */
	connectGateway = (baseUrl: string) => {
		this.draft.gateway.baseUrl = baseUrl.trim();
		this.draft.gateway.connected = true;
		this.#touch('finops.gateway');
		this.notifier.notify('info', `LiteLLM proxy linked at ${this.draft.gateway.baseUrl}.`);
	};

	disconnectGateway = () => {
		this.draft.gateway.connected = false;
		this.draft.gateway.lastPushOk = false;
		this.#touch('finops.gateway');
	};

	pushActiveRules = async () => {
		// Real proxy wired server-side: provision the LiteLLM key from active rules.
		if (this.gatewayConfigured) {
			try {
				const res = await fetch('/api/finops/gateway/push', {
					method: 'PUT',
					headers: {
						'content-type': 'application/json',
						'x-lyriks-client': clientId,
						[REVISION_HEADER]: String(this.#autosave.revision)
					},
					body: JSON.stringify({ projectId: this.draft.projectId })
				});
				if (!res.ok) throw new Error(`push failed (${res.status})`);
				const { applied, draft, revision } = (await res.json()) as {
					applied: AppliedKeyView[];
					draft: ProjectFinopsDraft;
					revision: number;
				};
				this.#autosave.adoptSaved(draft, revision);
				this.lastPushState = applied;
				const blockedCount = applied.filter((k) => k.state.blocked).length;
				this.notifier.notify(
					'info',
					applied.length
						? `Pushed ${applied.length} key(s) to the proxy${blockedCount ? ` (${blockedCount} blocked)` : ''}.`
						: 'Pushed: no guardrails to enforce.'
				);
			} catch (e) {
				this.notifier.notify('error', e instanceof Error ? e.message : 'push failed');
			}
			return;
		}
		// Air-gapped/local: no proxy — mirror the push locally (advisory demo).
		if (!this.draft.gateway.connected) {
			this.notifier.notify('error', 'Connect the LiteLLM proxy first.');
			return;
		}
		this.draft.gateway.pendingPushCount = 0;
		this.draft.gateway.lastPushOk = true;
		this.#touch('finops.gateway');
		const active = this.draft.rules.filter((r) => r.status === 'active').length;
		this.notifier.notify(
			'info',
			`${active} active rule${active === 1 ? '' : 's'} pushed to the proxy.`
		);
	};

	pullUsage = async (usageUsd: number) => {
		if (this.gatewayConfigured) {
			try {
				const res = await fetch('/api/finops/gateway/pull', {
					method: 'PUT',
					headers: {
						'content-type': 'application/json',
						'x-lyriks-client': clientId,
						[REVISION_HEADER]: String(this.#autosave.revision)
					},
					body: JSON.stringify({ projectId: this.draft.projectId })
				});
				if (!res.ok) throw new Error(`pull failed (${res.status})`);
				const { draft, revision } = (await res.json()) as {
					draft: ProjectFinopsDraft;
					revision: number;
				};
				this.#autosave.adoptSaved(draft, revision);
				this.notifier.notify('info', `Pulled: spend is $${draft.spentUsd.toFixed(4)}.`);
			} catch (e) {
				this.notifier.notify('error', e instanceof Error ? e.message : 'pull failed');
			}
			return;
		}
		if (!this.draft.gateway.connected) {
			this.notifier.notify('error', 'Connect the LiteLLM proxy first.');
			return;
		}
		if (usageUsd > 0) this.draft.spentUsd = Math.max(0, this.draft.spentUsd + usageUsd);
		this.#touch('finops.gateway');
	};
}
