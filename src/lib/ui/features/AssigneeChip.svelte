<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { Collaborator } from '$domain/team/team';
	import { colorTokens, initials } from '$ui/team/team-style';

	interface Props {
		assigneeId: string | null;
		collaborators: Collaborator[];
		onPick: (collaboratorId: string | null) => void;
		/** Compact avatar-only trigger (feature-tree rows) vs. a labelled chip. */
		compact?: boolean;
	}
	let { assigneeId, collaborators, onPick, compact = false }: Props = $props();

	const current = $derived(collaborators.find((c) => c.id === assigneeId) ?? null);

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
		aria-label={current ? `Assigned to ${current.name || current.email}` : 'Assign to a member'}
		title={current ? current.name || current.email : 'Unassigned (click to assign)'}
		class={compact
			? 'grid size-6 place-items-center rounded-full text-[9px] font-bold text-white'
			: 'inline-flex h-6 items-center gap-1.5 rounded-full border border-line pl-0.5 pr-2 text-[11px] font-medium text-ink-700 transition hover:border-line-strong'}
		style={compact && current ? `background:${colorTokens(current.color).solid}` : ''}
	>
		{#if current}
			<span
				class="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
				style="background:{colorTokens(current.color).solid}"
			>
				{initials(current.name || current.email)}
			</span>
			{#if !compact}<span class="max-w-24 truncate">{current.name || current.email}</span>{/if}
		{:else if compact}
			<span
				class="grid size-6 place-items-center rounded-full border border-dashed border-line text-ink-300 hover:text-brand-500"
			>
				<Icon name="plus" size={11} />
			</span>
		{:else}
			<span class="grid size-5 place-items-center rounded-full border border-dashed border-line text-ink-300">
				<Icon name="plus" size={11} />
			</span>
			<span class="text-ink-400">Assign</span>
		{/if}
	</button>

	{#if open}
		<div
			class="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-lg border border-line bg-surface py-1 shadow-xl"
			role="menu"
		>
			{#if collaborators.length === 0}
				<p class="px-3 py-1.5 text-[11px] text-ink-400">
					No team member yet. Invite one from the Team panel.
				</p>
			{:else}
				{#each collaborators as member (member.id)}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							pick(member.id);
						}}
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-sunken {member.id ===
						assigneeId
							? 'text-brand-600'
							: 'text-ink-700'}"
					>
						<span
							class="grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
							style="background:{colorTokens(member.color).solid}"
						>
							{initials(member.name || member.email)}
						</span>
						<span class="min-w-0 flex-1 truncate">{member.name || member.email}</span>
						{#if member.id === assigneeId}<Icon name="check" size={12} />{/if}
					</button>
				{/each}
				{#if assigneeId}
					<div class="my-1 border-t border-line"></div>
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							pick(null);
						}}
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-500 hover:bg-surface-sunken"
					>
						<Icon name="x" size={12} /> Unassign
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>
