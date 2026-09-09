<script lang="ts">
	import { page } from '$app/state';
	import { Icon } from '$ui/design-system';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import { replaceOccurrence } from '$domain/glossary';
	import {
		ACTIVE_PERMISSION_ACTIONS,
		type CapabilityKind,
		type CapabilitySource
	} from '$domain/users';
	import type { UsersStore } from '$ui/users/draft-store.svelte';
	import { capabilityHref, capabilityLinkLabel } from './capability-link';
	import { inferCapScope, roleClass, type CapScope, type RoleClass } from './scope';

	interface Props {
		store: UsersStore;
		scope: RoleClass;
	}
	let { store, scope }: Props = $props();

	type GroupIcon = 'shield' | 'grid' | 'globe' | 'monitor' | 'plus';

	interface Row {
		id: string;
		label: string;
		source: CapabilitySource;
		capScope: CapScope;
		/** Kind suggested upstream (a dialog is a surface); an authored profile wins. */
		suggestedKind?: CapabilityKind;
		/** Surfaces only: page / dialog / panel / form … and the route, when there is one. */
		surfaceKind?: string;
		path?: string;
		orphan?: boolean;
		/** "Feature", "Surface" … — the bucket under "Group by: type". */
		typeLabel: string;
		/** The Core / feature / bucket that owns the row — "Group by: owner". */
		ownerLabel: string;
		icon: GroupIcon;
		/** Free-text haystack for the search box. */
		search: string;
	}
	interface Group {
		key: string;
		title: string;
		icon: GroupIcon;
		bulletClass: string;
		rows: Row[];
	}

	const BULLET: Record<CapabilitySource, string> = {
		system: 'bg-brand-500',
		feature: 'bg-info-500',
		journey: 'bg-success-500',
		surface: 'bg-accent-500',
		off_structure: 'bg-warning-500'
	};

	/** Roles (columns) belonging to this scope's user class. */
	const visibleRoles = $derived(store.draft.roles.filter((r) => roleClass(r.tone) === scope));

	/** Keep a row only if its inferred scope matches this matrix (or is shared). */
	function keep(s: CapScope): boolean {
		return s === scope || s === 'both';
	}

	/**
	 * Every row this scope can show, flat. Grouping, search and filtering are all
	 * projections over this one list, so a row is described once and the three
	 * controls can never disagree about what exists.
	 */
	const allRows = $derived.by<Row[]>(() => {
		const rows: Row[] = [];
		const push = (row: Omit<Row, 'search'>) => {
			if (!keep(row.capScope)) return;
			rows.push({
				...row,
				search: `${row.label} ${row.ownerLabel} ${row.typeLabel} ${row.path ?? ''} ${row.surfaceKind ?? ''}`.toLowerCase()
			});
		};

		for (const c of store.systemCapabilities) {
			push({
				id: c.id,
				label: c.label,
				source: 'system',
				capScope: inferCapScope('system', c.label),
				typeLabel: 'System',
				ownerLabel: 'System',
				icon: 'shield'
			});
		}
		for (const c of store.derivedFeatures) {
			push({
				id: c.id,
				label: c.label,
				source: 'feature',
				capScope: inferCapScope('feature', c.label, c.sourceRefLabel),
				suggestedKind: c.kind,
				typeLabel: 'Features',
				ownerLabel: c.sourceRefLabel || 'Feature',
				icon: 'grid'
			});
		}
		for (const c of store.derivedJourneys) {
			push({
				id: c.id,
				label: c.label,
				source: 'journey',
				capScope: inferCapScope('journey', c.label, c.sourceRefLabel),
				suggestedKind: c.kind,
				typeLabel: 'Journeys',
				ownerLabel: 'Journeys',
				icon: 'globe'
			});
		}
		for (const c of store.derivedSurfaces) {
			push({
				id: c.id,
				label: c.label,
				source: 'surface',
				capScope: inferCapScope('surface', c.label, c.sourceRefLabel),
				suggestedKind: c.kind,
				surfaceKind: c.surfaceKind,
				path: c.path,
				typeLabel: 'Surfaces',
				// Pages come from Experience, the rest from the feature that authored them.
				ownerLabel: c.surfaceKind === 'page' ? 'Pages' : c.sourceRefLabel || 'Behavior',
				icon: 'monitor'
			});
		}
		for (const c of store.draft.offStructureCapabilities) {
			push({
				id: c.id,
				label: c.label || 'New capability',
				source: 'off_structure',
				capScope: inferCapScope('off_structure', c.label || ''),
				orphan: true,
				typeLabel: 'Off-structure',
				ownerLabel: 'Off-structure',
				icon: 'plus'
			});
		}
		return rows;
	});

	/* ─────────────────────────── Controls ───────────────────────────────── */
	let query = $state('');
	let groupBy = $state<'owner' | 'type' | 'none'>('owner');
	let ungrantedOnly = $state(false);

	/** No visible role holds anything on this row — the gap worth hunting for. */
	function isUngranted(row: Row): boolean {
		return !visibleRoles.some((r) => store.isGranted(r.id, row.id, 'view')
			|| store.draft.permissions.some((p) => p.roleId === r.id && p.capabilityId === row.id));
	}

	const visibleRows = $derived.by<Row[]>(() => {
		const q = query.trim().toLowerCase();
		return allRows
			.filter((row) => (q ? row.search.includes(q) : true))
			.filter((row) => (ungrantedOnly ? isUngranted(row) : true));
	});

	const ungrantedCount = $derived(allRows.filter(isUngranted).length);

	const groups = $derived.by<Group[]>(() => {
		if (groupBy === 'none') {
			return visibleRows.length
				? [
						{
							key: 'all',
							title: 'All capabilities',
							icon: 'grid' as GroupIcon,
							bulletClass: 'bg-ink-300',
							rows: visibleRows
						}
					]
				: [];
		}
		const buckets = new Map<string, Group>();
		for (const row of visibleRows) {
			const title =
				groupBy === 'type'
					? row.typeLabel
					: row.source === 'feature'
						? `Feature · ${row.ownerLabel}`
						: row.source === 'surface'
							? `Surface · ${row.ownerLabel}`
							: row.typeLabel;
			const bucket = buckets.get(title);
			if (bucket) bucket.rows.push(row);
			else
				buckets.set(title, {
					key: title,
					title,
					icon: row.icon,
					bulletClass: BULLET[row.source],
					rows: [row]
				});
		}
		return [...buckets.values()];
	});

	const capCount = $derived(visibleRows.length);


	const ACTION_BY_CODE = new Map(ACTIVE_PERMISSION_ACTIONS.map((a) => [a.code, a]));

	const GROUP_MODES = [
		{ code: 'owner' as const, label: 'Owner', hint: 'Group by the Core or feature that owns the capability' },
		{ code: 'type' as const, label: 'Type', hint: 'Group by System / Features / Journeys / Surfaces' },
		{ code: 'none' as const, label: 'None', hint: 'One flat list' }
	];

	const projectId = $derived(page.params.projectId ?? '');

	// Dynamic column count: interpolated grid-cols are never emitted by
	// Tailwind's static scan, so set grid-template-columns inline. A role column
	// holds five labelled checkboxes, wrapping onto two lines.
	const matrixColsStyle = $derived(
		visibleRoles.length === 0
			? 'grid-template-columns: 1fr;'
			: `grid-template-columns: minmax(200px,1.2fr) repeat(${visibleRoles.length}, minmax(230px, 1fr)) 40px;`
	);
