<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button, Icon, type IconName } from '$ui/design-system';
	import { CONSTRAINT_CATEGORIES, type ConstraintCategory } from '$domain/architecture';
	import type { ArchitectureStore } from '../draft-store.svelte';

	interface Props {
		store: ArchitectureStore;
		/** A line under the header, for what the page wants to say about the list (rows still filed elsewhere). */
		notice?: Snippet;
	}
	let { store, notice }: Props = $props();

	const categoryIcon: Record<ConstraintCategory, IconName> = {
		data_residency: 'server',
		encryption: 'cpu',
		audit: 'file-check',
		access: 'users',
		performance: 'gauge',
		compliance: 'check',
		other: 'info'
	};
</script>

<section class="rounded-card border border-line bg-surface">
	<header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
		<p class="text-[0.625rem] font-bold uppercase tracking-widest text-brand-400">
			Technical constraints
		</p>
		<Button variant="outline" size="sm" onclick={() => store.addConstraint()}>
			<Icon name="plus" size={14} /> Constraint
		</Button>
	</header>
	{@render notice?.()}

	{#if store.draft.constraints.length === 0}
		<p class="px-4 py-6 text-center text-xs text-ink-400">
			No constraint yet. Pin the non-negotiables (EU-data-only, encryption, audit, RBAC…).
		</p>
	{:else}
		<ul class="divide-y divide-line">
			{#each store.draft.constraints as c (c.id)}
				<li data-anchor={c.id} class="flex items-start gap-3 px-4 py-2.5">
					<span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-500">
						<Icon name={categoryIcon[c.category]} size={14} />
					</span>
					<div class="min-w-0 flex-1">
						<input
							value={c.title}
							oninput={(e) => store.updateConstraint(c.id, 'title', e.currentTarget.value)}
							placeholder="Constraint - e.g. EU data only"
							class="w-full border-none bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
						/>
						<input
							value={c.detail}
							oninput={(e) => store.updateConstraint(c.id, 'detail', e.currentTarget.value)}
							placeholder="The rule in plain words"
							class="w-full border-none bg-transparent text-xs text-ink-500 outline-none placeholder:text-ink-300"
						/>
					</div>
					<select
						value={c.category}
						onchange={(e) =>
							store.updateConstraint(c.id, 'category', e.currentTarget.value as ConstraintCategory)}
						class="mt-0.5 rounded-field border border-line bg-surface px-1.5 py-0.5 text-[0.6875rem] text-ink-600"
					>
						{#each CONSTRAINT_CATEGORIES as cat (cat.code)}
							<option value={cat.code}>{cat.label}</option>
						{/each}
					</select>
					<button
						type="button"
						onclick={() => store.removeConstraint(c.id)}
						class="mt-1 text-ink-300 hover:text-danger-500"><Icon name="x" size={14} /></button
					>
				</li>
			{/each}
		</ul>
	{/if}
</section>
