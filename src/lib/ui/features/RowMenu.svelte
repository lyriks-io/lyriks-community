<script lang="ts">
	import { Icon, clickedWithin, floatInView, type IconName } from '$ui/design-system';
	import type { Collaborator } from '$domain/team';
	import { colorTokens, initials } from '$ui/team/team-style';
	import { untrack } from 'svelte';
	import { oneMenu } from './one-menu.svelte';

	/**
	 * The one control a feature-tree row shows: a More button whose menu holds
	 * everything that is not vital on the row, in titled sections split by
	 * rules, each action with its icon. What the row already carries stays
	 * visible beside the button as a mark (the flag while queued, the
	 * assignee's initials while assigned), never as a second control.
	 */
	interface Props {
		/** What the row is, for the button's accessible name ("Feature actions"). */
		label: string;
		onDetails?: () => void;
		/** A feature's own: rename it (a click on its name opens its details). */
		onRename?: () => void;
		/** A feature's own: name a new action in it. */
		onAddAction?: () => void;
		/** A feature's own: open its behavior figures. */
		onStats?: () => void;
		/** A feature's own: show every rule it holds, or fold them back. */
		rules?: { count: number; shown: boolean; onToggle: () => void } | null;
		/** A feature's own: write a Given / When / Then acceptance criterion on it. */
		onAddCase?: () => void;
		queued?: boolean;
		/** The work queue toggle; a row without it (a feature) offers no queue. */
		onToggleQueue?: () => void;
		assigneeId?: string | null;
		collaborators?: Collaborator[];
		onAssign?: (collaboratorId: string | null) => void;
		/** Contributors of the row; offered only to a team of more than one. */
		contributors?: { selectedIds: readonly string[]; onToggle: (id: string) => void } | null;
		/** A core's own actions: add under it, and delete it once empty. */
		core?: {
			onAddFeature: () => void;
			onAddFamily: () => void;
			onDelete: () => void;
			canDelete: boolean;
		} | null;
		/** A feature's own delete, locked while it still holds actions (bottom up). */
		feature?: { onDelete: () => void; canDelete: boolean } | null;
		/** An action's own delete, the only thing an action's menu holds. */
		onDeleteAction?: () => void;
	}
	let {
		label,
		onDetails,
		onRename,
		onAddAction,
		onStats,
		rules = null,
		onAddCase,
		queued = false,
		onToggleQueue,
		assigneeId = null,
		collaborators = [],
		onAssign,
		contributors = null,
		core = null,
		feature = null,
		onDeleteAction
	}: Props = $props();

	const assignee = $derived(collaborators.find((c) => c.id === assigneeId) ?? null);
	const nameOf = (c: Collaborator) => c.name || c.email;
	const showContributors = $derived(!!contributors && collaborators.length > 1);

	let open = $state(false);
	let root = $state<HTMLElement>();
	let panel = $state<HTMLElement>();
	// One menu open at a time: opening this one closes whichever else is open.
	const menuId = Symbol("row menu");
	$effect(() => {
		if (open) untrack(() => oneMenu.claim(menuId));
	});
	$effect(() => {
		const owner = oneMenu.owner;
		if (owner !== null && owner !== menuId) untrack(() => (open = false));
	});
	function onWindowClick(e: MouseEvent) {
		if (open && !clickedWithin(e.target, root, panel)) open = false;
	}
	function onWindowKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}
	/** Runs an action and closes the menu, except for a toggle the reader may repeat. */
	function act(run: () => void, keepOpen = false) {
		run();
		if (!keepOpen) open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

{#snippet sectionTitle(text: string)}
	<p class="px-3 pb-1 pt-2 text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
		{text}
	</p>
{/snippet}

{#snippet item(icon: IconName, text: string, run: () => void, opts: { tone?: string; checked?: boolean; keepOpen?: boolean } = {})}
	<button
		type="button"
		role="menuitem"
		onclick={(e) => {
			e.stopPropagation();
			act(run, opts.keepOpen);
		}}
		class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-sunken {opts.tone ??
			'text-ink-700'}"
	>
		<Icon name={icon} size={13} class="shrink-0 {opts.tone ? '' : 'text-ink-400'}" />
		<span class="min-w-0 flex-1 truncate">{text}</span>
		{#if opts.checked}
			<Icon name="check" size={12} class="shrink-0 text-brand-500" />
		{/if}
	</button>
{/snippet}

<div bind:this={root} class="relative flex shrink-0 items-center gap-1.5">
	{#if queued}
		<span class="grid size-5 place-items-center text-brand-500" title="In the work queue">
			<Icon name="flag" size={12} />
		</span>
	{/if}
	{#if assignee}
		<span
			class="grid size-5 place-items-center text-[0.5625rem] font-bold text-white"
			style="background:{colorTokens(assignee.color).solid}"
			title="Assigned to {nameOf(assignee)}"
		>
			{initials(nameOf(assignee))}
		</span>
	{/if}

	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			open = !open;
		}}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label={label}
		title="More"
		class="grid size-6 cursor-pointer place-items-center rounded-md transition-colors {open
			? 'bg-surface-sunken text-ink-800'
			: 'text-ink-400 hover:bg-surface-sunken hover:text-ink-700'}"
	>
		<Icon name="ellipsis" size={14} />
	</button>

	<!-- Opens whole, inside the window, whatever box holds the row (criterion 5651ca29). -->
	{#if open}
		<div
			bind:this={panel}
			use:floatInView={{ anchor: root, align: 'right' }}
			role="menu"
			aria-label={label}
			class="w-56 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-xl"
		>
			{#if onDetails || onRename || onAddAction || onStats || rules || onAddCase || core}
				<div class="py-1">
					{#if onDetails}
						{@render item('eye', 'Open details', onDetails)}
					{/if}
					{#if onRename}
						{@render item('pencil', 'Rename', onRename)}
					{/if}
					{#if onAddAction}
						{@render item('plus', 'Add an action', onAddAction)}
					{/if}
					{#if onStats}
						{@render item('chart', 'Statistics', onStats)}
					{/if}
					{#if rules}
						{@render item(
							'list',
							rules.shown ? 'Hide all rules' : `Show all ${rules.count} rule${rules.count === 1 ? '' : 's'}`,
							rules.onToggle
						)}
					{/if}
					{#if onAddCase}
						{@render item('check', 'Add an acceptance criterion', onAddCase)}
					{/if}
					{#if core}
						{@render item('plus', 'Add feature', core.onAddFeature)}
						{@render item('layers', 'Add family', core.onAddFamily)}
					{/if}
				</div>
			{/if}

			{#if onToggleQueue}
				<div class="pb-1">
					{@render sectionTitle('Work')}
					{@render item('flag', queued ? 'Remove from the work queue' : 'Add to the work queue', onToggleQueue)}
				</div>
			{/if}

			{#if onAssign && collaborators.length > 0}
				<div class="pb-1">
					{@render sectionTitle('Assign to')}
					{#each collaborators as person (person.id)}
						{@render item('user', nameOf(person), () => onAssign(person.id), {
							checked: person.id === assigneeId
						})}
					{/each}
					{#if assignee}
						{@render item('x', 'Unassign', () => onAssign(null))}
					{/if}
				</div>
			{/if}

			{#if showContributors && contributors}
				<div class="pb-1">
					{@render sectionTitle('Contributors')}
					{#each collaborators as person (person.id)}
						{@render item('users', nameOf(person), () => contributors.onToggle(person.id), {
							checked: contributors.selectedIds.includes(person.id),
							keepOpen: true
						})}
					{/each}
				</div>
			{/if}

			{#if onDeleteAction}
				<div class="py-1">
					{@render item('x', 'Delete this action', onDeleteAction, { tone: 'text-danger-600' })}
				</div>
			{/if}

			{#if feature}
				<div class="py-1">
					{#if feature.canDelete}
						{@render item('x', 'Delete this feature', feature.onDelete, { tone: 'text-danger-600' })}
					{:else}
						<p class="flex items-center gap-2.5 px-3 py-1.5 text-xs text-ink-400" title="Delete its actions first">
							<Icon name="lock" size={13} class="shrink-0" />
							Delete locked: delete its actions first
						</p>
					{/if}
				</div>
			{/if}

			{#if core}
				<div class="py-1">
					{#if core.canDelete}
						{@render item('x', 'Delete this core', core.onDelete, { tone: 'text-danger-600' })}
					{:else}
						<p class="flex items-center gap-2.5 px-3 py-1.5 text-xs text-ink-400" title="Empty it first">
							<Icon name="lock" size={13} class="shrink-0" />
							Delete locked: the core is not empty
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
