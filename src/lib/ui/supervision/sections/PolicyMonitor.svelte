<script lang="ts">
	import { Button, Icon, ScoreRing, type Tone } from '$ui/design-system';
	import {
		POLICY_CATEGORIES,
		POLICY_STATUSES,
		evaluateGatewayPolicy,
		type PolicyCategory,
		type PolicyStatus
	} from '$domain/supervision';
	import type { SupervisionStore } from '../draft-store.svelte';

	interface Props {
		store: SupervisionStore;
		/** Governor spend ÷ monthly budget — drives the live project-budget check. */
		spentRatio: number;
		/** True when a real LiteLLM proxy is wired (live checks read real spend). */
		gatewayConfigured: boolean;
	}
	let { store, spentRatio, gatewayConfigured }: Props = $props();

	// Live cost-policy checks — statuses COMPUTED from real per-member + project spend.
	const liveChecks = $derived(evaluateGatewayPolicy(store.memberGateway, spentRatio));

	let adding = $state(false);
	let form = $state<{ category: PolicyCategory; label: string }>({ category: 'tool', label: '' });

	const complianceTone = (score: number): Tone =>
		score >= 90 ? 'strong' : score >= 60 ? 'at-risk' : 'critical';
	const statusLabel = (code: PolicyStatus) =>
		POLICY_STATUSES.find((s) => s.code === code)?.label ?? code;
	const statusChip: Record<PolicyStatus, string> = {
		ok: 'bg-success-50 text-success-700',
		warn: 'bg-accent-50 text-accent-600',
		violation: 'bg-danger-50 text-danger-700'
	};
	const statusIcon: Record<PolicyStatus, 'check' | 'sparkles' | 'info'> = {
		ok: 'check',
		warn: 'sparkles',
		violation: 'info'
	};

	function submit() {
		if (form.label.trim()) {
			store.addPolicyRule({ category: form.category, label: form.label.trim() });
			form = { category: 'tool', label: '' };
			adding = false;
		}
	}
</script>

<div class="space-y-4">
	<!-- ══ Zone A — Live cost checks, computed from the gateway's real spend ══ -->
	<section class="rounded-card border border-line bg-surface p-4">
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
				Live cost checks
			</p>
			<span
				class="rounded-pill px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] {gatewayConfigured
					? 'bg-success-50 text-success-700'
					: 'bg-surface-sunken text-ink-500'}"
			>
				{gatewayConfigured ? 'Live' : 'Advisory'}
			</span>
			<span class="text-[11px] text-ink-400">Computed from the AI Gateway's real metered spend.</span>
		</div>
		<div class="grid gap-1.5 sm:grid-cols-2">
			{#each liveChecks as c (c.id)}
				<article class="flex items-start gap-2.5 rounded-card border border-line bg-surface-sunken/40 p-3">
					<Icon
						name={statusIcon[c.status]}
						size={16}
						class={c.status === 'ok'
							? 'text-success-600'
							: c.status === 'warn'
								? 'text-accent-600'
								: 'text-danger-600'}
					/>
					<div class="min-w-0 flex-1">
						<p class="text-[13px] font-medium text-ink-800">{c.label}</p>
						<p class="mt-0.5 text-[11px] text-ink-500">{c.detail}</p>
					</div>
					<span
						class="shrink-0 rounded-pill px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] {statusChip[c.status]}"
					>
						{statusLabel(c.status)}
					</span>
				</article>
			{/each}
		</div>
		{#if !gatewayConfigured}
			<p class="mt-2 text-[11px] text-ink-400">
				Advisory: no proxy wired. Budgets & spend are local until
				<span class="font-mono">LITELLM_GATEWAY_URL</span> is set.
			</p>
		{/if}
	</section>

	<!-- ══ Zone B — Declared policy rules (qualitative) + compliance ═════════ -->
	<section class="rounded-card border border-line bg-surface p-4">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
			<div class="flex items-center gap-3">
				<ScoreRing score={store.compliance} tone={complianceTone(store.compliance)} size={44} />
				<div>
					<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
						Declared policy · compliance
					</p>
					<p class="text-sm font-semibold text-ink-800">
						{store.draft.policyRules.filter((r) => r.status === 'ok').length} of {store.draft
							.policyRules.length} rules met
					</p>
					<p class="text-[10px] text-ink-400">Compliance tracking, not a productivity ranking.</p>
				</div>
			</div>
			<Button variant="outline" size="sm" onclick={() => (adding = !adding)}>
				<Icon name="plus" size={14} /> Add rule
			</Button>
		</div>

		{#if adding}
			<div class="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-brand-200 bg-brand-50/40 p-3">
				<select
					bind:value={form.category}
					class="rounded-field border border-line bg-surface px-2 py-1.5 text-sm text-ink-700 outline-none"
				>
					{#each POLICY_CATEGORIES as c (c.code)}
						<option value={c.code}>{c.label}</option>
					{/each}
				</select>
				<input
					bind:value={form.label}
					placeholder="Rule - e.g. No real customer data in prompts"
					class="min-w-[200px] flex-1 rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
				/>
				<Button variant="primary" size="sm" onclick={submit}>Add</Button>
			</div>
		{/if}

		{#if store.draft.policyRules.length === 0}
			<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-8 text-center">
				<p class="text-sm font-semibold text-ink-700">No AI policy rules yet.</p>
				<p class="mt-1 text-xs text-ink-500">
					Add the usage rules the gateway should enforce - approved tools, admissible data, required
					reviews.
				</p>
			</div>
		{:else}
			<div class="grid gap-x-4 gap-y-4 sm:grid-cols-2">
				{#each POLICY_CATEGORIES as cat (cat.code)}
					{@const rules = store.draft.policyRules.filter((r) => r.category === cat.code)}
					{#if rules.length > 0}
						<div>
							<p class="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
								{cat.label}
							</p>
							<div class="space-y-1.5">
								{#each rules as r (r.id)}
									<article class="rounded-card border border-line bg-surface p-3">
										<div class="flex items-start gap-2.5">
											<Icon
												name={statusIcon[r.status]}
												size={16}
												class={r.status === 'ok'
													? 'text-success-600'
													: r.status === 'warn'
														? 'text-accent-600'
														: 'text-danger-600'}
											/>
											<div class="min-w-0 flex-1">
												<p class="text-[13px] font-medium text-ink-800">{r.label}</p>
												{#if r.detail}<p class="mt-0.5 text-[11px] text-ink-500">{r.detail}</p>{/if}
											</div>
											<select
												value={r.status}
												onchange={(e) => store.setPolicyRuleStatus(r.id, e.currentTarget.value as PolicyStatus)}
												class="rounded-field px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] outline-none {statusChip[r.status]}"
											>
												{#each POLICY_STATUSES as s (s.code)}
													<option value={s.code}>{statusLabel(s.code)}</option>
												{/each}
											</select>
											<button
												type="button"
												onclick={() => store.removePolicyRule(r.id)}
												class="text-ink-300 hover:text-danger-500"
												aria-label="Remove"><Icon name="x" size={14} /></button
											>
										</div>
									</article>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</section>
</div>
