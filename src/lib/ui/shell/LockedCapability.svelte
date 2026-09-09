<script lang="ts">
	import { Icon, Button } from '$ui/design-system';
	import { tierLabel, type Tier } from '$domain/tier/tier';
	import type { Capability } from './capabilities';

	interface Props {
		capability: Capability;
		currentTier: Tier;
	}
	let { capability, currentTier }: Props = $props();
</script>

<svelte:head>
	<title>{capability.title} · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="mx-auto w-full max-w-2xl px-6 py-16 sm:px-8">
		<div
			class="flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-8 py-14 text-center shadow-card"
		>
			<span class="grid size-14 place-items-center rounded-2xl bg-brand-gradient text-white">
				<Icon name={capability.icon} size={26} />
			</span>
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
					{tierLabel(capability.tier)} capability
				</p>
				<h1 class="mt-1 text-2xl font-bold tracking-tight text-ink-900">{capability.title}</h1>
			</div>
			<p class="max-w-md text-sm text-ink-500">
				{capability.subtitle}. This capability is available on the
				<span class="font-semibold text-ink-700">{tierLabel(capability.tier)}</span> tier. Your
				workspace is on <span class="font-semibold text-ink-700">{tierLabel(currentTier)}</span>.
			</p>
			<Button size="md">Upgrade to {tierLabel(capability.tier)}</Button>
		</div>
	</div>
</div>
