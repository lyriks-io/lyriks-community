<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon, SearchInput, matchesQuery } from '$ui/design-system';
	import type { DataVisibilityChoice, DataEntity, EntityField } from '$domain/data';
	import type { DerivedDataVisibility } from '$application/data-visibility';
	import type { DataStore } from '../draft-store.svelte';

	interface Props {
		store: DataStore;
		/** Ids the CLIENT experience surfaces (from the server-side cross-check). */
		derivedVisibility: DerivedDataVisibility;
	}
	let { store, derivedVisibility }: Props = $props();

	const derivedEntities = $derived(new Set(derivedVisibility.entityIds));
	const derivedFields = $derived(new Set(derivedVisibility.fieldIds));

	// Visibility is binary: a data is VISIBLE when the client experience shows it
	// (automatic), HIDDEN when it has left the experience. `hidden` = a deliberate
	// human opt-out; `anomaly` = also hidden, but it dropped from the experience
	// WITHOUT a human action — the invariant "nothing is removed unless a person
	// chose to" was broken, so it is flagged (data is never deleted, only hidden).
	type Status = 'visible' | 'hidden' | 'anomaly';
	function statusOf(id: string, derived: Set<string>): Status {
		const override = store.getVisibilityChoice(id);
		if (override === 'shown') return 'visible';
		if (override === 'hidden') return 'hidden';
		return derived.has(id) ? 'visible' : 'anomaly';
	}
	const isShown = (s: Status) => s === 'visible';

	interface FieldRow {
		field: EntityField;
		status: Status;
	}
	interface EntityRow {
		entity: DataEntity;
		status: Status;
		fields: FieldRow[];
		anomalies: number;
	}
	interface DbGroup {
		id: string;
		name: string;
		entities: EntityRow[];
	}

	let filter = $state<'all' | 'visible' | 'invisible'>('all');
	let query = $state('');
	// Collapsed entities (id set); entities start expanded.
	let collapsed = $state<Set<string>>(new Set());
	function toggle(id: string) {
		const next = new Set(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsed = next;
	}

	// Every entity + field with its status, grouped by database — the full,
	// unfiltered inventory (counts read off this so the filter can't skew them).
	const inventory = $derived.by<EntityRow[]>(() => {
		const fieldsByEntity = new Map<string, EntityField[]>();
		for (const f of store.draft.fields) {
			const list = fieldsByEntity.get(f.entityId) ?? [];
			list.push(f);
			fieldsByEntity.set(f.entityId, list);
		}
		return store.draft.entities.map((entity) => {
			const fields = (fieldsByEntity.get(entity.id) ?? []).map((field) => ({
				field,
				status: statusOf(field.id, derivedFields)
			}));
			return {
				entity,
				status: statusOf(entity.id, derivedEntities),
				fields,
				anomalies:
					(statusOf(entity.id, derivedEntities) === 'anomaly' ? 1 : 0) +
					fields.filter((f) => f.status === 'anomaly').length
			};
		});
	});

	const counts = $derived.by(() => {
		let visible = 0;
		let hidden = 0;
		let anomaly = 0;
		for (const row of inventory) {
			for (const s of [row.status, ...row.fields.map((f) => f.status)]) {
				if (s === 'visible') visible++;
				else if (s === 'hidden') hidden++;
				else anomaly++;
			}
		}
		return { visible, hidden, anomaly };
	});

	// Anomalies (data invisible without the user's consent) — the notification list.
	const anomalyList = $derived.by(() => {
		const out: { label: string; kind: 'table' | 'field'; id: string }[] = [];
		for (const row of inventory) {
			if (row.status === 'anomaly')
				out.push({ label: row.entity.name || 'Untitled table', kind: 'table', id: row.entity.id });
			for (const f of row.fields)
				if (f.status === 'anomaly')
					out.push({
						label: `${row.entity.name || 'Table'} · ${f.field.name || 'field'}`,
						kind: 'field',
						id: f.field.id
					});
		}
		return out;
	});

	// Filtered + searched view, grouped by database for a scannable layout.
	const groups = $derived.by<DbGroup[]>(() => {
		const passStatus = (s: Status) =>
			filter === 'all' ? true : filter === 'visible' ? isShown(s) : !isShown(s);
		const dbName = new Map(
			store.draft.databases.map((d) => [d.id, d.name || 'Untitled database'] as const)
		);
		const buckets = new Map<string, EntityRow[]>();
		for (const row of inventory) {
			// A table that matches keeps all of its fields; otherwise only the
			// fields that match it themselves survive. Searching a field's TYPE
			// works too ("uuid", "boolean"), which is how schema questions read.
			const entityHit = matchesQuery(
				query,
				row.entity.name,
				row.entity.description,
				dbName.get(row.entity.databaseId ?? '')
			);
			const fields = row.fields.filter(
				(f) =>
					passStatus(f.status) &&
					(entityHit || matchesQuery(query, f.field.name, f.field.type, ...(f.field.enumValues ?? [])))
			);
			const entityPasses = passStatus(row.status) && entityHit;
			if (!entityPasses && fields.length === 0) continue;
			const key = row.entity.databaseId ?? '__none__';
			const list = buckets.get(key) ?? [];
			list.push({ ...row, fields });
			buckets.set(key, list);
		}
		return [...buckets.entries()]
			.map(([id, entities]) => ({
				id,
				name: id === '__none__' ? 'No database' : (dbName.get(id) ?? 'Untitled database'),
				entities
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	// Nudge once on mount when data left the experience without a human action.
	onMount(() => {
		if (anomalyList.length > 0) {
			store.notifier.notify(
				'error',
				`${anomalyList.length} data left the client experience without a deliberate action, now marked Hidden. Review the inventory.`
			);
		}
	});

	function setChoice(id: string, value: string) {
		store.setVisibilityChoice(id, value === '' ? null : (value as DataVisibilityChoice));
	}

	const STATUS_META: Record<Status, { label: string; tone: string; icon: 'eye' | 'eye-off' | 'flag' }> =
		{
			visible: { label: 'Visible', tone: 'bg-success-50 text-success-600', icon: 'eye' },
			hidden: { label: 'Hidden', tone: 'bg-surface-sunken text-ink-500', icon: 'eye-off' },
			anomaly: { label: 'Hidden', tone: 'bg-warning-50 text-warning-600', icon: 'flag' }
		};
</script>

<div class="space-y-4">
	<!-- ── Summary + what this tab is for ─────────────────────────────────── -->
	<div class="rounded-card border border-line bg-surface p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">
					Data inventory
				</p>
				<p class="mt-0.5 max-w-xl text-sm text-ink-500">
					Every table and field the product holds, checked against the client experience. A data is
					<b>Visible</b> when the experience shows it (automatic) and <b>Hidden</b> when it left it.
					Data is never deleted: only a deliberate action hides it; anything hidden without one is
					flagged.
				</p>
			</div>
			<div class="flex items-center gap-2 text-center">
				<div class="rounded-field bg-success-50 px-3 py-1.5">
					<p class="text-lg font-bold leading-none text-success-600">{counts.visible}</p>
					<p class="text-[9px] font-semibold uppercase tracking-wider text-success-600/70">Visible</p>
				</div>
				<div class="rounded-field bg-surface-sunken px-3 py-1.5">
					<p class="text-lg font-bold leading-none text-ink-600">{counts.hidden + counts.anomaly}</p>
					<p class="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Hidden</p>
				</div>
				<div class="rounded-field bg-warning-50 px-3 py-1.5">
					<p class="text-lg font-bold leading-none text-warning-600">{counts.anomaly}</p>
					<p class="text-[9px] font-semibold uppercase tracking-wider text-warning-600/70">
						Flagged
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- ── Flagged: data hidden because it left the experience without a human action ── -->
	{#if anomalyList.length > 0}
		<div class="rounded-card border border-warning-200 bg-warning-50/50 p-3">
			<p class="flex items-center gap-1.5 text-[12px] font-semibold text-warning-700">
				<Icon name="flag" size={14} />
				{anomalyList.length} data left the client experience without a deliberate action, now marked Hidden.
			</p>
			<p class="mt-1 text-[11px] text-warning-700/80">
				Data is never deleted. Bring it back with “Always visible”, or confirm the removal by hiding
				it explicitly.
			</p>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each anomalyList.slice(0, 12) as a (a.id)}
					<span
						class="inline-flex items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-[10px] font-medium text-warning-700 ring-1 ring-inset ring-warning-200"
					>
						<Icon name={a.kind === 'table' ? 'table' : 'key'} size={9} />
						{a.label}
					</span>
				{/each}
				{#if anomalyList.length > 12}
					<span class="text-[10px] text-warning-700/70">+{anomalyList.length - 12} more</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ── Controls: search + visible/invisible switch ────────────────────── -->
	<div class="flex flex-wrap items-center gap-2">
		<SearchInput
			bind:value={query}
			placeholder="Search a table, field or type…"
			size="md"
			class="min-w-48 flex-1"
		/>
		<div class="inline-flex overflow-hidden rounded-field border border-line" role="group" aria-label="Filter by visibility">
			{#each [{ v: 'all', l: 'All' }, { v: 'visible', l: 'Visible' }, { v: 'invisible', l: 'Invisible' }] as opt (opt.v)}
				<button
					type="button"
					onclick={() => (filter = opt.v as typeof filter)}
					aria-pressed={filter === opt.v}
					class="px-3 py-1.5 text-[12px] font-semibold transition {filter === opt.v
						? 'bg-brand-500 text-white'
						: 'bg-surface text-ink-500 hover:bg-surface-sunken'}"
				>
					{opt.l}
				</button>
			{/each}
		</div>
	</div>

	<!-- ── The inventory, grouped Database → Table → Fields ───────────────── -->
	{#if groups.length === 0}
		<p class="rounded-card border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-400">
			{store.draft.entities.length === 0
				? 'No data modelled yet. Add tables in the Data model tab.'
				: 'No data matches this filter.'}
		</p>
	{:else}
		<div class="space-y-4">
			{#each groups as group (group.id)}
				<div>
					<p class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
						<Icon name="database" size={12} class="text-ink-300" />
						{group.name}
						<span class="text-ink-300">· {group.entities.length}</span>
					</p>
					<div class="space-y-2">
						{#each group.entities as row (row.entity.id)}
							{@const open = !collapsed.has(row.entity.id)}
							<div class="rounded-card border border-line bg-surface">
								<!-- Table header row -->
								<div class="flex items-center gap-2 px-3 py-2">
									<button
										type="button"
										onclick={() => toggle(row.entity.id)}
										aria-expanded={open}
										class="flex min-w-0 flex-1 items-center gap-2 text-left"
									>
										<Icon
											name="chevron-right"
											size={12}
											class="shrink-0 text-ink-300 transition-transform {open ? 'rotate-90' : ''}"
										/>
										<Icon name="table" size={13} class="shrink-0 text-brand-500" />
										<span class="truncate text-sm font-semibold text-ink-900">
											{row.entity.name || 'Untitled table'}
										</span>
										<span class="shrink-0 text-[10px] tabular-nums text-ink-300">
											{row.fields.length} field{row.fields.length === 1 ? '' : 's'}
										</span>
										{#if row.anomalies > 0}
											<span class="inline-flex items-center gap-0.5 rounded-pill bg-warning-50 px-1.5 py-px text-[9px] font-semibold text-warning-600">
												<Icon name="flag" size={9} /> {row.anomalies}
											</span>
										{/if}
									</button>
									{@render visControl(row.entity.id, row.status)}
								</div>
								<!-- Fields -->
								{#if open && row.fields.length > 0}
									<div class="divide-y divide-line/60 border-t border-line/60">
										{#each row.fields as fr (fr.field.id)}
											<div class="flex items-center gap-2 px-3 py-1.5 pl-9">
												<Icon
													name={fr.field.isId ? 'key' : fr.field.relationTargetEntityId ? 'link' : 'circle'}
													size={11}
													class="shrink-0 text-ink-300"
												/>
												<span class="min-w-0 flex-1 truncate text-[12px] text-ink-700">
													{fr.field.name || 'field'}
													<span class="ml-1 text-[10px] text-ink-300">{fr.field.type}</span>
												</span>
												{@render visControl(fr.field.id, fr.status)}
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Visibility badge + inline override (Auto / Always visible / Always hidden). -->
{#snippet visControl(id: string, status: Status)}
	{@const meta = STATUS_META[status]}
	{@const override = store.getVisibilityChoice(id)}
	<span class="relative inline-flex shrink-0 items-center" title="Set client visibility">
		<span
			class="inline-flex h-6 items-center gap-1 rounded-pill px-2 text-[10px] font-semibold {meta.tone}"
		>
			<Icon name={meta.icon} size={11} />
			{meta.label}{override ? ' ✎' : ''} ▾
		</span>
		<select
			value={override ?? ''}
			onchange={(e) => setChoice(id, e.currentTarget.value)}
			aria-label="Set client visibility"
			class="absolute inset-0 cursor-pointer opacity-0"
		>
			<option value="">Auto (from experience)</option>
			<option value="shown">Always visible</option>
			<option value="hidden">Always hidden</option>
		</select>
	</span>
{/snippet}
