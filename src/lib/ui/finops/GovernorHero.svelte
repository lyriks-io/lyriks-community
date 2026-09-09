<script lang="ts">
	import { Button, Icon, type IconName } from '$ui/design-system';
	import { RULE_KINDS, type RuleKind, type VerdictLevel } from '$domain/finops';
	import type { FinopsStore } from './draft-store.svelte';

	interface Props {
		store: FinopsStore;
	}
	let { store }: Props = $props();

	// Per-verdict look: icon, accent classes, the action verb.
	const look: Record<VerdictLevel, { icon: IconName; ring: string; border: string; text: string }> = {
		clear: {
			icon: 'check',
			ring: 'bg-success-500/12 text-success-600',
			border: 'border-l-success-500',
			text: 'text-success-700'
		},
		guardrails: {
			icon: 'sliders',
			ring: 'bg-accent-500/12 text-accent-600',
			border: 'border-l-accent-500',
			text: 'text-accent-600'
		},
		hold: {
			icon: 'shield',
			ring: 'bg-danger-500/12 text-danger-600',
			border: 'border-l-danger-500',
			text: 'text-danger-700'
		}
	};
	const v = $derived(store.verdict);
	const l = $derived(look[v.level]);

	const ruleLabel = (k: RuleKind) => RULE_KINDS.find((x) => x.code === k)?.label ?? k;
	const ruleIcon: Record<RuleKind, IconName> = {
		block_scope: 'shield',
		route_cheap_model: 'cpu',
		budget_cap: 'gauge'
	};

	const enforced = $derived(store.draft.enforcementMode === 'enforced');
	const applyLabel = $derived(
		store.gatewayConfigured ? 'Apply to LiteLLM' : 'Set guardrails'
	);
</script>

<section class="overflow-hidden rounded-card border border-line border-l-4 bg-surface shadow-card {l.border}">
	<div class="p-5">
		<div class="flex items-start gap-4">
			<span class="grid size-12 shrink-0 place-items-center rounded-xl {l.ring}">
				<Icon name={l.icon} size={24} />
			</span>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-xl font-bold tracking-tight text-ink-900">{v.headline}</h2>
					<span
						class="rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] {enforced
							? 'bg-danger-50 text-danger-700'
							: 'bg-surface-sunken text-ink-500'}"
					>
						{enforced ? 'Enforced' : 'Advisory'}
					</span>
				</div>
				<p class="mt-0.5 text-sm text-ink-500">{v.tagline}</p>
			</div>
		</div>

		<!-- Why -->
		<ul class="mt-4 space-y-1.5">
			{#each v.reasons as reason, i (i)}
				<li class="flex items-start gap-2 text-[13px] text-ink-700">
					<span class="mt-1.5 size-1.5 shrink-0 rounded-full {l.text} bg-current"></span>
					<span>{reason}</span>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Action strip -->
	<div class="flex flex-wrap items-center gap-3 border-t border-line bg-surface-sunken px-5 py-3.5">
		<div class="min-w-0 flex-1">
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				{store.recommendation.length ? 'Guardrails to apply' : 'No guardrails needed'}
			</p>
			<div class="mt-1 flex flex-wrap items-center gap-1.5">
				{#if store.recommendation.length}
					{#each store.recommendation as r (r.id)}
						<span class="inline-flex items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-700 ring-1 ring-line">
							<Icon name={ruleIcon[r.kind]} size={12} />
							{ruleLabel(r.kind)}
						</span>
					{/each}
				{:else}
					<span class="text-[12px] text-ink-500">Generation runs unrestricted.</span>
				{/if}
			</div>
			<p class="mt-1.5 text-[11px] leading-snug text-ink-400">
				{#if store.recommendation.length}
					<span class="font-medium text-ink-500">{applyLabel}</span> turns the guardrails above into
					active rules.
				{:else}
					No guardrail is warranted by the live signals, so this button has nothing to apply.
				{/if}
				To add one yourself, open <span class="font-medium text-ink-500">Advanced</span> below and use
				<span class="font-medium text-ink-500">Add guardrail</span>.
			</p>
		</div>
		<Button variant="primary" size="md" onclick={store.applyRecommendation}>
			<Icon name="server" size={15} />
			{applyLabel}
		</Button>
	</div>

	<!-- What the gateway now enforces (after a real push) — one row per feature key -->
	{#if store.gatewayConfigured && store.lastPushState?.length}
		<div class="border-t border-line">
			<div class="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-px bg-line text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				<div class="bg-surface px-5 py-1.5">Scope</div>
				<div class="bg-surface px-3 py-1.5">Key</div>
				<div class="bg-surface px-3 py-1.5">Models</div>
				<div class="bg-surface px-3 py-1.5">Max budget</div>
			</div>
			{#each store.lastPushState as k (k.scope)}
				{@const s = k.state}
				<div class="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-px bg-line">
					<div class="bg-surface px-5 py-2 text-sm font-medium text-ink-800">
						{k.scope || 'Whole project'}
					</div>
					<div class="bg-surface px-3 py-2 text-sm font-semibold {s.blocked ? 'text-danger-600' : 'text-success-600'}">
						{s.blocked ? 'Blocked' : 'Active'}
					</div>
					<div class="bg-surface px-3 py-2 text-sm text-ink-800">
						{s.models.length ? s.models.join(', ') : 'all'}
					</div>
					<div class="bg-surface px-3 py-2 text-sm text-ink-800">${s.maxBudgetUsd ?? '∞'}</div>
				</div>
			{/each}
		</div>
	{/if}
</section>
