<script lang="ts">
	import { DB_ENGINES, FIELD_TYPES, HOST_KINDS, type ProjectDataDraft } from '$domain/data';
	import { KEY_BADGE, fieldKeyOf, layoutMap, relationEdges } from '$ui/data/board/data-map';

	/**
	 * The data map, read only: machines, the databases on them and their
	 * tables with keys and relations, laid out by the same layout as the Data
	 * map tab and drawn the way the design draws it. The canvas is fitted to
	 * the width of its card; a map too wide to read at a third of its size
	 * scrolls instead of shrinking further.
	 */
	interface Props {
		data: ProjectDataDraft;
	}
	let { data }: Props = $props();

	const layout = $derived(
		layoutMap(data, new Set(data.entities.map((e) => e.id)), { keepEmpty: false, keysOnly: false, groupBy: 'location' })
	);
	const edges = $derived(relationEdges(data, layout));
	const fieldById = $derived(new Map(data.fields.map((f) => [f.id, f])));
	const entityName = $derived(new Map(data.entities.map((e) => [e.id, e.name.trim() || 'Untitled table'])));
	const typeLabel = (code: string) => FIELD_TYPES.find((t) => t.code === code)?.label ?? code;
	const hostKind = (code: string | null) => (code ? (HOST_KINDS.find((k) => k.code === code)?.label ?? code) : '');
	const engine = (code: string | null) => (code ? (DB_ENGINES.find((k) => k.code === code)?.label ?? code) : '');

	let width = $state(0);
	const zoom = $derived(width > 0 ? Math.min(1, Math.max(0.3, (width - 32) / Math.max(1, layout.width))) : 1);

	const KEY_LOOK: Record<string, string> = {
		PK: 'bg-orange-tint text-evo-orange',
		FK: 'bg-blue-tint text-evo-violet-ink',
		UK: 'bg-evo-blue-soft text-evo-blue',
		'': 'text-evo-faint-2'
	};
</script>

<div bind:clientWidth={width} class="overflow-auto rounded-xl bg-evo-canvas bg-[radial-gradient(var(--color-evo-canvas-dot)_1px,transparent_1px)] bg-size-[16px_16px] p-4">
	<div class="relative" style:zoom style:width="{layout.width}px" style:height="{layout.height}px">
		{#each layout.hosts as host (host.id)}
			<div class="absolute box-border rounded-2xl border-2 border-evo-green-line bg-white/35" style:left="{host.x}px" style:top="{host.y}px" style:width="{host.w}px" style:height="{host.h}px">
				<div class="absolute top-2.5 left-3.5 flex flex-wrap items-center gap-2">
					<span aria-hidden="true" class="flex size-5 items-center justify-center bg-evo-line text-[0.6875rem]">▦</span>
					{#if host.kind}<span class="font-evo-mono text-[0.6875rem] font-bold tracking-[0.08em] text-evo-green-stroke uppercase">{hostKind(host.kind)}</span>{/if}
					<span class="font-bold">{host.name}</span>
					{#if host.provider || host.region}<span class="text-xs text-evo-muted">{[host.provider, host.region].filter(Boolean).join(' · ')}</span>{/if}
				</div>
			</div>
			{#each host.databases as db (db.id)}
				<div class="absolute box-border rounded-xl border border-evo-journey-line bg-blue-tint/55" style:left="{db.x}px" style:top="{db.y}px" style:width="{db.w}px" style:height="{db.h}px">
					<div class="absolute top-2 left-2.5 flex items-center gap-1.5">
						<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#0047b3" stroke-width="2.4"><ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"></path></svg>
						<span class="font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-blue-ink uppercase">{db.name}</span>
						<span class="text-xs text-evo-muted">{[engine(db.engine), `${db.tables.length} ${db.tables.length === 1 ? 'table' : 'tables'}`].filter(Boolean).join(' · ')}</span>
					</div>
				</div>
			{/each}
		{/each}

		<svg aria-hidden="true" class="pointer-events-none absolute top-0 left-0" width={layout.width} height={layout.height} fill="none">
			<defs><marker id="spec-dm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#8a8a92"></path></marker></defs>
			{#each edges as edge (edge.id)}
				<path d={edge.d} stroke="#8a8a92" stroke-width="1.5" marker-end="url(#spec-dm-arrow)"></path>
			{/each}
		</svg>

		{#each [...layout.tables.values()] as table (table.id)}
			<div class="absolute overflow-hidden border border-evo-ink border-l-4 border-l-orange bg-white" style:left="{table.x}px" style:top="{table.y}px" style:width="{table.w}px">
				<div class="flex h-9 items-center gap-2 border-b border-evo-line px-3">
					<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#0047b3" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 10v10"></path></svg>
					<span class="truncate text-[0.9375rem] font-bold">{entityName.get(table.id)}</span>
					<span class="ml-auto text-xs text-evo-muted">{table.fieldIds.length}</span>
				</div>
				<div class="grid h-[22px] grid-cols-[56px_1fr_1fr] items-center bg-evo-sunken px-2.5 text-[0.625rem] font-semibold tracking-[0.06em] text-evo-muted">
					<span>KEY</span><span>FIELD</span><span>TYPE</span>
				</div>
				{#each table.fieldIds as fieldId (fieldId)}
					{@const field = fieldById.get(fieldId)}
					{#if field}
						{@const key = KEY_BADGE[fieldKeyOf(field)]}
						<div class="grid h-7 grid-cols-[56px_1fr_1fr] items-center border-t border-evo-chip px-2.5 text-xs">
							<span><span class="box-border inline-block min-w-[30px] px-1.5 py-0.5 text-center text-[0.625rem] font-bold {KEY_LOOK[key]}">{key || '-'}</span></span>
							<span class="truncate font-evo-mono text-evo-ink">{field.name}</span>
							{#if key === 'FK' && field.relationTargetEntityId}
								<span class="truncate bg-blue-tint px-1.5 py-0.5 font-evo-mono text-[0.6875rem] text-evo-violet-ink">→ {entityName.get(field.relationTargetEntityId) ?? 'Table'}</span>
							{:else}
								<span class="truncate px-1.5 py-0.5 font-evo-mono text-[0.6875rem] text-evo-muted">{typeLabel(field.type)}</span>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</div>
