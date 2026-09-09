<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import { RULE_KINDS, type RuleKind } from '$domain/finops';
	import type { FinopsStore } from './draft-store.svelte';

	interface Props {
		store: FinopsStore;
		/** The project's leaf features — the real scopes a guardrail can name. */
		featureNames: string[];
	}
	let { store, featureNames }: Props = $props();

	let scopeLabel = $state('');
	let scopeReadiness = $state(100);
	let spendInput = $state<number>(0);
	let baseUrl = $state('');
	$effect(() => {
		scopeLabel = store.draft.scopeLabel;
		scopeReadiness = store.draft.scopeReadiness;
		baseUrl = store.draft.gateway.baseUrl;
	});

	// Manual guardrail creation — the explicit way to add a rule when no live
	// signal warrants one (the auto-recommendation is empty on a healthy spec).
	let newRuleKind = $state<RuleKind>('block_scope');
	let newRuleScope = $state('');
	let newRuleBudget = $state<number>(0);

	const ruleLabel = (k: RuleKind) => RULE_KINDS.find((x) => x.code === k)?.label ?? k;

	function addSpend() {
		if (spendInput > 0) {
			store.recordSpend(spendInput);
			spendInput = 0;
		}
	}

	function addRule() {
		store.addRule(newRuleKind, newRuleScope, newRuleBudget);
		newRuleScope = '';
		newRuleBudget = 0;
	}
</script>

