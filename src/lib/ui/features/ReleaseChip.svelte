<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { Release } from '$domain/features';

	interface Props {
		releaseId: string | null;
		releases: Release[];
		onPick: (releaseId: string | null) => void;
	}
	let { releaseId, releases, onPick }: Props = $props();

	const current = $derived(releases.find((r) => r.id === releaseId) ?? null);

	let open = $state(false);
	let root = $state<HTMLElement>();
	function onWindow(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
	function pick(id: string | null) {
		onPick(id);
		open = false;
	}
</script>

<svelte:window onclick={onWindow} />

<div bind:this={root} class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		title="Click to assign to a release"
		class="inline-flex h-5.5 items-center gap-1 rounded border border-transparent px-2 text-[10px] font-bold uppercase tracking-wider transition hover:border-line-strong {current
			? 'bg-brand-50 text-brand-600'
			: 'bg-surface-sunken text-ink-500'}"
	>
		<Icon name="gauge" size={11} />
		{current ? current.version || current.name : 'Unscheduled'}
		<span class="text-ink-400">▾</span>
	</button>
	{#if open}
		<div
			class="absolute left-0 top-full z-50 mt-1 min-w-52 rounded-lg border border-line bg-surface py-1 shadow-xl"
		>
			{#each releases as r (r.id)}
				<button
					type="button"
					onclick={() => pick(r.id)}
					class="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] hover:bg-surface-sunken {releaseId ===
					r.id
						? 'bg-surface-sunken'
						: ''}"
				>
					<span class="inline-flex items-center gap-1.5 text-ink-700">
						<span class="size-2 rounded-full bg-brand-500"></span>
						<span class="font-semibold">{r.version}</span>
						<span class="text-ink-400">· {r.name || 'Untitled'}</span>
					</span>
					{#if releaseId === r.id}<Icon name="check" size={12} />{/if}
				</button>
			{/each}
			{#if releases.length === 0}
				<p class="px-2.5 py-1.5 text-[11px] italic text-ink-400">No releases yet - add one in Roadmap.</p>
			{/if}
			<div class="mt-1 border-t border-line pt-1">
				<button
					type="button"
					onclick={() => pick(null)}
					class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-ink-500 hover:bg-surface-sunken"
				>
					<span class="size-2 rounded-full bg-ink-300"></span> Unscheduled
				</button>
			</div>
		</div>
	{/if}
</div>
