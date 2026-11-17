<script lang="ts">
	import type { Snippet } from 'svelte';
	/** A part of a SideDrawer: "WHERE IT APPLIES", its grey boxes under it. */
	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="mt-6 mb-2 font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">{title}</div>
<div class="flex flex-col gap-1.5 *:bg-surface-sunken *:px-3 *:py-2 *:text-sm *:[overflow-wrap:anywhere]">{@render children()}</div>
