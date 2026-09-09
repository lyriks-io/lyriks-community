<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import {
		ASSIGNMENT_STATUSES,
		SCOPE_TYPES,
		initials,
		type AssignmentStatus,
		type ScopeType
	} from '$domain/supervision';
	import type { FeatureWorkGroup } from '$application/build-feature-work-view';
	import type { SupervisionStore } from '../draft-store.svelte';

	interface Props {
		store: SupervisionStore;
		/** Read-only mirror of the Features work queue (owned by the Features section). */
		featureWork?: FeatureWorkGroup[];
	}
	let { store, featureWork = [] }: Props = $props();

	let adding = $state(false);
	let form = $state<{ assignee: string; scopeLabel: string; scopeType: ScopeType; dueInDays: number }>(
		{ assignee: '', scopeLabel: '', scopeType: 'step', dueInDays: 3 }
	);

	const statusLabel = (code: AssignmentStatus) =>
		ASSIGNMENT_STATUSES.find((s) => s.code === code)?.label ?? code;
	const statusChip: Record<AssignmentStatus, string> = {
		todo: 'bg-surface-sunken text-ink-500',
		doing: 'bg-warning-50 text-warning-600',
		review: 'bg-accent-50 text-accent-600',
		done: 'bg-success-50 text-success-700'
	};
	// Features work-queue chips — same labels/colors as the Features section, so
	// one status never reads differently across the two boards.
	const workChip: Record<string, string> = {
		todo: 'bg-surface-sunken text-ink-500',
		'in-progress': 'bg-warning-50 text-warning-600',
		done: 'bg-success-50 text-success-600'
	};
	const workLabel: Record<string, string> = {
		todo: 'To do',
		'in-progress': 'In progress',
		done: 'Done'
	};
	const paceChip: Record<string, string> = {
		ahead: 'bg-success-50 text-success-700',
		ontrack: 'bg-info-50 text-info-600',
		behind: 'bg-danger-50 text-danger-700'
	};
	const paceLabel: Record<string, string> = { ahead: 'Ahead', ontrack: 'On track', behind: 'Behind' };
	const riskTone: Record<string, string> = {
		high: 'border-danger-200 bg-danger-50/50',
		med: 'border-accent-200 bg-accent-50/50',
		low: 'border-success-200 bg-success-50/50'
	};

	// Which risk cards are expanded to reveal the assignments behind them.
	let expandedRisks = $state<Set<string>>(new Set());
	function toggleRisk(label: string) {
		const next = new Set(expandedRisks);
		if (next.has(label)) next.delete(label);
		else next.add(label);
		expandedRisks = next;
	}

	const totalDone = $derived(store.draft.assignments.filter((a) => a.status === 'done').length);
	const atRisk = $derived(
		store.draft.assignments.filter((a) => a.dueInDays < 0 && a.status !== 'done').length
	);
	// Real workspace members first (roster), then any free-text names already on the board.
	const people = $derived([
		...new Set([
			...store.roster.map((m) => m.name),
			...store.draft.assignments.filter((a) => a.assignee).map((a) => a.assignee)
		])
	]);

	function submit() {
		if (store.assignScope(form)) {
			form = { assignee: '', scopeLabel: '', scopeType: 'step', dueInDays: 3 };
			adding = false;
		}
	}
</script>