<details class="group rounded-card border border-line bg-surface">
	<summary
		class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-700"
	>
		<Icon name="sliders" size={15} class="text-ink-400" />
		Advanced - thresholds, scope & gateway
		<span class="ml-auto text-ink-400 transition-transform group-open:rotate-180">▾</span>
	</summary>

	<div class="space-y-5 border-t border-line p-4">
		<!-- Scope override -->
		<section>
			<p class="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Scope under evaluation
			</p>
			<div class="flex flex-wrap items-end gap-3">
				<label class="min-w-[200px] flex-1">
					<span class="mb-1 block text-[11px] text-ink-500">
						Feature / topic <span class="text-ink-400">(empty = whole-project readiness)</span>
					</span>
					<input
						bind:value={scopeLabel}
						placeholder="Whole project"
						class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
					/>
				</label>
				{#if scopeLabel.trim()}
					<label class="w-40">
						<span class="mb-1 block text-[11px] text-ink-500">Readiness · {scopeReadiness}</span>
						<input type="range" min="0" max="100" bind:value={scopeReadiness} class="w-full" />
					</label>
				{/if}
				<Button variant="outline" size="sm" onclick={() => store.evaluateScope(scopeLabel, scopeReadiness)}>
					Set
				</Button>
			</div>
		</section>

		<!-- Thresholds -->
		<section>
			<p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">Thresholds</p>
			<div class="grid gap-4 sm:grid-cols-3">
				<label>
					<span class="mb-1 block text-[11px] text-ink-500">Readiness gate · {store.draft.maturityThreshold}</span>
					<input type="range" min="0" max="100" value={store.draft.maturityThreshold}
						onchange={(e) => store.tuneThresholds({ maturityThreshold: Number(e.currentTarget.value) })}
						class="w-full" />
				</label>
				<label>
					<span class="mb-1 block text-[11px] text-ink-500">Coherence gate · {store.draft.coherenceThreshold}</span>
					<input type="range" min="0" max="100" value={store.draft.coherenceThreshold}
						onchange={(e) => store.tuneThresholds({ coherenceThreshold: Number(e.currentTarget.value) })}
						class="w-full" />
				</label>
				<label>
					<span class="mb-1 block text-[11px] text-ink-500">Budget tighten · {Math.round(store.draft.budgetTightenRatio * 100)}%</span>
					<input type="range" min="0" max="100" value={Math.round(store.draft.budgetTightenRatio * 100)}
						onchange={(e) => store.tuneThresholds({ budgetTightenRatio: Number(e.currentTarget.value) / 100 })}
						class="w-full" />
				</label>
			</div>
		</section>

		<!-- Budget -->
		<section class="flex flex-wrap items-end gap-4">
			<label>
				<span class="mb-1 block text-[11px] text-ink-500">Monthly budget ($)</span>
				<input type="number" min="0" value={store.draft.monthlyBudgetUsd}
					onchange={(e) => store.setMonthlyBudget(Number(e.currentTarget.value))}
					class="w-32 rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none" />
			</label>
			<label class="flex-1">
				<span class="mb-1 block text-[11px] text-ink-500">Record spend ($)</span>
				<div class="flex items-center gap-2">
					<input type="number" min="0" bind:value={spendInput}
						class="w-32 rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none" />
					<Button variant="outline" size="sm" onclick={addSpend}><Icon name="plus" size={14} /> Add</Button>
				</div>
			</label>
		</section>

		<!-- Gateway -->
		<section>
			<p class="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">LiteLLM gateway</p>
			{#if store.gatewayConfigured}
				<div class="flex flex-wrap items-center gap-3 rounded-card border border-success-200 bg-success-50/50 p-3">
					<span class="flex items-center gap-1.5 text-[12px] font-medium text-success-700">
						<Icon name="check" size={14} /> Linked via server config
					</span>
					<span class="font-mono text-[11px] text-ink-500">{store.draft.gateway.baseUrl || 'configured URL'}</span>
					<Button variant="outline" size="sm" onclick={() => store.pullUsage(0)}>Pull spend</Button>
				</div>
			{:else}
				<div class="flex flex-wrap items-end gap-2">
					<label class="min-w-[200px] flex-1">
						<span class="mb-1 block text-[11px] text-ink-500">Proxy base URL (dev/local)</span>
						<input bind:value={baseUrl} placeholder="http://litellm.internal:4000"
							class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none" />
					</label>
					{#if store.draft.gateway.connected}
						<Button variant="outline" size="sm" onclick={store.disconnectGateway}>Disconnect</Button>
					{:else}
						<Button variant="outline" size="sm" onclick={() => store.connectGateway(baseUrl)}>Connect</Button>
					{/if}
				</div>
				<p class="mt-1.5 text-[11px] text-ink-400">
					Production wires the proxy via <span class="font-mono">LITELLM_GATEWAY_URL</span>; without it the governor stays advisory (air-gapped).
				</p>
			{/if}
		</section>

		<!-- Guardrails — manual creation + the active list -->
		<section>
			<p class="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Guardrails{store.activeRules.length ? ` · ${store.activeRules.length} active` : ''}
			</p>

			<!-- Create one by hand (independent of the live signals) -->
			<div class="flex flex-wrap items-end gap-2 rounded-card border border-dashed border-line bg-surface-sunken/40 p-3">
				<label class="w-48">
					<span class="mb-1 block text-[11px] text-ink-500">Guardrail type</span>
					<select
						bind:value={newRuleKind}
						class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
					>
						{#each RULE_KINDS as k (k.code)}
							<option value={k.code}>{k.label}</option>
						{/each}
					</select>
				</label>
				<label class="min-w-40 flex-1">
					<span class="mb-1 block text-[11px] text-ink-500">Scope (feature)</span>
					<select
						bind:value={newRuleScope}
						class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
					>
						<option value="">Whole project</option>
						{#each featureNames as name (name)}
							<option value={name}>{name}</option>
						{/each}
					</select>
				</label>
				{#if newRuleKind === 'budget_cap'}
					<label class="w-32">
						<span class="mb-1 block text-[11px] text-ink-500">Budget ($/mo)</span>
						<input
							type="number"
							min="0"
							bind:value={newRuleBudget}
							placeholder="e.g. 200"
							class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
						/>
					</label>
				{/if}
				<Button variant="primary" size="sm" onclick={addRule}>
					<Icon name="plus" size={14} /> Add guardrail
				</Button>
			</div>
			<p class="mt-1.5 text-[11px] text-ink-400">
				Adds an active guardrail for the chosen scope straight away - each feature gets its own LiteLLM
				key, so a rule on one feature never touches another.
				{#if newRuleKind === 'budget_cap'}
					Leave the budget empty to reuse the project tighten line.
				{/if}
			</p>

			<!-- The active list -->
			{#if store.activeRules.length}
				<div class="mt-3 space-y-1.5">
					{#each store.activeRules as r (r.id)}
						<div class="flex items-start gap-2 rounded-card border border-line bg-surface p-2.5">
							<span class="mt-0.5 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-500">
								{ruleLabel(r.kind)}
							</span>
							<div class="min-w-0 flex-1">
								<span class="inline-flex items-center gap-1 rounded-pill bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 ring-1 ring-brand-200">
									<Icon name="target" size={10} />
									{r.scopeLabel.trim() || 'Whole project'}
								</span>
								<p class="mt-0.5 text-[12px] text-ink-600">{r.rationale}</p>
							</div>
							<button type="button" onclick={() => store.retireRule(r.id)}
								class="text-ink-300 hover:text-danger-500" aria-label="Retire"><Icon name="x" size={13} /></button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-2 text-[12px] text-ink-400">No active guardrails yet.</p>
			{/if}
		</section>
	</div>
</details>
