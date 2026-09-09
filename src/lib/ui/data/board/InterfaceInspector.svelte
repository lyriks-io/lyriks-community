<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { PROTOCOLS, type Protocol } from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';
	import { PROTOCOL_HEX } from '../infra-style';
	import { endpointNames, interfaceResolves, type Selection } from './selection';

	interface Props {
		store: DataStore;
		interfaceId: string;
		onSelect: (sel: Selection) => void;
	}
	let { store, interfaceId, onSelect }: Props = $props();

	const iface = $derived(store.draft.interfaces.find((i) => i.id === interfaceId));
	// Endpoints are the real hosts and tables the map can resolve — pick from these
	// and the connector is guaranteed to draw (no more dead free-text links).
	const endpoints = $derived(endpointNames(store));
	const resolves = $derived(iface ? interfaceResolves(store, iface.fromBrick, iface.toBrick) : false);

	function remove() {
		store.removeInterface(interfaceId);
		onSelect({ kind: 'none' });
	}
</script>

{#if iface}
	{@const hex = PROTOCOL_HEX[iface.protocol]}
	<div class="space-y-4">
		<div class="flex items-start gap-2">
			<span
				class="grid size-9 shrink-0 place-items-center rounded-lg"
				style="background:{hex}1a;color:{hex}"><Icon name="grid" size={16} /></span
			>
			<div class="min-w-0 flex-1">
				<p class="text-base font-bold text-ink-900">Interface</p>
				<p class="text-[11px] text-ink-400">How two bricks talk.</p>
			</div>
			<button
				type="button"
				onclick={remove}
				title="Delete interface"
				class="mt-1 text-ink-300 hover:text-danger-500"><Icon name="x" size={16} /></button
			>
		</div>

		<label class="block">
			<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400"
				>Protocol</span
			>
			<select
				value={iface.protocol}
				onchange={(e) => store.updateInterface(iface.id, 'protocol', e.currentTarget.value as Protocol)}
				class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-brand-600"
			>
				{#each PROTOCOLS as p (p.code)}
					<option value={p.code}>{p.label}</option>
				{/each}
			</select>
		</label>

		<div class="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
			<label class="block">
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400"
					>From</span
				>
				<select
					value={endpoints.includes(iface.fromBrick.trim()) ? iface.fromBrick.trim() : ''}
					onchange={(e) => store.updateInterface(iface.id, 'fromBrick', e.currentTarget.value)}
					class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs {endpoints.includes(
						iface.fromBrick.trim()
					)
						? 'text-ink-700'
						: 'text-danger-500'}"
				>
					<option value="">- pick a brick -</option>
					{#each endpoints as name (name)}
						<option value={name}>{name}</option>
					{/each}
				</select>
			</label>
			<Icon name="arrow-right" size={16} class="mb-2 text-ink-300" />
			<label class="block">
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400"
					>To</span
				>
				<select
					value={endpoints.includes(iface.toBrick.trim()) ? iface.toBrick.trim() : ''}
					onchange={(e) => store.updateInterface(iface.id, 'toBrick', e.currentTarget.value)}
					class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs {endpoints.includes(
						iface.toBrick.trim()
					)
						? 'text-ink-700'
						: 'text-danger-500'}"
				>
					<option value="">- pick a brick -</option>
					{#each endpoints as name (name)}
						<option value={name}>{name}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if !resolves}
			<p class="flex items-start gap-1.5 rounded-field border border-warning-300 bg-warning-50/50 px-2 py-1.5 text-[11px] text-warning-700">
				<Icon name="info" size={13} class="mt-px shrink-0" />
				Pick a real host or table on both ends so this link draws on the map.
			</p>
		{/if}

		<label class="block">
			<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400"
				>Operation</span
			>
			<input
				value={iface.operation}
				oninput={(e) => store.updateInterface(iface.id, 'operation', e.currentTarget.value)}
				placeholder="GET /resource"
				class="w-full rounded-field border border-line bg-surface px-2 py-1.5 font-mono text-xs text-ink-600 outline-none"
			/>
		</label>

		<textarea
			value={iface.description}
			oninput={(e) => store.updateInterface(iface.id, 'description', e.currentTarget.value)}
			placeholder="What flows across this interface, and when."
			rows="2"
			class="w-full resize-none rounded-field border border-line bg-surface px-2 py-1.5 text-[11px] text-ink-600 outline-none placeholder:text-ink-300"
		></textarea>
	</div>
{/if}
