<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label?: string;
		hint?: string;
		required?: boolean;
		error?: string | null;
		/** When both are set, shows a `count / max` char counter below. */
		count?: number;
		max?: number;
		for?: string;
		/** Align label/input across a 2-col grid via subgrid (≥ @lg container): the
		 *  field exposes a label row + an input row that share the parent's tracks,
		 *  so neighbouring fields line up even when one label wraps to two lines. */
		subgrid?: boolean;
		children: Snippet;
	}
	let {
		label,
		hint,
		required = false,
		error = null,
		count,
		max,
		for: htmlFor,
		subgrid = false,
		children
	}: Props = $props();

	const overCount = $derived(count !== undefined && max !== undefined && count > max);
</script>

<div
	class={subgrid
		? 'space-y-1.5 @lg:row-span-2 @lg:grid @lg:grid-rows-subgrid @lg:gap-0 @lg:space-y-0'
		: 'space-y-1.5'}
>
	{#if label || subgrid}
		<div class={subgrid ? 'flex items-center gap-1.5 @lg:pb-1.5' : 'flex items-center gap-1.5'}>
			{#if label}
				<label for={htmlFor} class="font-evo-mono text-[0.6875rem] font-bold tracking-[0.08em] text-ink-3 uppercase">
					{label}{#if required}<span class="ml-0.5 text-red-ink">*</span>{/if}
				</label>
				{#if hint}
					<span class="text-[0.625rem] text-ink-400">· {hint}</span>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Under subgrid the input row is as tall as its tallest neighbour; a flex
	     column lets a growing control (flex-1) fill it so both fields match. -->
	<div class={subgrid ? 'space-y-1.5 @lg:flex @lg:flex-col' : 'space-y-1.5'}>
		{@render children()}

		{#if error || (count !== undefined && max !== undefined)}
			<div class="flex items-start justify-between gap-3 text-xs">
				<span class={error ? 'text-red-ink' : 'text-ink-3'}>{error ?? ''}</span>
				{#if count !== undefined && max !== undefined}
					<span class={overCount ? 'text-red-ink' : 'text-ink-3'}>{count}/{max}</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
