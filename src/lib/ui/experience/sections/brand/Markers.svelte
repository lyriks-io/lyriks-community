<script lang="ts">
	import { BRAND_MARKER_DEFS } from '$domain/experience';
	import type { ExperienceStore } from '../../draft-store.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const markers = $derived(store.draft.brand.markers);
</script>

<div class="grid gap-4 md:grid-cols-2">
	{#each BRAND_MARKER_DEFS as def (def.key)}
		<div class="space-y-2 rounded-field border border-line bg-surface-sunken p-3">
			<div>
				<div class="flex items-center gap-1.5">
					<span class="text-[11px] font-bold uppercase tracking-widest text-ink-500">{def.label}</span>
					{#if def.briefOnly}
						<span
							class="rounded-full bg-surface-sunken px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-ink-400 ring-1 ring-line"
							title="The simulator cannot render this trait; it ships in the exported brief only."
						>
							brief only
						</span>
					{/if}
				</div>
				<div class="text-[10px] text-ink-400">{def.hint}</div>
			</div>
			<div class="flex flex-wrap gap-1.5">
				{#each def.options as opt (opt.v)}
					{@const active = (markers[def.key] || def.options[0].v) === opt.v}
					<button
						type="button"
						aria-pressed={active}
						onclick={() => store.setMarker(def.key, opt.v)}
						class="min-w-[88px] flex-1 rounded-field border px-2 py-2 text-xs font-semibold transition-colors {active
							? 'border-brand-400 bg-brand-50 text-brand-700'
							: 'border-line bg-surface text-ink-600 hover:border-line-strong hover:text-ink-800'}"
					>
						<div>{opt.l}</div>
						<div class="mt-0.5 font-mono text-[9px] text-ink-400">{opt.preview}</div>
					</button>
				{/each}
			</div>
		</div>
	{/each}
</div>
