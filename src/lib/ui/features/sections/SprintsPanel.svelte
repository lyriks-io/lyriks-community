<script lang="ts">
	import { Icon, SearchInput, confirmDialog, matchesQuery } from '$ui/design-system';
	import {
		activeSprints,
		archivedSprints,
		assignmentToTarget,
		sprintAllDone,
		sprintItems,
		sprintProgress,
		workItemLabel,
		workItemParentName,
		workItemStatus,
		type WorkAssignment,
		type WorkStatus
	} from '$domain/features';
	import type { FeatureActionIndex } from '$application/index-feature-actions';
	import type { IconName } from '$ui/design-system/Icon.svelte';
	import type { FeaturesStore } from '../draft-store.svelte';
	import SearchPicker, { type PickerOption } from '../SearchPicker.svelte';
	import { workItemCandidates } from '../work-item-candidates';

	interface Props {
		store: FeaturesStore;
		/** Authored actions per leaf (read-only, from the kernel): the third
		 *  altitude the "Add task" picker offers. */
		featureActions: FeatureActionIndex;
	}
	let { store, featureActions }: Props = $props();

	const sprints = $derived([...activeSprints(store.draft)].sort((a, b) => a.order - b.order));
	const archived = $derived([...archivedSprints(store.draft)].sort((a, b) => a.order - b.order));
	const sprintName = (id: string | null) =>
		(store.draft.sprints ?? []).find((s) => s.id === id)?.name || 'Untitled sprint';

	let showArchived = $state(false);

	/** Items parked in a sprint (any assignee), in queue order. */
	function itemsOf(sprintId: string): WorkAssignment[] {
		return sprintItems(store.draft, sprintId).sort((a, b) => a.order - b.order);
	}

	// Every core / leaf feature / action the project has, with where it sits now.
	const candidates = $derived(workItemCandidates(store.draft, featureActions));
	const candidateByKey = $derived(new Map(candidates.map((c) => [c.key, c])));

	const KIND_ICON: Record<WorkAssignment['kind'], IconName> = {
		core: 'grid',
		feature: 'bolt',
		action: 'chevron-right'
	};
	const KIND_LABEL: Record<WorkAssignment['kind'], string> = {
		core: 'Core',
		feature: 'Feature',
		action: 'Action'
	};
	const STATUS_META: Record<WorkStatus, { label: string; cls: string }> = {
		todo: { label: 'To do', cls: 'bg-surface-sunken text-ink-500' },
		'in-progress': { label: 'In progress', cls: 'bg-warning-50 text-warning-600' },
		done: { label: 'Done', cls: 'bg-success-50 text-success-600' }
	};

	/** What "Add task" offers for one sprint: everything not already in it. An
	 *  item sitting in another sprint is offered too (picking it moves it). */
	function optionsFor(sprintId: string): PickerOption[] {
		return candidates
			.filter((c) => c.sprintId !== sprintId)
			.map((c) => ({
				key: c.key,
				label: c.label,
				icon: KIND_ICON[c.kind],
				hint: [
					KIND_LABEL[c.kind],
					c.context ? `in ${c.context}` : null,
					c.sprintId ? `now in ${sprintName(c.sprintId)}` : c.queued ? 'in the queue' : null
				]
					.filter(Boolean)
					.join(' · ')
			}));
	}

	/** Put the picked item in the sprint (queuing it first when it was not). */
	function addToSprint(sprintId: string, key: string) {
		const c = candidateByKey.get(key);
		if (!c) return;
		store.setWorkItemSprint(c.target, sprintId);
		store.notifier.notify('info', `"${c.label}" added to ${sprintName(sprintId)}.`);
	}

	/** Take an item out of its sprint; it stays in the queue, just un-sprinted. */
	function removeFromSprint(a: WorkAssignment) {
		const target = assignmentToTarget(a);
		if (target) store.setWorkItemSprint(target, null);
	}

	async function remove(sprintId: string) {
		const n = itemsOf(sprintId).length;
		const ok =
			n === 0 ||
			(await confirmDialog({
				title: `Remove sprint "${sprintName(sprintId)}"?`,
				message: `Its ${n} task${n === 1 ? ' stays' : 's stay'} in the work queue, just without a sprint. Nothing is deleted.`,
				confirmLabel: 'Remove sprint',
				danger: true
			}));
		if (ok) store.removeSprint(sprintId);
	}

	const resolveActionName = (featureId: string, actionId: string) =>
		featureActions[featureId]?.find((a) => a.id === actionId)?.name;

	/* Search across sprints and their tasks. A sprint whose NAME matches keeps
	   all its tasks; otherwise it survives only through the tasks that match,
	   and shows just those, so "checkout" answers "which sprint ships checkout?"
	   in one look. */
	let search = $state('');
	const searching = $derived(search.trim().length > 0);
	const taskMatches = (item: WorkAssignment): boolean =>
		matchesQuery(
			search,
			workItemLabel(store.draft, item, resolveActionName),
			workItemParentName(store.draft, item),
			KIND_LABEL[item.kind]
		);
	/** The tasks of a sprint to render: all of them, or just the hits. */
	function visibleItems(sprint: { id: string; name: string }): WorkAssignment[] {
		const items = itemsOf(sprint.id);
		if (!searching || matchesQuery(search, sprint.name)) return items;
		return items.filter(taskMatches);
	}
	const visibleSprints = $derived(
		searching
			? sprints.filter((s) => matchesQuery(search, s.name) || itemsOf(s.id).some(taskMatches))
			: sprints
	);
	const visibleArchived = $derived(
		searching
			? archived.filter((s) => matchesQuery(search, s.name) || itemsOf(s.id).some(taskMatches))
			: archived
	);
