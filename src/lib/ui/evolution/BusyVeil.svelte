<script lang="ts">
	import { busyLabel } from './busy.svelte';

	/** The veil of a long act (busy.svelte.ts): a spinner and what Lyriks is doing, over the page. */
	const label = $derived(busyLabel());
</script>

{#if label}
	<div class="animate-lk-fade fixed inset-0 z-50 grid place-items-center bg-canvas/75 backdrop-blur-[2px]" role="status" aria-live="polite">
		<div class="flex items-center gap-3 rounded-card border-[1.5px] border-ink bg-paper px-5 py-4 shadow-pop">
			<span class="animate-lk-spin size-[22px] shrink-0 rounded-full border-[3px] border-toner-2 border-t-orange" aria-hidden="true"></span>
			<span class="text-[0.9375rem] font-bold text-ink-900">{label}</span>
		</div>
	</div>
{/if}
