<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import { initials } from '$domain/supervision';
	import type { SupervisionStore } from '../draft-store.svelte';

	interface Props {
		store: SupervisionStore;
		/** True when a real LiteLLM proxy is wired server-side (env-gated). */
		gatewayConfigured: boolean;
	}
	let { store, gatewayConfigured }: Props = $props();

	const usd = (n: number) => `$${n.toFixed(n < 100 ? 2 : 0)}`;
	const money = (n: number) => `$${Math.round(n)}`;

	// Board members who don't have an AI key yet — the candidates to provision.
	const unprovisioned = $derived(store.memberGateway.filter((m) => !m.key));

	// Little inline "provision a key" form.
	let newMember = $state('');
	let newBudget = $state(50);
	function provision() {
		const name = newMember.trim() || unprovisioned[0]?.member || '';
		if (!name) return;
		store.provisionMemberKey(name, newBudget);
		newMember = '';
		newBudget = 50;
	}

	function barTone(pct: number): string {
		return pct >= 90 ? 'bg-danger-500' : pct >= 66 ? 'bg-accent-500' : 'bg-success-500';
	}
	const auditTone: Record<string, string> = {
		ok: 'bg-success-50 text-success-700',
		blocked: 'bg-danger-50 text-danger-700',
		flagged: 'bg-accent-50 text-accent-600'
	};
	const auditLabel: Record<string, string> = { ok: 'Allowed', blocked: 'Blocked', flagged: 'Flagged' };
</script>

