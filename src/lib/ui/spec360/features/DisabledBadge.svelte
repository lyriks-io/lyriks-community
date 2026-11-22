<script lang="ts">
	import type { DisabledMarker } from '$lib/unspa-schema';
	import { disabledLine } from './disable-element';

	/** The Disabled badge of an element put aside, with who disabled it, when and why (criterion c4071631). */
	let { marker }: { marker: DisabledMarker } = $props();
	const line = $derived(disabledLine(marker));
</script>

<span class="inline-flex min-w-0 flex-wrap items-center gap-1.5" data-disabled-badge>
	<span class="border border-ink-3 px-1.5 py-px font-evo-mono text-[0.6875rem] font-semibold tracking-wide text-ink-2 uppercase">Disabled</span>
	<span class="text-xs text-ink-3 [overflow-wrap:anywhere]">{line.replace(/^Disabled /, '')}</span>
</span>
