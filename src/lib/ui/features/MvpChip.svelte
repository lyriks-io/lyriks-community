<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { MVP_TIERS, type MvpTier } from '$domain/features';

	interface Props {
		tier: MvpTier | null;
		onPick: (tier: MvpTier | null) => void;
	}
	let { tier, onPick }: Props = $props();

	// the mockup's MVP colours: Must=mint, Should=blue, Later=amber, Out=pink.
	const TONE: Record<MvpTier, string> = {
		must: 'bg-success-50 text-success-600',
		should: 'bg-info-50 text-info-600',
		later: 'bg-warning-50 text-warning-600',
		out: 'bg-danger-50 text-danger-600'
	};
	const DOT: Record<MvpTier, string> = {
		must: 'bg-success-500',
		should: 'bg-info-500',
		later: 'bg-warning-500',
		out: 'bg-danger-500'
	};
	const labelOf = (t: MvpTier | null) =>
		t ? (MVP_TIERS.find((x) => x.code === t)?.label ?? t) : 'Unassigned';

	let open = $state(false);
	let root = $state<HTMLElement>();
	function onWindow(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
	function pick(t: MvpTier | null) {
		onPick(t);
		open = false;
	}
</script>

<svelte:window onclick={onWindow} />

<div bind:this={root} class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		title="Click to change the MVP bucket"
		class="inline-flex h-5.5 items-center gap-1 rounded border border-transparent px-2 text-[10px] font-bold uppercase tracking-wider transition hover:border-line-strong {tier
			? TONE[tier]
			: 'bg-surface-sunken text-ink-500'}"
	>
		{labelOf(tier)}
		<span class="text-ink-400">▾</span>
	</button>
	{#if open}
		<div
			class="absolute left-0 top-full z-50 mt-1 min-w-40 rounded-lg border border-line bg-surface py-1 shadow-xl"
		>
			{#each MVP_TIERS as o (o.code)}
				<button
					type="button"
					onclick={() => pick(o.code as MvpTier)}
					class="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] hover:bg-surface-sunken {tier ===
					o.code
						? 'bg-surface-sunken'
						: ''}"
				>
					<span class="inline-flex items-center gap-1.5 text-ink-700">
						<span class="size-2 rounded-full {DOT[o.code as MvpTier]}"></span>{o.label}
					</span>
					{#if tier === o.code}<Icon name="check" size={12} />{/if}
				</button>
			{/each}
			<div class="mt-1 border-t border-line pt-1">
				<button
					type="button"
					onclick={() => pick(null)}
					class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-ink-500 hover:bg-surface-sunken"
				>
					<span class="size-2 rounded-full bg-ink-300"></span> Unassigned
				</button>
			</div>
		</div>
	{/if}
</div>
