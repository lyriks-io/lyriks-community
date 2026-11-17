<script lang="ts">
	import { Icon, SectionCard } from '$ui/design-system';
	import { FORM_FACTOR_GROUPS } from '$domain/foundation';
	import type { IdentityStore } from './identity-store.svelte';

	interface Props {
		store: IdentityStore;
	}
	let { store }: Props = $props();
</script>

<!-- Every software type at once, one row per category divided by a hairline:
     compact ticks sized to their words, never tiles stretched across the card.
     Each option is ticked, never pointed at (a box, not a dot). -->
<SectionCard icon="monitor" title="Form factor">
	<div class="@container divide-y divide-line-strong">
		{#each FORM_FACTOR_GROUPS as group (group.label)}
			<div class="grid gap-x-5 gap-y-2 py-3 first:pt-0 last:pb-0 @xl:grid-cols-[150px_minmax(0,1fr)] @xl:items-stretch">
				<p class="text-[0.6875rem] font-semibold text-ink-500 @xl:self-center">{group.label}</p>
				<!-- A vertical rule parts the category from its options on wide cards. -->
				<div class="flex flex-wrap items-center gap-1.5 @xl:border-l @xl:border-line-strong @xl:pl-5">
					{#each group.items as item (item.code)}
						{@const selected = store.isFormFactor(item.code)}
						<button
							type="button"
							role="checkbox"
							aria-checked={selected}
							title={item.hint}
							onclick={() => store.toggleFormFactor(item.code)}
							class="inline-flex items-center gap-2 rounded-field border px-2.5 py-1 text-[0.8125rem] transition-colors {selected
								? 'border-brand-300 bg-brand-50 font-medium text-brand-700'
								: 'border-line text-ink-700 hover:border-line-strong hover:bg-surface-sunken/60'}"
						>
							<span
								class="grid size-3.5 shrink-0 place-items-center rounded-sm border {selected
									? 'border-brand-500 bg-brand-500 text-white'
									: 'border-line-strong bg-surface'}"
							>
								{#if selected}<Icon name="check" size={10} />{/if}
							</span>
							{item.label}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</SectionCard>
