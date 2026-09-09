<script lang="ts">
	import { Field, Icon, SectionCard, Textarea } from '$ui/design-system';
	import { UI_STATE_KEYS, type UiStateKey } from '$domain/foundation';
	import type { OperationsStore } from '../operations-store.svelte';

	interface Props {
		store: OperationsStore;
	}
	let { store }: Props = $props();

	const LABELS: Record<UiStateKey, { label: string; hint: string }> = {
		empty: { label: 'Empty state', hint: 'No data yet. CTA, helper text, illustration.' },
		loading: { label: 'Loading state', hint: 'Skeleton, spinner, optimistic UI?' },
		error: { label: 'Error state', hint: 'What the user sees on failure + recovery action.' },
		success: { label: 'Success state', hint: 'Confirmation pattern, redirect or toast?' },
		partialData: { label: 'Partial data state', hint: 'Some fields missing but the screen still renders.' }
	};

	const selected = $derived(store.selectedScreen || store.screens[0] || '');
	const current = $derived(selected ? store.draft.screenStates[selected] : undefined);
</script>

<SectionCard
	eyebrow="UI states"
	icon="monitor"
	title="Five states per screen the LLM must always handle"
	subtitle="Without these the LLM ships happy-path-only UI. Cover empty / loading / error / success / partial-data per screen."
>
	{#if store.screens.length === 0}
		<div class="rounded-field border border-dashed border-ink-200 bg-surface-sunken p-6 text-center text-sm text-ink-400">
			No screen declared yet. Add screens in Experience first, then describe their states here.
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
			<div class="max-h-[460px] space-y-0.5 overflow-y-auto rounded-field border border-ink-100 p-1.5">
				{#each store.screens as screen (screen)}
					{@const count = store.screenStateCount(screen)}
					{@const active = selected === screen}
					<button
						type="button"
						onclick={() => store.selectScreen(screen)}
						class="flex w-full items-center gap-2 rounded-field px-2.5 py-1.5 text-left text-xs transition {active
							? 'bg-brand-50 font-semibold text-ink-900'
							: 'text-ink-600 hover:bg-surface-sunken'}"
					>
						<span class="flex-1 truncate font-mono">{screen}</span>
						<span class="text-[10px] font-mono {count === 5 ? 'text-emerald-600' : 'text-ink-400'}">{count}/5</span>
					</button>
				{/each}
			</div>

			<div class="min-w-0 space-y-3">
				{#if selected}
					<p class="text-xs text-ink-500">
						<span class="font-semibold text-ink-800">{selected}</span> · {store.screenStateCount(selected)}/5 states described
					</p>
					{#each UI_STATE_KEYS as key (key)}
						<Field label={LABELS[key].label} hint={LABELS[key].hint}>
							<Textarea
								value={current?.[key] ?? ''}
								rows={2}
								placeholder={`Describe the ${LABELS[key].label.toLowerCase()} for ${selected}`}
								oninput={(v) => store.setScreenState(selected, key, v)}
							/>
						</Field>
					{/each}
				{:else}
					<p class="flex items-center gap-1.5 text-xs text-ink-400">
						<Icon name="info" size={14} /> Pick a screen to describe its states.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</SectionCard>
