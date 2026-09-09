<script lang="ts">
	import { Icon, SearchInput, matchesQuery } from '$ui/design-system';
	import {
		activeSprints,
		assignmentToTarget,
		queueByAssignee,
		workItemLabel,
		workItemParentName,
		workItemStatus,
		type WorkAssignment,
		type WorkStatus
	} from '$domain/features';
	import type { FeatureActionIndex } from '$application/index-feature-actions';
	import type { Collaborator } from '$domain/team/team';
	import { colorTokens, initials } from '$ui/team/team-style';
	import type { FeaturesStore } from '../draft-store.svelte';
	import SprintChip from '../SprintChip.svelte';
	import type { IconName } from '$ui/design-system/Icon.svelte';

	interface Props {
		store: FeaturesStore;
		collaborators: Collaborator[];
		featureActions: FeatureActionIndex;
	}
	let { store, collaborators, featureActions }: Props = $props();

	let sprintFilter = $state<string | null>(null); // null = all sprints

	// Archived sprints leave the filter pills; a filter pointing at one (archived
	// while selected) silently falls back to "All" instead of sticking unresettable.
	const sprints = $derived([...activeSprints(store.draft)].sort((a, b) => a.order - b.order));
	// The per-item chip still needs the full list: an item parked in an archived
	// sprint must show that bucket's name (the chip filters its own menu).
	const allSprints = $derived(
		[...(store.draft.sprints ?? [])].sort((a, b) => a.order - b.order)
	);
	const effectiveFilter = $derived(
		sprintFilter && sprints.some((s) => s.id === sprintFilter) ? sprintFilter : null
	);
	const groups = $derived(
		queueByAssignee(store.draft, effectiveFilter ? { sprintId: effectiveFilter } : {})
	);
	const collaboratorById = $derived(new Map(collaborators.map((c) => [c.id, c])));
	const resolveActionName = (featureId: string, actionId: string) =>
		featureActions[featureId]?.find((a) => a.id === actionId)?.name;

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

	const STATUS_CYCLE: readonly WorkStatus[] = ['todo', 'in-progress', 'done'];
	const STATUS_META: Record<WorkStatus, { label: string; cls: string }> = {
		todo: { label: 'To do', cls: 'bg-surface-sunken text-ink-500' },
		'in-progress': { label: 'In progress', cls: 'bg-warning-50 text-warning-600' },
		done: { label: 'Done', cls: 'bg-success-50 text-success-600' }
	};

	function cycleStatus(a: WorkAssignment) {
		const target = assignmentToTarget(a);
		if (!target) return;
		const cur = workItemStatus(store.draft, a);
		const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
		store.setWorkItemStatus(target, next);
	}
	function move(a: WorkAssignment, dir: -1 | 1, siblings: WorkAssignment[]) {
		const i = siblings.findIndex((s) => s.id === a.id);
		const j = i + dir;
		if (j < 0 || j >= siblings.length) return;
		// Move before the neighbour when going up; before the one after when going down.
		const beforeId = dir === -1 ? siblings[j].id : (siblings[j + 1]?.id ?? null);
		store.reorderQueue(a.assigneeId ?? null, a.id, beforeId);
	}
	function unqueue(a: WorkAssignment) {
		const target = assignmentToTarget(a);
		if (target) store.toggleQueued(target);
	}

	/* Search the queue by task or by person. A member card survives when their
	   name matches (then it keeps every task, since "show me Ana's queue" means
	   all of it) or when one of their tasks does, and then shows only the
	   matching tasks. It composes with the sprint pills rather than replacing
	   them: pills pick a bucket, the box finds a name. */
	let search = $state('');
	const searching = $derived(search.trim().length > 0);
	const itemText = (item: WorkAssignment): (string | null | undefined)[] => [
		workItemLabel(store.draft, item, resolveActionName),
		workItemParentName(store.draft, item),
		KIND_LABEL[item.kind]
	];
	const visibleGroups = $derived.by(() => {
		if (!searching) return groups;
		return groups
			.map((group) => {
				const member = group.assigneeId ? collaboratorById.get(group.assigneeId) : undefined;
				const who = member ? [member.name, member.email] : ['Unassigned'];
				if (matchesQuery(search, ...who)) return group;
				return { ...group, items: group.items.filter((i) => matchesQuery(search, ...itemText(i))) };
			})
			.filter((group) => group.items.length > 0);
	});
</script>

