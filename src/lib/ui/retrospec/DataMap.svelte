<script lang="ts">
	import type { DataMapLayout, DataTable } from '$domain/retrospec';

	/**
	 * The data map of the review, the design's drawing on its dotted canvas:
	 * each host framed in green, each database inside it in blue, and its
	 * tables as cards listing their fields with the primary and foreign keys.
	 * The tables flow in a grid rather than on a hand-placed board, so a model
	 * of any size reads on any screen; the canvas scrolls once it is tall.
	 */
	let { map }: { map: DataMapLayout } = $props();

	const KEY_LOOK = { PK: 'bg-orange-tint text-evo-orange', FK: 'bg-blue-tint text-evo-violet-ink', '': 'text-evo-faint-2' } as const;
</script>

{#snippet table(t: DataTable)}
	<div class="overflow-hidden rounded-evo-btn border border-evo-ink border-l-4 border-l-orange bg-white">
		<div class="flex items-center gap-2 border-b border-evo-line px-3 py-2.5">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0047b3" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 10v10"></path></svg>
			<span class="min-w-0 truncate text-[0.9375rem] font-bold">{t.name}</span>
			<span class="ml-auto text-xs text-evo-muted">{t.rows.length}</span>
		</div>
		<div class="grid grid-cols-[56px_1fr_1fr] bg-evo-sunken px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.06em] text-evo-muted">
			<span>KEY</span><span>FIELD</span><span>TYPE</span>
		</div>
		{#each t.rows as row, i (i)}
			<div class="grid h-7 grid-cols-[56px_1fr_1fr] items-center border-t border-evo-chip px-2.5 text-xs">
				<span>
					{#if row.key}<span class="inline-block min-w-[30px] px-1.5 py-0.5 text-center text-[0.625rem] font-bold {KEY_LOOK[row.key]}">{row.key}</span>{:else}<span class="inline-block min-w-[30px] text-center text-evo-faint-2" aria-hidden="true">·</span>{/if}
				</span>
				<span class="truncate font-evo-mono text-evo-ink">{row.name}</span>
				<span class="truncate px-1.5 py-0.5 font-evo-mono text-[0.6875rem] {row.key === 'FK' ? 'bg-blue-tint text-evo-violet-ink' : 'text-evo-muted'}">{row.type}</span>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet tables(list: readonly DataTable[])}
	<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
		{#each list as t (t.id)}{@render table(t)}{/each}
	</div>
{/snippet}

<div class="flex flex-col gap-2.5">
	<div class="max-h-[760px] overflow-auto rounded-xl bg-evo-canvas bg-[radial-gradient(var(--color-evo-canvas-dot)_1px,transparent_1px)] bg-size-[16px_16px] p-4">
		<div class="flex flex-col gap-4">
			{#each map.hosts as host (host.id)}
				<div class="flex flex-col gap-3 rounded-2xl border-2 border-evo-green-line bg-white/35 p-3.5">
					<div class="flex flex-wrap items-center gap-2">
						<span aria-hidden="true" class="flex size-5 items-center justify-center bg-evo-line text-[0.6875rem]">▦</span>
						<span class="font-evo-mono text-[0.6875rem] font-bold tracking-[0.08em] text-evo-green-stroke uppercase">{host.kind}</span>
						<span class="font-bold">{host.name}</span>
						{#if host.where}<span class="text-xs text-evo-muted">{host.where}</span>{/if}
					</div>
					{#each host.databases as db (db.id)}
						<div class="flex flex-col gap-3 rounded-xl border border-evo-journey-line bg-blue-tint/55 p-3">
							<div class="flex flex-wrap items-center gap-1.5">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0047b3" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path></svg>
								<span class="font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-blue-ink uppercase">{db.name}</span>
								<span class="text-xs text-evo-muted">{db.engine} · {db.tables.length} {db.tables.length === 1 ? 'table' : 'tables'}</span>
							</div>
							{#if db.tables.length > 0}{@render tables(db.tables)}{/if}
						</div>
					{/each}
				</div>
			{/each}
			{#if map.loose.length > 0}
				<div class="flex flex-col gap-3">
					{#if map.hosts.length > 0}<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] text-evo-muted">NOT FILED UNDER A DATABASE</span>{/if}
					{@render tables(map.loose)}
				</div>
			{/if}
		</div>
	</div>
	<div class="flex flex-wrap gap-3.5 text-xs text-evo-muted">
		<span><b class="text-evo-orange">PK</b> primary key</span>
		<span><b class="text-evo-violet-ink">FK</b> foreign key</span>
	</div>
</div>
