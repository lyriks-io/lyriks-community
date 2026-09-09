<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { Collaborator } from '$domain/team/team';
	import { colorTokens, disciplineLabel, initials, shortName } from '$ui/team/team-style';

	interface Props {
		/** Collaborator ids attached to this feature/action. */
		selectedIds: string[];
		/** The project team — the people who can contribute. */
		people: Collaborator[];
		/** Toggle one person in/out. */
		onToggle: (collaboratorId: string) => void;
		/** Compact trigger (feature-tree rows) vs. a labelled chip row. */
		compact?: boolean;
	}
	let { selectedIds, people, onToggle, compact = false }: Props = $props();

	const selected = $derived(people.filter((p) => selectedIds.includes(p.id)));

	let open = $state(false);
	let root = $state<HTMLElement>();
	function onWindow(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onclick={onWindow} />

{#snippet avatar(c: Collaborator, size: string)}
	<span
		class="grid shrink-0 place-items-center rounded-full font-bold text-white {size}"
		style="background:{colorTokens(c.color).solid}"
	>
		{initials(c.name || c.email)}
	</span>
{/snippet}

<div bind:this={root} class="relative shrink-0">
	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			open = !open;
		}}
		aria-label="Attach contributors"
		title={selected.length ? selected.map(shortName).join(', ') : 'No contributor yet (click to attach)'}
		class="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-line px-1 text-[11px] font-medium text-ink-700 transition hover:border-line-strong"
	>
		{#if selected.length === 0}
			<span class="grid size-4 place-items-center rounded-full border border-dashed border-line text-ink-300">
				<Icon name="plus" size={10} />
			</span>
			{#if !compact}<span class="pr-1 text-ink-400">Contributor</span>{/if}
		{:else if compact}
			<span class="flex -space-x-1.5">
				{#each selected.slice(0, 3) as c (c.id)}
					{@render avatar(c, 'size-5 text-[8px] ring-1 ring-surface')}
				{/each}
			</span>
			{#if selected.length > 3}
				<span class="pl-0.5 pr-0.5 text-[10px] font-semibold text-ink-400">+{selected.length - 3}</span>
			{/if}
		{:else}
			<span class="flex items-center gap-1 pr-1">
				{#each selected.slice(0, 2) as c (c.id)}
					<span class="inline-flex items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-0.5 pr-1.5">
						{@render avatar(c, 'size-4 text-[8px]')}
						<span class="text-[10px] font-semibold text-ink-700">{shortName(c)}</span>
					</span>
				{/each}
				{#if selected.length > 2}
					<span class="text-[10px] font-semibold text-ink-400">+{selected.length - 2}</span>
				{/if}
			</span>
		{/if}
		<Icon name="chevron-down" size={10} class="shrink-0 text-ink-300" />
	</button>

	{#if open}
		<div
			class="absolute right-0 top-full z-50 mt-1 max-h-72 min-w-56 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-xl"
			role="menu"
		>
			<p class="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-ink-400">
				Contributors
			</p>
			{#if people.length === 0}
				<p class="px-3 py-1.5 text-[11px] text-ink-400">
					No one on the team yet. Add people in Settings → Members.
				</p>
			{:else}
				{#each people as c (c.id)}
					{@const on = selectedIds.includes(c.id)}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							onToggle(c.id);
						}}
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-sunken"
					>
						<span
							class="grid size-3.5 shrink-0 place-items-center rounded border {on
								? 'border-brand-500 bg-brand-500 text-white'
								: 'border-line text-transparent'}"
						>
							<Icon name="check" size={10} />
						</span>
						{@render avatar(c, 'size-6 text-[9px]')}
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[12px] font-semibold text-ink-800">{shortName(c)}</span>
						</span>
						<span class="shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-500">
							{disciplineLabel(c)}
						</span>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
