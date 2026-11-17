<script lang="ts">
	import type { ActionData } from '$application/spec360/action-data';
	import type { EntityField } from '$domain/data';
	import { KICK, LINK, META } from '$ui/spec360/page/look';

	/**
	 * The data an action opened from the journeys diagram touches (action
	 * 6f38e6ed): each table drawn as a card of the data map holding only the
	 * fields it reads or writes, one per line with key, type and how it uses
	 * them; what the data model does not hold yet in a muted line; and a way to
	 * the whole map.
	 */
	interface Props {
		data: ActionData;
		/** The data model's fields, to read each one's key and type. */
		fields: readonly EntityField[];
		mapHref: string;
	}
	let { data, fields, mapHref }: Props = $props();

	const fieldOf = (tableId: string, name: string) => fields.find((f) => f.entityId === tableId && f.name === name);
	const keyOf = (f: EntityField | undefined) => (!f ? '' : f.isId ? 'PK' : f.relationTargetEntityId ? 'FK' : f.isUnique ? 'UK' : '');
	const KEY: Record<string, string> = { PK: 'bg-orange-tint text-orange-ink', FK: 'bg-blue-tint text-blue-ink', UK: 'bg-green-tint text-green-ink' };
	const rowsOf = (table: ActionData['tables'][number]) => [
		...table.writes.map((name) => ({ name, use: 'writes' as const })),
		...table.reads.map((name) => ({ name, use: 'reads' as const }))
	];
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center gap-3">
		<span class={KICK}>Data it touches</span>
		<a href={mapHref} class="{LINK} ml-auto min-h-0">Open the data map<span aria-hidden="true">→</span></a>
	</div>
	{#if data.tables.length}
		<div class="flex flex-wrap items-start gap-4">
			{#each data.tables as table (table.tableId)}
				<div class="w-[340px] max-w-full border-[1.5px] border-ink bg-paper">
					<div class="flex items-center gap-2 border-b-[1.5px] border-ink bg-toner px-3 py-2">
						<strong class="min-w-0 flex-1 truncate text-sm text-ink">{table.table}</strong>
						{#if table.records}<span class="font-evo-mono text-[0.6875rem] text-ink-3">{table.records === 'written' ? 'records created or removed' : 'records read'}</span>{/if}
					</div>
					{#each rowsOf(table) as row (row.use + row.name)}
						{@const f = fieldOf(table.tableId, row.name)}
						{@const key = keyOf(f)}
						<div class="grid grid-cols-[34px_minmax(0,1fr)_auto_58px] items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
							<span class="flex h-5 items-center justify-center font-evo-mono text-[0.625rem] font-bold {key ? KEY[key] : 'text-ink-3'}">{key || '·'}</span>
							<span class="truncate font-evo-mono text-[0.8125rem] text-ink">{row.name}</span>
							<span class="font-evo-mono text-[0.6875rem] text-ink-3">{f?.type ?? ''}</span>
							<span class="flex h-5 items-center justify-center border-[1.5px] font-evo-mono text-[0.625rem] font-bold uppercase {row.use === 'writes' ? 'border-ink bg-ink text-paper' : 'border-ink text-ink'}">{row.use}</span>
						</div>
					{:else}
						<p class="m-0 px-3 py-2 text-sm text-ink-3">No field: it only {table.records === 'written' ? 'creates or removes records' : 'reads records'}.</p>
					{/each}
				</div>
			{/each}
		</div>
	{:else}
		<p class="m-0 text-sm text-ink-3">It reads and writes no field of the data model yet.</p>
	{/if}
	{#if data.untracked.length}<p class="{META} m-0">Not in the data model yet: {data.untracked.join(', ')}</p>{/if}
</div>
