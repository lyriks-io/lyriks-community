<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import {
		APPROVAL_AREAS,
		APPROVAL_STATUSES,
		SETTLED_APPROVAL_STATUSES,
		type ApprovalStatus
	} from '$domain/approvals';
	import type { ApprovalsStore } from './draft-store.svelte';

	interface Props {
		store: ApprovalsStore;
	}
	let { store }: Props = $props();

	const statusClass: Record<ApprovalStatus, string> = {
		draft: 'bg-surface-sunken text-ink-500',
		in_review: 'bg-info-50 text-info-600',
		approved: 'bg-success-50 text-success-600',
		changes_requested: 'bg-warning-50 text-warning-600',
		accepted_risk: 'bg-brand-50 text-brand-600'
	};

	const counts = $derived.by(() => {
		const c: Record<string, number> = {};
		for (const i of store.draft.items) c[i.status] = (c[i.status] ?? 0) + 1;
		return c;
	});
	const settled = $derived(
		store.draft.items.filter((i) => SETTLED_APPROVAL_STATUSES.includes(i.status)).length
	);
</script>

<div class="space-y-4">
	<!-- Summary -->
	{#if store.draft.items.length > 0}
		<div class="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-2.5 text-xs">
			<span class="font-semibold text-ink-700">{settled}/{store.draft.items.length} settled</span>
			<span class="text-ink-300">·</span>
			{#each APPROVAL_STATUSES as s (s.code)}
				{#if counts[s.code]}
					<span class="rounded-pill px-2 py-0.5 font-medium {statusClass[s.code]}">
						{counts[s.code]} {s.label}
					</span>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="relative w-full max-w-xs">
			<div class="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-ink-400">
				<Icon name="search" size={14} />
			</div>
			<input
				value={store.filter}
				oninput={(e) => store.setFilter(e.currentTarget.value)}
				placeholder="Filter approvals…"
				class="w-full rounded-pill border border-line bg-surface-sunken py-1.5 pl-8 pr-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-300"
			/>
		</div>
		<Button size="sm" onclick={store.addItem}>
			<Icon name="plus" size={14} /> Add approval
		</Button>
	</div>

	{#if store.draft.items.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
			<p class="text-sm font-semibold text-ink-700">Nothing to sign off yet.</p>
			<p class="mt-1 text-xs text-ink-500">
				Add an approval for a spec area or milestone, assign a reviewer, and track its status.
			</p>
		</div>
	{:else if store.filtered.length === 0}
		<p class="px-1 py-8 text-center text-sm text-ink-500">No approvals match “{store.filter}”.</p>
	{:else}
		<ul class="space-y-3">
			{#each store.filtered as item (item.id)}
				<li class="rounded-card border border-line bg-surface p-3">
					<div class="flex items-start gap-2">
						<div class="min-w-0 flex-1 space-y-2">
							<div class="flex flex-wrap items-center gap-2">
								<input
									value={item.title}
									oninput={(e) => store.updateItem(item.id, { title: e.currentTarget.value })}
									placeholder="What needs sign-off"
									class="min-w-0 flex-1 rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-300"
								/>
								<select
									value={item.status}
									onchange={(e) => store.setStatus(item.id, e.currentTarget.value as ApprovalStatus)}
									class="rounded-field border-0 px-2 py-1.5 text-xs font-semibold {statusClass[item.status]} focus:ring-2 focus:ring-brand-300"
								>
									{#each APPROVAL_STATUSES as s (s.code)}
										<option value={s.code}>{s.label}</option>
									{/each}
								</select>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<select
									value={item.area}
									onchange={(e) => store.updateItem(item.id, { area: e.currentTarget.value })}
									class="rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-300"
								>
									{#each APPROVAL_AREAS as a (a)}
										<option value={a}>{a}</option>
									{/each}
								</select>
								<input
									value={item.reviewer}
									oninput={(e) => store.updateItem(item.id, { reviewer: e.currentTarget.value })}
									placeholder="Reviewer"
									class="w-36 rounded-field border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
								/>
								<input
									type="date"
									value={item.deadline}
									oninput={(e) => store.updateItem(item.id, { deadline: e.currentTarget.value })}
									title="Review deadline"
									class="rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-300"
								/>
							</div>
							<textarea
								value={item.note}
								oninput={(e) => store.updateItem(item.id, { note: e.currentTarget.value })}
								rows="2"
								placeholder="Review comment or accepted-risk rationale…"
								class="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
							></textarea>
						</div>
						<button
							type="button"
							onclick={() => store.removeItem(item.id)}
							aria-label="Remove approval"
							class="shrink-0 rounded p-1 text-ink-400 hover:bg-surface-sunken hover:text-danger-500"
						>
							<Icon name="x" size={14} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
