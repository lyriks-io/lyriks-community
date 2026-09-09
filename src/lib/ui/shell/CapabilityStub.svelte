<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { capabilityById } from './capabilities';
	import { tierLabel } from '$domain/tier/tier';

	interface Props {
		id: string;
	}
	let { id }: Props = $props();
	const cap = $derived(capabilityById(id));
</script>

<svelte:head>
	<title>{cap?.title ?? 'Capability'} · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
		<header class="mb-7">
			<p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
				{cap?.title ?? id}
			</p>
			<h1 class="mt-1 text-3xl font-bold tracking-tight text-ink-900">{cap?.subtitle ?? ''}</h1>
		</header>

		<div
			class="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center"
		>
			<span class="grid size-12 place-items-center rounded-full bg-surface-sunken text-brand-500">
				<Icon name={cap?.icon ?? 'sparkles'} size={22} />
			</span>
			<p class="text-base font-semibold text-ink-800">Capability scaffolded</p>
			<p class="max-w-md text-sm text-ink-500">
				This screen is part of the reshaped capability model and is being built out. Its behavior
				is already specified in the behavior editor; the in-app view lands in a follow-up
				iteration.
			</p>
			{#if cap && cap.tier !== 'oss'}
				<span
					class="mt-1 rounded-pill bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-600"
					>{tierLabel(cap.tier)} capability</span
				>
			{/if}
		</div>
	</div>
</div>