</script>

<div class="overflow-hidden rounded-card border border-line bg-surface">
	<!-- matrix header -->
	<div
		class="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 {scope ===
		'end-user'
			? 'bg-accent-50/40'
			: 'bg-info-50/40'}"
	>
		<div class="flex items-center gap-3">
			<span
				class="grid size-9 place-items-center rounded-lg {scope === 'end-user'
					? 'bg-accent-50 text-accent-500'
					: 'bg-info-50 text-info-500'}"
			>
				<Icon name={scope === 'end-user' ? 'users' : 'shield'} size={18} />
			</span>
			<div>
				<p class="text-sm font-semibold text-ink-900">
					{scope === 'end-user' ? 'End-Users permissions' : 'Admins permissions'}
				</p>
				<p class="text-[11px] text-ink-500">
					{scope === 'end-user'
						? 'Outside-in capabilities · customers, buyers, public personas'
						: 'Inside-out capabilities · admins, support, internal operators'}
				</p>
			</div>
		</div>
		<div class="text-right text-[11px] text-ink-500">
			<p>{capCount} capabilities · {visibleRoles.length} role{visibleRoles.length === 1 ? '' : 's'}</p>
			<!-- No legend: every checkbox is labelled where it is clicked. -->
			<p class="mt-1 hidden text-[10px] text-ink-400">
				Tick what each role may do · hover a permission for what it means
			</p>
		</div>
	</div>

	<!-- Search / group / filter. A 60-row matrix is unreadable without them: this
	     is how you get from "everything" to the handful of rows you came for. -->
	<div class="flex flex-wrap items-center gap-2 border-b border-line bg-surface-sunken/40 px-5 py-2.5">
		<label class="relative min-w-48 flex-1">
			<span class="sr-only">Search capabilities</span>
			<Icon
				name="search"
				size={13}
				class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
			/>
			<input
				value={query}
				oninput={(e) => (query = e.currentTarget.value)}
				placeholder="Search a capability, page or route…"
				class="w-full rounded-field border border-line bg-surface py-1.5 pl-7 pr-7 text-[12px] text-ink-900 placeholder:text-ink-400 hover:border-line-strong focus:border-brand-400"
			/>
			{#if query}
				<button
					type="button"
					onclick={() => (query = '')}
					aria-label="Clear search"
					class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
				>
					<Icon name="x" size={12} />
				</button>
			{/if}
		</label>

		<div class="flex items-center gap-1 text-[11px] text-ink-500">
			<Icon name="layers" size={13} />
			<span class="hidden sm:inline">Group by</span>
			{#each GROUP_MODES as mode (mode.code)}
				<button
					type="button"
					onclick={() => (groupBy = mode.code)}
					aria-pressed={groupBy === mode.code}
					title={mode.hint}
					class="rounded-pill border px-2 py-0.5 font-medium transition {groupBy === mode.code
						? 'border-brand-300 bg-brand-50 text-brand-600'
						: 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-700'}"
				>
					{mode.label}
				</button>
			{/each}
		</div>

		<button
			type="button"
			onclick={() => (ungrantedOnly = !ungrantedOnly)}
			aria-pressed={ungrantedOnly}
			title="Show only the capabilities no {scope === 'end-user' ? 'end-user' : 'admin'} role can reach"
			class="flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[11px] font-medium transition {ungrantedOnly
				? 'border-danger-300 bg-danger-50 text-danger-600'
				: 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-700'}"
		>
			<Icon name="filter" size={12} />
			Ungranted
			<span class="font-mono opacity-70">{ungrantedCount}</span>
		</button>

		{#if query || ungrantedOnly}
			<span class="text-[11px] text-ink-400">{capCount} of {allRows.length}</span>
			<button
				type="button"
				onclick={() => {
					query = '';
					ungrantedOnly = false;
				}}
				class="text-[11px] font-medium text-brand-500 hover:text-brand-600"
			>
				Clear
			</button>
		{/if}
	</div>

	{#if visibleRoles.length === 0}
		<div class="px-5 py-10 text-center text-sm italic text-ink-400">
			No {scope === 'end-user' ? 'End-User' : 'Admin'} role defined yet. Add one from the
			<span class="font-medium text-ink-700">Users</span> page.
		</div>
	{:else}
		<!-- role column headers -->
		<div
			class="grid items-center gap-2 border-b border-line bg-surface-sunken px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500"
			style={matrixColsStyle}
		>
			<span>Capability</span>
			{#each visibleRoles as role (role.id)}
				<span class="flex flex-col items-center gap-1 text-center">
					<Icon name={scope === 'end-user' ? 'users' : 'shield'} size={11} />
					<GlossaryText
						class="truncate"
						text={role.name || 'Untitled'}
						onFix={({ original, canonical }) =>
							store.updateRole(role.id, 'name', replaceOccurrence(role.name || '', original, canonical))}
					/>
				</span>
			{/each}
			<span></span>
		</div>

		{#if groups.length === 0}
			<div class="px-5 py-10 text-center text-sm italic text-ink-400">
				No capability matches {query ? `“${query}”` : 'this filter'}.
			</div>
		{/if}

		{#each groups as group (group.key)}
			<!-- group header -->
			<div
				class="flex items-center gap-2 border-b border-line bg-surface-sunken/50 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500"
			>
				<Icon name={group.icon} size={11} />
				<GlossaryText text={group.title} />
				<span class="text-ink-400">· {group.rows.length}</span>
			</div>

			{#each group.rows as row (row.id)}
				{@const rowActions = store.actionsOf(row.id, row.source, row.suggestedKind)}
				{@const href = capabilityHref(projectId, row.id, row.source)}
				<div
					data-anchor={row.id}
					class="group/row grid items-center gap-2 border-b border-line px-5 py-2 last:border-b-0 hover:bg-surface-sunken/30"
					style={matrixColsStyle}
				>
					<span class="flex min-w-0 items-center gap-2 text-sm text-ink-700">
						<span class="size-1.5 shrink-0 rounded-full {group.bulletClass}"></span>
						<span class="flex min-w-0 flex-col">
							{#if href}
								<!-- The row is a capability that lives somewhere: open its editor
								     rather than making the reader hunt for it. -->
								<a
									{href}
									title={capabilityLinkLabel(row.source, row.surfaceKind === 'page')}
									class="flex min-w-0 items-center gap-1 text-ink-700 hover:text-brand-600"
								>
									<GlossaryText class="truncate" text={row.label} />
									<Icon
										name="arrow-up-right"
										size={11}
										class="shrink-0 text-ink-300 opacity-0 transition-opacity group-hover/row:opacity-100"
									/>
								</a>
							{:else}
								<GlossaryText class="truncate" text={row.label} />
							{/if}
							{#if row.path}
								<span class="truncate font-mono text-[10px] text-ink-400">{row.path}</span>
							{/if}
						</span>
						{#if row.surfaceKind && row.surfaceKind !== 'page'}
							<span
								class="shrink-0 rounded-pill bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-500"
							>
								{row.surfaceKind}
							</span>
						{/if}
						{#if row.orphan}
							<span
								class="shrink-0 rounded-pill bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium text-warning-500"
							>
								orphan
							</span>
						{/if}
						{#if row.capScope === 'both'}
							<span
								class="shrink-0 rounded-pill bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-500"
							>
								Shared
							</span>
						{/if}
					</span>

					{#each visibleRoles as role (role.id)}
						<!-- One checkbox per permission, labelled in place: the whole cell is
						     readable without a legend and one click away from any change. -->
						<!-- Capped so the checkboxes keep one size whether the scope has one
						     role column or five. -->
						<div class="mx-auto grid w-full max-w-[240px] grid-cols-3 gap-1">
							{#each rowActions as action (action)}
								{@const meta = ACTION_BY_CODE.get(action)}
								{@const granted = store.isGranted(role.id, row.id, action)}
								<button
									type="button"
									onclick={() => store.togglePermission(role.id, row.id, row.source, action)}
									aria-pressed={granted}
									title="{meta?.label}: {meta?.hint}"
									aria-label="{granted ? 'Revoke' : 'Grant'} {meta?.label} on {row.label} for {role.name ||
										'role'}"
									class="flex min-w-0 items-center gap-1 rounded-pill border px-1.5 py-0.5 text-[10px] font-medium transition {granted
										? 'border-success-300 bg-success-50 text-success-600'
										: 'border-line bg-surface text-ink-400 hover:border-line-strong hover:text-ink-700'}"
								>
									<span
										class="grid size-3 place-items-center rounded-sm border {granted
											? 'border-success-500 bg-success-500 text-white'
											: 'border-line-strong text-transparent'}"
									>
										<Icon name="check" size={7} />
									</span>
									<span class="truncate">{meta?.label}</span>
								</button>
							{/each}
						</div>
					{/each}

					<!-- orphan delete -->
					<div class="flex justify-end">
						{#if row.orphan}
							<button
								type="button"
								onclick={() => store.removeOffStructureCapability(row.id)}
								class="grid size-6 place-items-center rounded-md text-ink-400 opacity-0 transition hover:bg-danger-50 hover:text-danger-500 group-hover/row:opacity-100"
								aria-label="Delete orphan capability"
								title="Delete this orphan capability"
							>
								<Icon name="x" size={13} />
							</button>
						{/if}
					</div>
				</div>

			{/each}

			{#if group.key === 'off-structure'}
				<div class="border-b border-line px-5 py-2 last:border-b-0">
					<button
						type="button"
						onclick={() => {
							const label = prompt('Capability label:');
							if (label?.trim()) store.addOffStructureCapability(label.trim());
						}}
						class="flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-600"
					>
						<Icon name="plus" size={13} /> Off-structure capability
					</button>
				</div>
			{/if}
		{/each}
	{/if}
</div>
