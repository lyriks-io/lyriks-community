<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { DB_ENGINES, HOST_KINDS, fieldsOfEntity, type Protocol } from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';
	import { ENGINE_HEX, HOST_TYPE_HEX, HOST_TYPE_GLYPH, PROTOCOL_HEX } from '../infra-style';
	import SchemaPanel from '../sections/SchemaPanel.svelte';
	import type { Selection } from './selection';

	interface Props {
		store: DataStore;
		entityId: string;
		onSelect: (sel: Selection) => void;
	}
	let { store, entityId, onSelect }: Props = $props();

	const entity = $derived(store.draft.entities.find((e) => e.id === entityId));
	const database = $derived(
		entity?.databaseId ? store.draft.databases.find((d) => d.id === entity.databaseId) : null
	);
	const host = $derived(database ? store.draft.hosts.find((h) => h.id === database.hostId) : null);

	const engineLabel = (code: string) => DB_ENGINES.find((e) => e.code === code)?.label ?? code;
	const kindLabel = (code: string) => HOST_KINDS.find((k) => k.code === code)?.label ?? code;

	// APIs touching this table — interfaces whose endpoint name matches the table.
	const apis = $derived.by(() => {
		const name = entity?.name.trim();
		if (!name) return [];
		return store.draft.interfaces
			.filter((i) => i.fromBrick.trim() === name || i.toBrick.trim() === name)
			.map((i) => ({
				id: i.id,
				protocol: i.protocol as Protocol,
				operation: i.operation,
				dir: i.toBrick.trim() === name ? ('in' as const) : ('out' as const),
				other: (i.toBrick.trim() === name ? i.fromBrick : i.toBrick) || '-'
			}));
	});

	// Relations for the "many-to-one / one-to-many" read at a glance.
	const outgoing = $derived.by(() => {
		if (!entity) return [];
		return fieldsOfEntity(store.draft, entity.id)
			.filter((f) => f.type === 'relation' && f.relationTargetEntityId)
			.map((f) => ({
				id: f.id,
				label: f.name || 'relation',
				target: store.draft.entities.find((e) => e.id === f.relationTargetEntityId)?.name || 'table',
				targetId: f.relationTargetEntityId!,
				card: f.isList ? 'has many' : f.isRequired ? 'has one' : 'has 0..1'
			}));
	});
	const incoming = $derived.by(() => {
		if (!entity) return [];
		return store.draft.fields
			.filter((f) => f.type === 'relation' && f.relationTargetEntityId === entity.id)
			.map((f) => ({
				id: f.id,
				source: store.draft.entities.find((e) => e.id === f.entityId)?.name || 'table',
				sourceId: f.entityId,
				card: f.isList ? 'many' : 'one'
			}));
	});
</script>

{#if entity}
	<div class="space-y-4">
		<!-- storage / host / api chain — "where does this data live, who reads it" -->
		<div class="space-y-2 rounded-card border border-line bg-surface-sunken/40 p-3">
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Where it lives</p>

			<!-- stored in -->
			<div class="flex items-center gap-2 text-xs">
				<Icon name="database" size={13} class="shrink-0 text-ink-400" />
				<span class="text-ink-400">Stored in</span>
				{#if database}
					<span class="flex items-center gap-1 font-medium text-ink-800">
						<span class="size-2 rounded-sm" style="background:{ENGINE_HEX[database.engine]}"></span>
						{database.name || 'db'}
						<span class="text-ink-400">· {engineLabel(database.engine)}</span>
					</span>
				{:else}
					<span class="font-medium text-danger-500">not placed - pick a database below</span>
				{/if}
			</div>

			<!-- hosted on -->
			<div class="flex items-center gap-2 text-xs">
				<Icon name="server" size={13} class="shrink-0 text-ink-400" />
				<span class="text-ink-400">Hosted on</span>
				{#if host}
					<button
						type="button"
						onclick={() => onSelect({ kind: 'host', id: host.id })}
						class="flex items-center gap-1 font-medium text-ink-800 hover:text-brand-600"
					>
						<span style="color:{HOST_TYPE_HEX[host.kind]}">{HOST_TYPE_GLYPH[host.kind]}</span>
						{host.name || 'host'}
						<span class="text-ink-400">
							· {kindLabel(host.kind)}{host.kind === 'onprem'
								? ' · customer site'
								: host.provider
									? ` · ${host.provider}${host.region ? ' / ' + host.region : ''}`
									: ''}
						</span>
						<Icon name="arrow-right" size={11} class="text-ink-300" />
					</button>
				{:else}
					<span class="text-ink-400">-</span>
				{/if}
			</div>

			<!-- accessed by -->
			<div class="flex items-start gap-2 text-xs">
				<Icon name="grid" size={13} class="mt-0.5 shrink-0 text-ink-400" />
				<span class="mt-0.5 text-ink-400">Accessed by</span>
				<div class="min-w-0 flex-1">
					{#if apis.length === 0}
						<span class="text-ink-400">no interface references this table yet</span>
					{:else}
						<ul class="space-y-1">
							{#each apis as api (api.id)}
								<li>
									<button
										type="button"
										onclick={() => onSelect({ kind: 'interface', id: api.id })}
										class="flex w-full items-center gap-1.5 text-left hover:text-brand-600"
									>
										<span
											class="rounded px-1 py-0.5 text-[9px] font-bold uppercase"
											style="background:{PROTOCOL_HEX[api.protocol]}1a;color:{PROTOCOL_HEX[api.protocol]}"
											>{api.protocol}</span
										>
										<span class="text-ink-400">{api.dir === 'in' ? '←' : '→'}</span>
										<span class="truncate font-medium text-ink-700">{api.other}</span>
										{#if api.operation}
											<span class="truncate font-mono text-[10px] text-ink-400">{api.operation}</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>

		<!-- relations at a glance -->
		{#if outgoing.length > 0 || incoming.length > 0}
			<div class="space-y-1.5">
				<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Relations</p>
				{#each outgoing as r (r.id)}
					<button
						type="button"
						onclick={() => onSelect({ kind: 'table', id: r.targetId })}
						class="flex w-full items-center gap-1.5 rounded-field border border-line bg-surface px-2 py-1 text-left text-[11px] hover:border-brand-300"
					>
						<span class="font-medium text-ink-800">{entity.name || 'this'}</span>
						<span class="rounded-pill bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold text-brand-600"
							>{r.card}</span
						>
						<span class="truncate font-medium text-ink-700">{r.target}</span>
						<span class="ml-auto text-[10px] text-ink-400">{r.label}</span>
					</button>
				{/each}
				{#each incoming as r (r.id)}
					<button
						type="button"
						onclick={() => onSelect({ kind: 'table', id: r.sourceId })}
						class="flex w-full items-center gap-1.5 rounded-field border border-line bg-surface px-2 py-1 text-left text-[11px] hover:border-brand-300"
					>
						<span class="truncate font-medium text-ink-700">{r.source}</span>
						<span class="rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold text-ink-500"
							>{r.card} →</span
						>
						<span class="font-medium text-ink-800">{entity.name || 'this'}</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- the field/schema editor -->
		<SchemaPanel {store} {entityId} />
	</div>
{/if}
