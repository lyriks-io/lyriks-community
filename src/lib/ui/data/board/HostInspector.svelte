<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import {
		DB_ENGINES,
		HOST_KINDS,
		HOST_REGIONS,
		databasesOfHost,
		entitiesOfDatabase,
		fieldsOfEntity,
		type DbEngine,
		type HostKind
	} from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';
	import { HOST_TYPE_HEX, HOST_TYPE_GLYPH } from '../infra-style';
	import type { Selection } from './selection';

	interface Props {
		store: DataStore;
		hostId: string;
		onSelect: (sel: Selection) => void;
	}
	let { store, hostId, onSelect }: Props = $props();

	const host = $derived(store.draft.hosts.find((h) => h.id === hostId));
	const dbs = $derived(host ? databasesOfHost(store.draft, host.id) : []);
	const unplaced = $derived(store.draft.entities.filter((e) => e.databaseId === null));

	// The right-side controls per host kind. Onprem is the customer's site (no
	// provider/region); the others carry a vendor name, and only a self-hosted
	// cloud host actually picks a region — so switching kind visibly retargets the
	// inspector instead of showing the same two fields for cloud/saas/external.
	const KIND_FIELDS: Record<HostKind, { providerLabel: string; providerPlaceholder: string; region: boolean }> = {
		internal: { providerLabel: 'Location', providerPlaceholder: 'e.g. Datacenter', region: false },
		cloud: { providerLabel: 'Provider', providerPlaceholder: 'AWS', region: true },
		saas: { providerLabel: 'Vendor', providerPlaceholder: 'e.g. Stripe', region: false },
		external: { providerLabel: 'System', providerPlaceholder: 'e.g. Partner API', region: false },
		onprem: { providerLabel: '', providerPlaceholder: '', region: false }
	};

	function removeHost() {
		store.removeHost(hostId);
		onSelect({ kind: 'none' });
	}
</script>