<div class="space-y-5">
	<!-- Summary tiles -->
	<div class="grid grid-cols-2 gap-3 md:grid-cols-5">
		{#each [{ label: 'Team members', value: String(store.pace.list.length) }, { label: 'Assignments', value: String(store.draft.assignments.length) }, { label: 'Done', value: `${totalDone}/${store.draft.assignments.length}` }, { label: 'Unassigned', value: String(store.unassigned.length) }, { label: 'At risk', value: String(atRisk) }] as tile (tile.label)}
			<div class="rounded-card border border-line bg-surface p-3">
				<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{tile.label}</p>
				<p class="mt-0.5 text-2xl font-bold text-ink-800">{tile.value}</p>
			</div>
		{/each}
	</div>

	<!-- Rhythm & alignment risks -->
	{#if store.risks.length > 0}
		<section class="rounded-card border border-danger-200 bg-danger-50/40 p-3.5">
			<p class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-danger-700">
				<Icon name="info" size={14} /> Rhythm & alignment risks · {store.risks.length}
			</p>
			<div class="grid items-start gap-1.5 sm:grid-cols-2">
				{#each store.risks as r, i (i)}
					{@const open = expandedRisks.has(r.label)}
					{@const hasItems = (r.items?.length ?? 0) > 0}
					<div class="rounded-field border {riskTone[r.severity]}">
						<button
							type="button"
							onclick={() => hasItems && toggleRisk(r.label)}
							aria-expanded={open}
							class="flex w-full items-start gap-2 px-2.5 py-1.5 text-left {hasItems
								? ''
								: 'cursor-default'}"
						>
							<span class="min-w-0 flex-1">
								<span class="block text-xs font-semibold text-ink-800">{r.label}</span>
								<span class="mt-0.5 block text-[10px] text-ink-500">{r.detail}</span>
							</span>
							{#if hasItems}
								<span class="mt-0.5 flex shrink-0 items-center gap-1 text-[9px] font-medium text-ink-400">
									{r.items?.length}
									<Icon
										name="chevron-right"
										size={13}
										class="transition-transform {open ? 'rotate-90' : ''}"
									/>
								</span>
							{/if}
						</button>
						{#if open && r.items}
							<ul class="space-y-1 border-t border-line/60 px-2.5 py-1.5">
								{#each r.items as it (it.label + it.assignee)}
									<li class="flex items-center gap-2 text-[11px]">
										<span class="min-w-0 flex-1 truncate text-ink-700">{it.label}</span>
										<span class="shrink-0 text-[10px] text-ink-400">{it.assignee || 'Unassigned'}</span>
										<span class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-semibold {statusChip[it.status]}">
											{statusLabel(it.status)}
										</span>
										<span
											class="shrink-0 text-[9px] tabular-nums {it.dueInDays < 0
												? 'font-semibold text-danger-600'
												: 'text-ink-400'}"
										>
											{it.dueInDays < 0 ? `${-it.dueInDays}d overdue` : `${it.dueInDays}d left`}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Board toolbar -->
	<div class="flex items-center gap-2">
		<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
			Who does what · team pace {store.pace.teamAvg}%
		</p>
		<div class="ml-auto">
			<Button variant="outline" size="sm" onclick={() => (adding = !adding)}>
				<Icon name="plus" size={14} /> Assign
			</Button>
		</div>
	</div>

	{#if adding}
		<div class="space-y-2 rounded-card border border-brand-200 bg-brand-50/40 p-3">
			<div class="grid gap-2 sm:grid-cols-2">
				<input
					bind:value={form.assignee}
					list="taskboard-assignees"
					placeholder="Assignee (blank = unassigned)"
					class="rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
				/>
				<datalist id="taskboard-assignees">
					{#each people as n (n)}
						<option value={n}></option>
					{/each}
				</datalist>
				<input
					bind:value={form.scopeLabel}
					placeholder="Scope - e.g. Glossary"
					class="rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
				/>
				<select
					bind:value={form.scopeType}
					class="rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 outline-none"
				>
					{#each SCOPE_TYPES as s (s.code)}
						<option value={s.code}>{s.label}</option>
					{/each}
				</select>
				<input
					type="number"
					bind:value={form.dueInDays}
					placeholder="Due in days"
					class="rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-800 outline-none"
				/>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="primary" size="sm" onclick={submit}>Create assignment</Button>
				<button type="button" class="text-xs text-ink-500 hover:text-ink-800" onclick={() => (adding = false)}
					>Cancel</button
				>
			</div>
		</div>
	{/if}

	<!-- Unassigned -->
	{#if store.unassigned.length > 0}
		<section class="rounded-card border border-accent-200 bg-accent-50/30 p-3.5">
			<p class="mb-2.5 text-sm font-semibold text-ink-800">
				Unassigned · <span class="text-xs font-normal text-ink-500"
					>{store.unassigned.length} needs an owner</span
				>
			</p>
			<div class="space-y-1.5">
				{#each store.unassigned as a (a.id)}
					<div class="flex items-center gap-2.5 rounded-field border border-line bg-surface px-2.5 py-2">
						<span class="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">{a.scopeType}</span>
						<span class="min-w-0 flex-1 truncate text-[13px] text-ink-800">{a.scopeLabel}</span>
						{#if a.dueInDays < 0}
							<span class="text-[9px] font-bold text-danger-600">{Math.abs(a.dueInDays)}d overdue</span>
						{:else}
							<span class="text-[9px] text-ink-400">due in {a.dueInDays}d</span>
						{/if}
						<select
							value=""
							onchange={(e) => e.currentTarget.value && store.setAssignmentOwner(a.id, e.currentTarget.value)}
							class="rounded-field border border-line bg-surface px-1.5 py-1 text-[10px] text-ink-600 outline-none"
						>
							<option value="">Assign to…</option>
							{#each people as n (n)}
								<option value={n}>{n}</option>
							{/each}
						</select>
						<button
							type="button"
							onclick={() => store.removeAssignment(a.id)}
							class="text-ink-300 hover:text-danger-500"
							aria-label="Remove"><Icon name="x" size={14} /></button
						>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Member list — ONE dense scannable line per person -->
	{#if store.pace.list.length > 0}
		<section class="divide-y divide-line rounded-card border border-line bg-surface">
			{#each store.pace.list as m (m.name)}
				<div class="flex items-center gap-3 px-3.5 py-2">
					<span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
						{initials(m.name)}
					</span>
					<p class="w-28 shrink-0 truncate text-[13px] font-semibold text-ink-800">{m.name}</p>

					<!-- scopes as status-coloured chips: click to advance, × to remove -->
					<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
						{#each m.items as a (a.id)}
							<span class="inline-flex items-center gap-1 rounded-pill py-0.5 pl-2 pr-1 text-[11px] {statusChip[a.status]}">
								<button
									type="button"
									onclick={() => store.advanceAssignmentStatus(a.id)}
									title="{statusLabel(a.status)} · {a.dueInDays < 0
										? `${Math.abs(a.dueInDays)}d overdue`
										: `due in ${a.dueInDays}d`} (click to advance)"
									class="max-w-44 truncate font-medium"
								>
									<span class="mr-0.5 text-[9px] font-bold uppercase opacity-60">{a.scopeType}</span
									>{a.scopeLabel}
								</button>
								{#if a.dueInDays < 0 && a.status !== 'done'}
									<span class="text-[9px] font-bold text-danger-600">{Math.abs(a.dueInDays)}d</span>
								{/if}
								<button
									type="button"
									onclick={() => store.removeAssignment(a.id)}
									class="opacity-50 hover:opacity-100"
									aria-label="Remove"><Icon name="x" size={11} /></button
								>
							</span>
						{/each}
					</div>

					<!-- avg progress -->
					<div class="flex w-28 shrink-0 items-center gap-2">
						<div class="h-1.5 flex-1 overflow-hidden rounded-pill bg-line">
							<div
								class="h-full rounded-pill {m.avg >= 100
									? 'bg-success-500'
									: m.avg >= 50
										? 'bg-info-500'
										: 'bg-accent-500'}"
								style="width:{m.avg}%"
							></div>
						</div>
						<span class="w-8 text-right text-[10px] tabular-nums text-ink-500">{m.avg}%</span>
					</div>

					<span class="w-[68px] shrink-0 rounded-pill px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] {paceChip[m.pace]}">
						{paceLabel[m.pace]}
					</span>
				</div>
			{/each}
		</section>
	{/if}

	{#if store.draft.assignments.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
			<p class="text-sm font-semibold text-ink-700">No scopes assigned yet.</p>
			<p class="mt-1 text-xs text-ink-500">
				Assign a section, a feature core or a free topic to a team member to start piloting the spec.
			</p>
		</div>
	{/if}

	<!-- Features work queue — read-only mirror; the Features section owns it. -->
	{#if featureWork.length > 0}
		<section class="rounded-card border border-line bg-surface p-3.5">
			<div class="mb-2.5 flex items-center gap-2">
				<p class="text-sm font-semibold text-ink-800">Features work queue</p>
				<a
					href={`/projects/${store.draft.projectId}/features?tab=roadmap`}
					class="ml-auto text-xs font-medium text-brand-600 hover:underline"
				>
					Edit in Features
				</a>
			</div>
			<div class="space-y-2.5">
				{#each featureWork as g (g.assignee ?? '__unassigned')}
					<div>
						<p class="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
							{g.assignee ?? 'Unassigned'} · {g.doneCount}/{g.totalCount} done
						</p>
						<div class="space-y-1">
							{#each g.items as it (it.id)}
								<div class="flex items-center gap-2.5 rounded-field border border-line bg-surface-sunken px-2.5 py-1.5">
									<span class="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">{it.kind}</span>
									<span class="min-w-0 flex-1 truncate text-[13px] text-ink-800">
										{it.label}{#if it.parent}<span class="text-ink-400"> · {it.parent}</span>{/if}
									</span>
									<span class="rounded-field px-1.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.1em] {workChip[it.status]}">
										{workLabel[it.status]}
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>
