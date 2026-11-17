<script lang="ts">
	import { swatchInk, type ColorSlot } from '$application/spec360/experience';

	/**
	 * The colours of the brand as the v2 design draws them
	 * (ac-brand-palette-roles): one 110px swatch per slot, its value written on
	 * it, its name under it, the hover and active shades the brand gives under
	 * that; a slot the brand does not give is a dashed swatch reading not set.
	 */
	let { slots }: { slots: readonly ColorSlot[] } = $props();
</script>

<div class="flex flex-wrap gap-x-2.5 gap-y-3">
	{#each slots as slot (slot.name)}
		<div class="flex w-[110px] flex-col gap-1.5 text-[0.8125rem] text-evo-ink" title={slot.usage ? `${slot.name}: ${slot.usage}` : undefined}>
			{#if slot.color}
				<span
					class="box-border flex h-16 items-end px-2 py-1.5 font-evo-mono text-[0.6875rem] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] {swatchInk(slot.hex) === 'white' ? 'text-white' : 'text-evo-ink'}"
					style:background={slot.color}>{slot.hex ?? slot.color}</span
				>
			{:else}
				<span class="box-border flex h-16 items-end border-[1.5px] border-dashed border-ink-4 px-2 py-1.5 text-[0.6875rem] text-evo-muted">not set</span>
			{/if}
			<span>{slot.name}</span>
			{#each slot.shades as shade (shade.state)}
				<span class="-mt-0.5 flex items-center gap-1 text-[0.6875rem] whitespace-nowrap text-evo-muted" title="{slot.name} · {shade.state.toLowerCase()}: {shade.color}">
					<i aria-hidden="true" class="block size-3.5 flex-none shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style:background={shade.color}></i>
					{shade.state}<span class="font-evo-mono">{shade.hex ?? shade.color}</span>
				</span>
			{/each}
		</div>
	{/each}
</div>