{#if host}
	{@const hex = HOST_TYPE_HEX[host.kind]}
	{@const kf = KIND_FIELDS[host.kind]}
	<div class="space-y-4">
		<!-- identity -->
		<div class="flex items-start gap-2">
			<span
				class="grid size-9 shrink-0 place-items-center rounded-lg text-lg"
				style="background:{hex}1a;color:{hex}">{HOST_TYPE_GLYPH[host.kind]}</span
			>
			<input
				value={host.name}
				oninput={(e) => store.updateHost(host.id, 'name', e.currentTarget.value)}
				placeholder="Host name"
				class="min-w-0 flex-1 border-none bg-transparent text-base font-bold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
			/>
			<button
				type="button"
				onclick={removeHost}
				title="Delete host"
				class="mt-1 text-ink-300 hover:text-danger-500"><Icon name="x" size={16} /></button
			>
		</div>

		<!-- type / provider / region -->
		<div class="flex flex-wrap items-center gap-2 text-xs">
			<select
				value={host.kind}
				onchange={(e) => store.updateHost(host.id, 'kind', e.currentTarget.value as HostKind)}
				class="rounded-field border border-brand-300 bg-surface px-2 py-1 font-bold uppercase tracking-wide text-brand-600 outline-none"
			>
				{#each HOST_KINDS as k (k.code)}
					<option value={k.code}>{k.label}</option>
				{/each}
			</select>
			{#if host.kind === 'onprem'}
				<span class="text-ink-400">🏢 Customer site</span>
			{:else}
				<span class="text-[10px] font-medium uppercase tracking-wide text-ink-400">{kf.providerLabel}</span>
				<input
					value={host.provider}
					oninput={(e) => store.updateHost(host.id, 'provider', e.currentTarget.value)}
					placeholder={kf.providerPlaceholder}
					class="w-24 rounded-field border border-line bg-surface px-2 py-1 text-ink-700 outline-none placeholder:text-ink-300"
				/>
				{#if kf.region}
					<select
						value={host.region}
						onchange={(e) => store.updateHost(host.id, 'region', e.currentTarget.value)}
						class="rounded-field border border-line bg-surface px-2 py-1 text-ink-600 outline-none"
					>
						{#each HOST_REGIONS as reg (reg)}
							<option value={reg}>{reg}</option>
						{/each}
					</select>
				{/if}
			{/if}
		</div>

		<!-- databases: finally first-class -->
		<div>
			<div class="mb-1.5 flex items-center justify-between">
				<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
					Databases ({dbs.length})
				</p>
				<button
					type="button"
					onclick={() => store.addDatabase(host.id)}
					class="text-[11px] font-medium text-brand-600 hover:underline">+ database</button
				>
			</div>
			{#if dbs.length === 0}
				<p class="rounded-field border border-dashed border-line px-3 py-3 text-center text-[11px] text-ink-400">
					No database yet - add one to place tables here.
				</p>
			{:else}
				<ul class="space-y-1.5">
					{#each dbs as db (db.id)}
						{@const tableCount = entitiesOfDatabase(store.draft, db.id).length}
						<li class="flex items-center gap-1.5 rounded-field border border-line bg-surface-sunken/50 px-2 py-1.5">
							<Icon name="database" size={13} class="text-ink-400" />
							<input
								value={db.name}
								oninput={(e) => store.updateDatabase(db.id, 'name', e.currentTarget.value)}
								placeholder="Primary"
								class="min-w-0 flex-1 border-none bg-transparent text-xs font-semibold text-ink-800 outline-none placeholder:font-normal placeholder:text-ink-300"
							/>
							<select
								value={db.engine}
								onchange={(e) =>
									store.updateDatabase(db.id, 'engine', e.currentTarget.value as DbEngine)}
								class="rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-600"
							>
								{#each DB_ENGINES as eng (eng.code)}
									<option value={eng.code}>{eng.label}</option>
								{/each}
							</select>
							<span class="text-[10px] text-ink-400">{tableCount}t</span>
							<button
								type="button"
								onclick={() => store.removeDatabase(db.id)}
								title="Delete database"
								class="text-ink-300 hover:text-danger-500"><Icon name="x" size={12} /></button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- tables on this host -->
		<div>
			<div class="mb-1.5 flex items-center justify-between">
				<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Tables here</p>
				{#if unplaced.length > 0}
					<select
						value=""
						onchange={(e) => {
							if (e.currentTarget.value) store.attachEntityToHost(host.id, e.currentTarget.value);
							e.currentTarget.value = '';
						}}
						class="rounded-field border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-500"
						title="Attach an existing unplaced table"
					>
						<option value="">attach existing…</option>
						{#each unplaced as e (e.id)}
							<option value={e.id}>{e.name || 'Untitled'}</option>
						{/each}
					</select>
				{/if}
			</div>
			{#each dbs as db (db.id)}
				{#each entitiesOfDatabase(store.draft, db.id) as entity (entity.id)}
					<button
						type="button"
						onclick={() => onSelect({ kind: 'table', id: entity.id })}
						class="mb-1 flex w-full items-center gap-2 rounded-field border border-line bg-surface px-2 py-1.5 text-left hover:border-brand-300"
					>
						<Icon name="database" size={12} class="text-ink-400" />
						<span class="min-w-0 flex-1 truncate text-xs font-medium text-ink-800"
							>{entity.name || 'Untitled'}</span
						>
						<span class="text-[10px] text-ink-400">{fieldsOfEntity(store.draft, entity.id).length}f</span>
						<Icon name="arrow-right" size={12} class="text-ink-300" />
					</button>
				{/each}
			{/each}
			<Button variant="outline" size="sm" class="mt-1 w-full" onclick={() => {
				const id = store.createEntityOnHost(host.id);
				onSelect({ kind: 'table', id });
			}}>
				<Icon name="plus" size={13} /> Create table here
			</Button>
		</div>

		<textarea
			value={host.description}
			oninput={(e) => store.updateHost(host.id, 'description', e.currentTarget.value)}
			placeholder="Notes about this host (why it exists, tenancy, SLAs…)"
			rows="2"
			class="w-full resize-none rounded-field border border-line bg-surface px-2 py-1.5 text-[11px] text-ink-600 outline-none placeholder:text-ink-300"
		></textarea>
	</div>
{/if}