<div class="rounded-card border border-line bg-surface p-5">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<p class="text-sm font-semibold text-ink-900">Work queue</p>
			<p class="text-[11px] text-ink-500">
				Who does what next. A task enters the queue when you add it to a sprint above, give it
				an owner in a release, or flag it in the Features tab; each member works their list in
				order.
			</p>
		</div>
		<SearchInput
			bind:value={search}
			placeholder="Search a task or a member…"
			class="w-full max-w-xs"
		/>
		<!-- Sprint filter -->
		<div class="flex items-center gap-1.5">
			<span class="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Sprint</span>
			<div class="flex flex-wrap gap-1">
				<button
					type="button"
					onclick={() => (sprintFilter = null)}
					class="rounded-pill px-2.5 py-1 text-[11px] font-medium transition {effectiveFilter === null
						? 'bg-brand-500 text-white'
						: 'bg-surface-sunken text-ink-500 hover:text-ink-800'}"
				>
					All
				</button>
				{#each sprints as s (s.id)}
					<button
						type="button"
						onclick={() => (sprintFilter = s.id)}
						class="rounded-pill px-2.5 py-1 text-[11px] font-medium transition {effectiveFilter === s.id
							? 'bg-brand-500 text-white'
							: 'bg-surface-sunken text-ink-500 hover:text-ink-800'}"
					>
						{s.name || 'Untitled'}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if groups.length === 0}
		<div class="rounded-field border border-dashed border-line py-8 text-center">
			<span class="mx-auto grid size-9 place-items-center rounded-xl bg-surface-sunken text-ink-400">
				<Icon name="users" size={16} />
			</span>
			<p class="mt-2 text-sm font-medium text-ink-600">The queue is empty</p>
			<p class="text-xs text-ink-400">
				Add a task to a sprint above, give a feature an owner in a release, or flag one in the
				Features tab: it shows up here.
			</p>
		</div>
	{:else if visibleGroups.length === 0}
		<p class="rounded-field border border-dashed border-line py-8 text-center text-sm text-ink-500">
			No task or member matches the search.
		</p>
	{:else}
		<div class="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
			{#each visibleGroups as group (group.assigneeId ?? 'unassigned')}
				{@const member = group.assigneeId ? collaboratorById.get(group.assigneeId) : undefined}
				<div class="flex flex-col rounded-card border border-line bg-surface-sunken/30 p-3">
					<!-- Member header -->
					<div class="mb-2 flex items-center gap-2">
						{#if member}
							<span
								class="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
								style="background:{colorTokens(member.color).solid}"
							>
								{initials(member.name || member.email)}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-ink-900">
									{member.name || member.email}
								</p>
								<p class="text-[10px] text-ink-500">
									{group.doneCount}/{group.totalCount} done
								</p>
							</div>
						{:else}
							<span class="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-line text-ink-400">
								<Icon name="users" size={13} />
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-ink-500">Unassigned</p>
								<p class="text-[10px] text-ink-400">{group.totalCount} waiting for an owner</p>
							</div>
						{/if}
					</div>

					<!-- Queue items -->
					<div class="space-y-1.5">
						{#each group.items as item (item.id)}
							{@const st = workItemStatus(store.draft, item)}
							{@const isNext = group.next?.id === item.id}
							{@const parent = workItemParentName(store.draft, item)}
							<div
								class="rounded-field border bg-surface px-2 py-1.5 {isNext
									? 'border-brand-300 ring-1 ring-brand-200'
									: 'border-line'}"
							>
								<div class="flex items-center gap-1.5">
									{#if isNext}
										<span class="shrink-0 rounded-pill bg-brand-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
											Next
										</span>
									{/if}
									<span class="shrink-0 text-ink-400" title={KIND_LABEL[item.kind]}>
										<Icon name={KIND_ICON[item.kind]} size={12} />
									</span>
									<span class="min-w-0 flex-1 truncate text-xs font-medium text-ink-800 {st === 'done' ? 'line-through opacity-60' : ''}">
										{workItemLabel(store.draft, item, resolveActionName)}
									</span>
									<!-- Reorder -->
									<button
										type="button"
										onclick={() => move(item, -1, group.items)}
										class="grid size-5 shrink-0 place-items-center rounded text-ink-300 hover:bg-surface-sunken hover:text-ink-700"
										aria-label="Move up"
									>
										<Icon name="arrow-up" size={11} />
									</button>
									<button
										type="button"
										onclick={() => move(item, 1, group.items)}
										class="grid size-5 shrink-0 place-items-center rounded text-ink-300 hover:bg-surface-sunken hover:text-ink-700"
										aria-label="Move down"
									>
										<Icon name="arrow-down" size={11} />
									</button>
									<button
										type="button"
										onclick={() => unqueue(item)}
										class="grid size-5 shrink-0 place-items-center rounded text-ink-300 hover:bg-danger-50 hover:text-danger-500"
										aria-label="Remove from queue"
										title="Remove from queue"
									>
										<Icon name="x" size={11} />
									</button>
								</div>
								<div class="mt-1 flex items-center gap-1.5 pl-0.5">
									{#if parent}
										<span class="truncate text-[10px] text-ink-400" title="in {parent}">in {parent}</span>
									{/if}
									<button
										type="button"
										onclick={() => cycleStatus(item)}
										class="rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide {STATUS_META[st].cls}"
										title="Click to advance status"
									>
										{STATUS_META[st].label}
									</button>
									<span class="ml-auto">
										<SprintChip
											sprintId={item.sprintId}
											sprints={allSprints}
											onPick={(sid) => {
												const t = assignmentToTarget(item);
												if (t) store.setWorkItemSprint(t, sid);
											}}
										/>
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
