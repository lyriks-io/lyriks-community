<script lang="ts">
	import { Icon, ToggleTile } from '$ui/design-system';
	import { FORM_FACTOR_GROUPS } from '$domain/foundation';
	import type { IdentityStore } from './identity-store.svelte';

	interface Props {
		store: IdentityStore;
	}
	let { store }: Props = $props();

	// Auto-open the category that holds a currently-selected form factor, else the first.
	const detectedGroup = $derived(
		FORM_FACTOR_GROUPS.find((g) => g.items.some((i) => store.isFormFactor(i.code)))?.label ??
			FORM_FACTOR_GROUPS[0].label
	);
	let openCategory = $state<string | null>(null);
	const activeCategory = $derived(openCategory ?? detectedGroup);
	const group = $derived(FORM_FACTOR_GROUPS.find((g) => g.label === activeCategory) ?? null);
</script>

<div class="@container space-y-4">
	<div class="flex items-start gap-3">
		<span class="mt-0.5 grid size-9 place-items-center rounded-field bg-accent-50 text-accent-500">
			<Icon name="monitor" size={18} />
		</span>
		<div>
			<p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-500">Form factor</p>
			<h2 class="text-lg font-semibold text-ink-900">Software type</h2>
			<p class="mt-0.5 text-sm text-ink-500">
				Pick a category - the matching form factors appear on the right.
			</p>
		</div>
	</div>

	<div class="grid gap-3 @sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)]">
		<!-- Master : category list -->
		<div class="space-y-1.5">
			<p class="flex items-center gap-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-ink-400">
				<Icon name="layers" size={12} /> Category
			</p>
			<div class="grid gap-1">
				{#each FORM_FACTOR_GROUPS as g (g.label)}
					{@const containsSelected = g.items.some((i) => store.isFormFactor(i.code))}
					{@const isOpen = activeCategory === g.label}
					<button
						type="button"
						aria-pressed={isOpen}
						onclick={() => (openCategory = isOpen ? null : g.label)}
						class="flex items-center gap-2 rounded-field border px-2 py-1.5 text-left transition {isOpen
							? 'border-accent-200 bg-accent-50'
							: 'border-line bg-surface hover:border-accent-200'}"
					>
						<div class="min-w-0 flex-1">
							<div class="truncate text-[11px] font-semibold leading-tight text-ink-800">{g.label}</div>
							<div class="truncate text-[9px] text-ink-400">{g.items.length} types</div>
						</div>
						{#if containsSelected}
							<span class="size-1.5 shrink-0 rounded-full bg-accent-500"></span>
						{/if}
						<Icon name="chevron-right" size={12} />
					</button>
				{/each}
			</div>
		</div>

		<!-- Detail : form-factor tiles for the active category (multi-select per spec) -->
		{#if group}
			<div class="space-y-2">
				<div class="flex items-center gap-2 px-1">
					<span class="text-[9px] font-bold uppercase tracking-[0.16em] text-accent-500">{group.label}</span>
					<span class="text-[9px] text-ink-300">·</span>
					<span class="text-[9px] uppercase tracking-[0.16em] text-ink-400">pick all that apply</span>
				</div>
				<div class="grid gap-2">
					{#each group.items as item (item.code)}
						<ToggleTile
							title={item.label}
							hint={item.hint}
							selected={store.isFormFactor(item.code)}
							onToggle={() => store.toggleFormFactor(item.code)}
						/>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