</script>

<div class="rounded-card border border-line bg-surface p-5">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div>
			<p class="text-sm font-semibold text-ink-900">Sprints</p>
			<p class="text-[11px] text-ink-500">
				Delivery buckets for the work queue: put a core, a feature or an action in the sprint you
				plan to ship it in. Anything added here joins the queue below.
			</p>
		</div>
		<div class="flex flex-wrap items-center justify-end gap-2">
			<SearchInput
				bind:value={search}
				placeholder="Search a sprint or a task…"
				class="w-full max-w-xs"
			/>
			<button
				type="button"
				onclick={() => store.addSprint()}
				class="inline-flex shrink-0 items-center gap-1 rounded-field bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white hover:shadow-card"
			>
				<Icon name="plus" size={13} /> Add sprint
			</button>
		</div>
	</div>

	{#if sprints.length === 0}
		<p class="rounded-field border border-dashed border-line py-4 text-center text-xs text-ink-400">
			No sprints yet. Add one, then add tasks to it.
		</p>
	{:else if visibleSprints.length === 0}
		<p class="rounded-field border border-dashed border-line py-4 text-center text-xs text-ink-400">
			No sprint or task matches the search.
		</p>
	{:else}
		<div class="grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
			{#each visibleSprints as sprint (sprint.id)}
				{@const items = visibleItems(sprint)}
				{@const count = itemsOf(sprint.id).length}
				{@const done = sprintAllDone(store.draft, sprint.id)}
				{@const pct = sprintProgress(store.draft, sprint.id)}
				<div class="flex flex-col rounded-field border {done ? 'border-success-200 bg-success-50/30' : 'border-line bg-surface-sunken/40'} p-3">
					<div class="flex items-center gap-2">
						<span class="grid size-6 shrink-0 place-items-center rounded-md {done ? 'bg-success-50 text-success-600' : 'bg-info-50 text-info-600'}">
							<Icon name={done ? 'check' : 'calendar'} size={13} />
						</span>
						<input
							type="text"
							value={sprint.name}
							oninput={(e) => store.updateSprint(sprint.id, 'name', e.currentTarget.value)}
							placeholder="Sprint name"
							aria-label="Sprint name"
							class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-ink-900 outline-none placeholder:text-ink-300 focus:outline-none"
						/>
						{#if done}
							<span class="shrink-0 rounded-pill bg-success-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success-600">
								Done
							</span>
						{/if}
						<span class="shrink-0 rounded-pill bg-surface px-1.5 py-0.5 text-[9px] font-semibold text-ink-500">
							{count} task{count === 1 ? '' : 's'}
						</span>
						<button
							type="button"
							onclick={() => void remove(sprint.id)}
							class="grid size-6 shrink-0 place-items-center rounded text-ink-400 hover:bg-danger-50 hover:text-danger-500"
							aria-label="Remove sprint"
							title={count > 0
								? 'Remove sprint (its tasks stay in the queue, just un-sprinted)'
								: 'Remove sprint'}
						>
							<Icon name="x" size={12} />
						</button>
					</div>
					<div class="mt-2 flex items-center gap-1.5 text-[10px] text-ink-500">
						<span class="uppercase tracking-wide text-ink-400">From</span>
						<input
							type="date"
							value={sprint.startDate ?? ''}
							oninput={(e) => store.updateSprint(sprint.id, 'startDate', e.currentTarget.value)}
							aria-label="Sprint start date"
							class="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-700 outline-none focus:border-brand-300"
						/>
						<span class="uppercase tracking-wide text-ink-400">to</span>
						<input
							type="date"
							value={sprint.endDate ?? ''}
							oninput={(e) => store.updateSprint(sprint.id, 'endDate', e.currentTarget.value)}
							aria-label="Sprint end date"
							class="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-700 outline-none focus:border-brand-300"
						/>
						{#if done}
							<button
								type="button"
								onclick={() => store.archiveSprint(sprint.id)}
								title="Freeze this finished sprint in history: it leaves the pickers and filters"
								class="ml-auto rounded-field bg-brand-gradient px-2.5 py-1 text-[10px] font-semibold text-white hover:shadow-card"
							>
								Archive
							</button>
						{/if}
					</div>
					{#if count > 0 && !done}
						<div class="mt-2 h-1 overflow-hidden rounded-full bg-surface" title="{pct}% of this sprint's tasks are done">
							<div class="h-full rounded-full bg-info-500 transition-all" style="width: {pct}%"></div>
						</div>
					{/if}

					<!-- The sprint's tasks: what "N tasks" actually is, and the way out. -->
					{#if items.length > 0}
						<ul class="mt-2.5 space-y-1">
							{#each items as item (item.id)}
								{@const st = workItemStatus(store.draft, item)}
								{@const parent = workItemParentName(store.draft, item)}
								<li class="flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-1">
									<span class="shrink-0 text-ink-400" title={KIND_LABEL[item.kind]}>
										<Icon name={KIND_ICON[item.kind]} size={11} />
									</span>
									<span class="min-w-0 flex-1 truncate text-[11px] font-medium text-ink-800 {st === 'done' ? 'line-through opacity-60' : ''}">
										{workItemLabel(store.draft, item, resolveActionName)}
										{#if parent}<span class="font-normal text-ink-400"> · {parent}</span>{/if}
									</span>
									<span class="shrink-0 rounded-pill px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide {STATUS_META[st].cls}">
										{STATUS_META[st].label}
									</span>
									<button
										type="button"
										onclick={() => removeFromSprint(item)}
										class="grid size-4.5 shrink-0 place-items-center rounded text-ink-300 hover:bg-danger-50 hover:text-danger-500"
										aria-label="Remove from sprint"
										title="Take out of this sprint (stays in the work queue)"
									>
										<Icon name="x" size={10} />
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<div class="mt-2">
						<SearchPicker
							options={optionsFor(sprint.id)}
							onPick={(key) => addToSprint(sprint.id, key)}
							triggerLabel="Add task"
							triggerTitle="Put a core, a feature or an action in this sprint"
							ariaLabel="Add a task to {sprint.name || 'this sprint'}"
							placeholder="Search cores, features, actions…"
							emptyText="Every task is already in this sprint."
						/>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if visibleArchived.length > 0}
		<button
			type="button"
			onclick={() => (showArchived = !showArchived)}
			class="mt-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400 hover:text-ink-600"
		>
			<Icon name="check" size={11} />
			Archived sprints · {visibleArchived.length}
			<span>{showArchived ? '▾' : '▸'}</span>
		</button>
		{#if showArchived}
			<div class="mt-2 space-y-1.5">
				{#each visibleArchived as sprint (sprint.id)}
					{@const count = itemsOf(sprint.id).length}
					<div class="flex items-center gap-2 rounded-field border border-line bg-surface-sunken/40 px-3 py-2 opacity-70">
						<Icon name="check" size={11} class="text-success-600" />
						<span class="text-xs font-medium text-ink-600">{sprint.name || 'Untitled sprint'}</span>
						{#if sprint.startDate || sprint.endDate}
							<span class="text-[10px] text-ink-400">{sprint.startDate ?? '…'} → {sprint.endDate ?? '…'}</span>
						{/if}
						<span class="text-[10px] text-ink-400">· {count} task{count === 1 ? '' : 's'}</span>
						{#if sprint.archivedAt}
							<span class="text-[10px] text-ink-400" title="Archived on">· {sprint.archivedAt.slice(0, 10)}</span>
						{/if}
						<button
							type="button"
							onclick={() => store.unarchiveSprint(sprint.id)}
							title="Put this sprint back on the board"
							class="ml-auto rounded-field border border-line px-2 py-0.5 text-[10px] font-semibold text-ink-500 hover:border-brand-300 hover:text-brand-500"
						>
							Reopen
						</button>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
