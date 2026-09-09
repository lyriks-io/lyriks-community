<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { Sprint } from '$domain/features';

	interface Props {
		sprintId: string | null;
		sprints: Sprint[];
		onPick: (sprintId: string | null) => void;
	}
	let { sprintId, sprints, onPick }: Props = $props();

	const current = $derived(sprints.find((s) => s.id === sprintId) ?? null);
	// Archived sprints left the pickers; the current one stays resolvable so an
	// item parked in an archived sprint still shows (and can leave) its bucket.
	const options = $derived(sprints.filter((s) => !s.archivedAt || s.id === sprintId));

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

<div bind:this={root} class="relative shrink-0">
	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			open = !open;
		}}
		title="Assign to a sprint"
		class="inline-flex h-5.5 items-center gap-1 rounded border border-transparent px-2 text-[10px] font-medium transition hover:border-line-strong {current
			? 'bg-info-50 text-info-600'
			: 'bg-surface-sunken text-ink-500'}"
	>
		<Icon name="calendar" size={10} />
		{current ? current.name || 'Sprint' : 'No sprint'}
		<span class="text-ink-400">▾</span>
	</button>
	{#if open}
		<div
			class="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-lg border border-line bg-surface py-1 shadow-xl"
			role="menu"
		>
			{#each options as s (s.id)}
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						pick(s.id);
					}}
					class="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] hover:bg-surface-sunken {sprintId ===
					s.id
						? 'bg-surface-sunken'
						: ''}"
				>
					<span class="inline-flex items-center gap-1.5 text-ink-700">
						<span class="size-2 rounded-full bg-info-500"></span>
						<span class="font-semibold">{s.name || 'Untitled sprint'}</span>
					</span>
					{#if sprintId === s.id}<Icon name="check" size={12} />{/if}
				</button>
			{/each}
			{#if options.length === 0}
				<p class="px-2.5 py-1.5 text-[11px] italic text-ink-400">
					No sprints yet. Add one in the Roadmap tab.
				</p>
			{/if}
			{#if sprintId}
				<div class="mt-1 border-t border-line pt-1">
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							pick(null);
						}}
						class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-ink-500 hover:bg-surface-sunken"
					>
						<span class="size-2 rounded-full bg-ink-300"></span> No sprint
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