<div class="space-y-5">
	<!-- What this is -->
	<div class="flex items-start gap-2.5 rounded-card border border-line bg-surface-sunken/40 p-3.5">
		<span class="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-600">
			<Icon name="users" size={15} />
		</span>
		<div class="min-w-0 flex-1">
			<p class="text-[12px] leading-relaxed text-ink-600">
				<span class="font-semibold text-ink-800">AI usage by member.</span>
				Each workspace member gets their own LiteLLM virtual key - keyed to their login - so spend,
				tokens and blocked calls attribute to real people, cost & quota governance, never a
				productivity score.
				{#if !gatewayConfigured}
					<span class="text-ink-400">
						No proxy is wired, so budgets are advisory (local); wire
						<span class="font-mono">LITELLM_GATEWAY_URL</span> to enforce and pull real spend.
					</span>
				{/if}
			</p>
			{#if gatewayConfigured}
				<div class="mt-2.5 flex flex-wrap items-center gap-2">
					<span class="flex items-center gap-1.5 text-[11px] font-medium text-success-700">
						<Icon name="check" size={13} /> LiteLLM proxy linked
					</span>
					<Button variant="primary" size="sm" onclick={store.syncMemberKeys}>
						<Icon name="server" size={13} /> Provision keys on proxy
					</Button>
					<Button variant="outline" size="sm" onclick={store.pullMemberSpend}>
						<Icon name="gauge" size={13} /> Pull live spend
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Summary tiles -->
	<div class="grid grid-cols-2 gap-3 md:grid-cols-5">
		{#each [{ label: 'Members', value: String(store.gatewayTotals.members) }, { label: 'Keys', value: `${store.gatewayTotals.provisioned}/${store.gatewayTotals.members}` }, { label: 'AI spend', value: `${money(store.gatewayTotals.spentUsd)}` }, { label: 'Budget', value: money(store.gatewayTotals.budgetUsd) }, { label: 'Blocked', value: String(store.gatewayTotals.blocked) }] as tile (tile.label)}
			<div class="rounded-card border border-line bg-surface p-3">
				<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{tile.label}</p>
				<p class="mt-0.5 text-2xl font-bold text-ink-800">{tile.value}</p>
			</div>
		{/each}
	</div>

	<!-- Budget / quota alerts -->
	{#if store.gatewayAlerts.length > 0}
		<section class="rounded-card border border-danger-200 bg-danger-50/40 p-3.5">
			<p class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-danger-700">
				<Icon name="info" size={14} /> Budget & quota alerts · {store.gatewayAlerts.length}
			</p>
			<div class="space-y-1">
				{#each store.gatewayAlerts as a, i (i)}
					<p class="flex items-center gap-1.5 text-[12px] text-ink-700">
						<span class="size-1.5 shrink-0 rounded-full bg-danger-500"></span>{a}
					</p>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Provision a key -->
	<div class="flex flex-wrap items-end gap-2 rounded-card border border-dashed border-line bg-surface p-3">
		<label class="min-w-40 flex-1">
			<span class="mb-1 block text-[11px] text-ink-500">Member</span>
			{#if unprovisioned.length > 0}
				<select
					bind:value={newMember}
					class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
				>
					<option value="">Choose a member…</option>
					{#each unprovisioned as m (m.member)}
						<option value={m.member}>{m.name}</option>
					{/each}
				</select>
			{:else}
				<input
					bind:value={newMember}
					placeholder="Member name"
					class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
				/>
			{/if}
		</label>
		<label class="w-32">
			<span class="mb-1 block text-[11px] text-ink-500">Budget ($/mo)</span>
			<input
				type="number"
				min="0"
				bind:value={newBudget}
				class="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
			/>
		</label>
		<Button variant="primary" size="sm" onclick={provision}>
			<Icon name="plus" size={14} /> Provision key
		</Button>
	</div>

	<!-- Member cards -->
	{#each store.memberGateway as m (m.member)}
		<section class="rounded-card border border-line bg-surface p-3.5">
			<div class="mb-2.5 flex items-center gap-2.5">
				<span class="grid size-7 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
					{initials(m.name)}
				</span>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-semibold text-ink-800">{m.name}</p>
					<p class="truncate font-mono text-[10px] text-ink-400">
						{#if m.email}{m.email} · {/if}{m.keyValue}
					</p>
				</div>
				{#if m.key}
					<span class="rounded-pill bg-success-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-success-700">
						Provisioned
					</span>
					<button
						type="button"
						onclick={() => store.removeMemberKey(m.member)}
						class="text-ink-300 hover:text-danger-500"
						aria-label="Remove key"><Icon name="x" size={14} /></button
					>
				{:else}
					<Button variant="outline" size="sm" onclick={() => store.provisionMemberKey(m.member)}>
						Provision key
					</Button>
				{/if}
			</div>

			{#if m.key}
				<!-- Budget + quota bars -->
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<div class="mb-0.5 flex items-center justify-between text-[11px]">
							<span class="text-ink-500">Budget</span>
							<span class="font-mono text-ink-500">{usd(m.spentUsd)} / {money(m.key.monthlyBudgetUsd)}</span>
						</div>
						<div class="h-1.5 overflow-hidden rounded-pill bg-line">
							<div class="h-full rounded-pill {barTone(m.budgetPct)}" style="width:{Math.min(100, m.budgetPct)}%"></div>
						</div>
					</div>
					<div>
						<div class="mb-0.5 flex items-center justify-between text-[11px]">
							<span class="text-ink-500">Token quota</span>
							<span class="font-mono text-ink-500">
								{(m.tokensUsed / 1e6).toFixed(2)}M / {(m.key.tokenQuota / 1e6).toFixed(0)}M
							</span>
						</div>
						<div class="h-1.5 overflow-hidden rounded-pill bg-line">
							<div class="h-full rounded-pill {barTone(m.quotaPct)}" style="width:{Math.min(100, m.quotaPct)}%"></div>
						</div>
					</div>
				</div>

				<!-- Edit budget -->
				<div class="mt-2.5 flex flex-wrap items-center gap-2">
					<span class="text-[11px] text-ink-400">Monthly budget</span>
					<input
						type="number"
						min="0"
						value={m.key.monthlyBudgetUsd}
						onchange={(e) => store.setMemberBudget(m.member, Number(e.currentTarget.value))}
						class="w-24 rounded-field border border-line bg-surface px-2 py-1 text-[12px] text-ink-800 outline-none"
					/>
					<span class="text-[11px] text-ink-400">
						· {m.calls} call{m.calls === 1 ? '' : 's'}
						{#if m.blocked}· <span class="text-danger-600">{m.blocked} blocked</span>{/if}
						{#if m.flagged}· <span class="text-accent-600">{m.flagged} flagged</span>{/if}
					</span>
				</div>
			{:else}
				<p class="text-[12px] text-ink-400">
					No AI key yet - provision one to give {m.name.split(' ')[0]} a budget & token quota.
				</p>
			{/if}

			<!-- Recent calls for this member -->
			{#if m.recent.length > 0}
				<div class="mt-3 divide-y divide-line border-t border-line pt-1">
					{#each m.recent.slice(0, 4) as a (a.id)}
						<div class="flex items-start gap-2 py-1.5">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-1.5">
									<span class="font-mono text-[11px] text-ink-500">{a.model}</span>
									<span class="rounded-pill px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] {auditTone[a.status]}">
										{auditLabel[a.status]}
									</span>
								</div>
								{#if a.reason}
									<p class="text-[10px] text-ink-500">{a.reason}</p>
								{:else}
									<p class="text-[10px] text-ink-400">{(a.tokens / 1000).toFixed(1)}k tokens · {usd(a.cost)}</p>
								{/if}
							</div>
							<span class="shrink-0 text-[10px] text-ink-400">{a.when}</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/each}

	{#if store.memberGateway.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
			<p class="text-sm font-semibold text-ink-700">No members yet.</p>
			<p class="mt-1 text-xs text-ink-500">
				Add collaborators to the project team (or assign scopes on the Task tracking tab), then
				provision each member's AI key here.
			</p>
		</div>
	{/if}
</div>
