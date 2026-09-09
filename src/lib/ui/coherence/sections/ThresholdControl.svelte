<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { CoherenceStore } from '../draft-store.svelte';

	interface Props {
		store: CoherenceStore;
	}
	let { store }: Props = $props();

	/* Exposes the spec's "Update Threshold" action: the green bar readiness must
	   clear before specs can be generated. Bound to coherence.threshold via the
	   store's setThreshold (auth-gated, debounced autosave). */
	const onInput = (e: Event) => {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		if (Number.isFinite(v)) store.setThreshold(v);
	};

	const met = $derived(store.readiness >= store.draft.threshold);
</script>

<section class="rounded-card border border-line bg-surface p-4">
	<div class="mb-2 flex items-center justify-between gap-3">
		<p class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
			<Icon name="sliders" size={13} /> Green-bar threshold
		</p>
		<span
			class="rounded-pill px-2 py-0.5 text-[10px] font-semibold {met
				? 'bg-success-50 text-success-600'
				: 'bg-warning-50 text-warning-600'}"
		>
			{met ? 'Cleared' : `${store.draft.threshold - store.readiness} to go`}
		</span>
	</div>
	<div class="flex items-center gap-3">
		<input
			type="range"
			min="0"
			max="100"
			step="1"
			value={store.draft.threshold}
			oninput={onInput}
			class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-sunken accent-brand-500"
			aria-label="Readiness threshold"
		/>
		<input
			type="number"
			min="0"
			max="100"
			value={store.draft.threshold}
			oninput={onInput}
			class="w-16 rounded-field border border-line bg-surface px-2 py-1 text-right text-sm font-bold text-ink-900 focus:border-brand-300 focus:outline-none"
			aria-label="Readiness threshold value"
		/>
	</div>
	<p class="mt-2 text-[10.5px] leading-snug text-ink-400">
		Specs can only be generated once readiness reaches this bar with zero blocking gaps.
	</p>
</section>
