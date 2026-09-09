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
		<div class="flex items-center gap-1.5">
			{#if label}
				<label for={htmlFor} class="text-[11px] font-semibold text-ink-500">
					{label}{#if required}<span class="ml-0.5 text-magenta-500">*</span>{/if}
				</label>
				{#if hint}
					<span class="text-[10px] text-ink-400">· {hint}</span>
				{/if}
			{/if}
		</div>
	{/if}

	<div class="space-y-1.5">
		{@render children()}

		{#if error || (count !== undefined && max !== undefined)}
			<div class="flex items-start justify-between gap-3 text-xs">
				<span class={error ? 'text-danger-500' : 'text-ink-500'}>{error ?? ''}</span>
				{#if count !== undefined && max !== undefined}
					<span class={overCount ? 'text-danger-500' : 'text-ink-400'}>{count}/{max}</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
