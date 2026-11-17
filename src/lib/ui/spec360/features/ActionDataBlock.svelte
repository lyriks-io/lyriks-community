<script lang="ts">
	import type { ActionData } from '$application/spec360/action-data';
	import { KICK, META } from '$ui/spec360/page/look';

	/**
	 * The data one action reads and writes, under its table, through the links
	 * field to state; what no field carries named apart (criterion d0e0e1a5).
	 */
	let { data }: { data: ActionData } = $props();
</script>

<div class="flex flex-col gap-1.5">
	<span class={KICK}>Data</span>
	{#each data.tables as table (table.tableId)}
		<div class="grid grid-cols-[minmax(120px,200px)_minmax(0,1fr)] items-baseline gap-x-[18px] gap-y-1 border border-line bg-toner px-3 py-2 max-[560px]:grid-cols-1">
			<span class="text-sm font-bold text-ink">{table.table}</span>
			<span class="flex flex-col gap-1 text-sm text-ink-2">
				{#if table.writes.length}<span><span class="{KICK} mr-2">Writes</span><span class="font-evo-mono text-ink">{table.writes.join(', ')}</span></span>{/if}
				{#if table.reads.length}<span><span class="{KICK} mr-2">Reads</span><span class="font-evo-mono text-ink">{table.reads.join(', ')}</span></span>{/if}
				{#if table.records}<span><span class="{KICK} mr-2">Records</span>{table.records === 'written' ? 'created or removed' : 'read'}</span>{/if}
			</span>
		</div>
	{:else}
		<p class="m-0 text-sm text-ink-3">{data.untracked.length ? 'None of the states this action uses carries a field of the data model yet.' : 'This action reads and writes nothing.'}</p>
	{/each}
	{#if data.untracked.length}<p class="{META} m-0">Not in the data model: {data.untracked.join(', ')}</p>{/if}
</div>
