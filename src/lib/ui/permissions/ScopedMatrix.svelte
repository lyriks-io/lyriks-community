<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Icon, VirtualList, clickedWithin, floatInView } from '$ui/design-system';
	import { anchorKeyFromUrl } from '$ui/shell/focus-field';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import { replaceOccurrence } from '$domain/glossary';
	import type { CapabilitySource } from '$domain/users';
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
		/** For an action row: the feature that declares it. */
		featureId?: string;
		/** The core-feature the row's feature hangs off, the first level of the matrix. */
		coreId?: string;
		coreLabel?: string;
		source: CapabilitySource;
		capScope: CapScope;
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
		/** Set when the group gathers the actions of one feature. */
		featureId?: string;
		/** The feature whose actions without access the heading counts, per role (see unsetKey). */
		unsetKey?: string;
		/** That feature's name, shown the way a core-feature line shows its own. */
		featureLabel?: string;
		/** The core-feature the group sits under when grouped by owner. */
		coreId?: string;
		coreLabel?: string;
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
	 * Every row this scope can show, flat: the actions of each feature (and a
	 * feature that declares none yet), nothing else. Pages, journeys, system and
	 * off-structure capabilities are not rows; grants already stored on them are
	 * left untouched. Grouping, search and filtering are all
	 * projections over this one list, so a row is described once and the three
	 * controls can never disagree about what exists.
	 */
	const allRows = $derived.by<Row[]>(() => {
		const rows: Row[] = [];
		const push = (row: Omit<Row, 'search'>) => {
			if (!keep(row.capScope)) return;
			rows.push({
				...row,
				search: `${row.label} ${row.ownerLabel} ${row.coreLabel ?? ''} ${row.typeLabel}`.toLowerCase()
			});
		};

		for (const c of store.derivedFeatures) {
			push({
				id: c.id,
				label: c.label,
				source: 'feature',
				capScope: inferCapScope('feature', c.label, c.sourceRefLabel),
				featureId: c.featureId,
				coreId: c.sourceRefId,
				coreLabel: c.sourceRefLabel,
				// A role is granted what it may do: each action is a row under its feature.
				typeLabel: c.featureId ? 'Actions' : 'Features',
				ownerLabel: c.featureLabel || c.label || 'Feature',
				icon: 'grid'
			});
		}
		return rows;
	});

	/* ─────────────────────────── Controls ───────────────────────────────── */
	let query = $state('');
	let groupBy = $state<'owner' | 'type' | 'none'>('owner');
	let ungrantedOnly = $state(false);
	let filterMenuOpen = $state(false);
	let filterMenuEl = $state<HTMLDivElement | null>(null);
	let filterPanel = $state<HTMLDivElement | null>(null);

	function closeFilterMenu(event: MouseEvent | KeyboardEvent) {
		if (!filterMenuOpen) return;
		if (event instanceof KeyboardEvent) {
			if (event.key === 'Escape') filterMenuOpen = false;
		} else if (!clickedWithin(event.target, filterMenuEl, filterPanel)) filterMenuOpen = false;
	}

	/** No role of this tab has access to this row: the gap worth hunting for. */
	function isUngranted(row: Row): boolean {
		return !visibleRoles.some((r) => store.hasAccess(r.id, row.id));
	}

	/**
	 * Which feature a row counts toward: its feature when it is an action, or
	 * itself when it is a feature that has no action rows yet.
	 */
	function unsetKey(row: Row): string | undefined {
		if (row.featureId) return row.featureId;
		return row.source === 'feature' ? row.id : undefined;
	}

	/**
	 * Per feature, per role: how many of its actions that role has no access to
	 * (criterion b31a4071). Counted over every row, not the filtered ones, so a
	 * search never makes a feature look more settled than it is.
	 */
	const unsetByFeature = $derived.by(() => {
		const counts = new Map<string, Map<string, number>>();
		for (const row of allRows) {
			const key = unsetKey(row);
			if (!key) continue;
			const perRole = counts.get(key) ?? new Map<string, number>();
			for (const role of visibleRoles) {
				if (!store.hasAccess(role.id, row.id)) perRole.set(role.id, (perRole.get(role.id) ?? 0) + 1);
			}
			counts.set(key, perRole);
		}
		return counts;
	});

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
					featureId: groupBy === 'owner' ? row.featureId : undefined,
					unsetKey: groupBy === 'owner' ? unsetKey(row) : undefined,
					featureLabel: groupBy === 'owner' && row.source === 'feature' ? row.ownerLabel : undefined,
					coreId: groupBy === 'owner' ? row.coreId : undefined,
					coreLabel: groupBy === 'owner' ? row.coreLabel : undefined,
					icon: row.icon,
					bulletClass: BULLET[row.source],
					rows: [row]
				});
		}
		return [...buckets.values()];
	});

	const capCount = $derived(visibleRows.length);


	/**
	 * A persona column holds one access box per row (criterion 985ae61e): a grant
	 * carries no verb. Wide enough for the persona's name over its boxes, and for
	 * the "3 no access" count of a folded feature.
	 */
	const PERSONA_COL_PX = 112;
	/**
	 * A persona's cell on the action rows:
	 * ruled off on its left over the line's full height, so a box is never read
	 * against the neighbouring persona.
	 */
	const PERSONA_CELL = 'flex items-center justify-center self-stretch -my-2 py-2 border-l border-line';
	/** The same cell on a feature heading, unruled so the heading reads across the matrix. */
	const HEADING_PERSONA_CELL = 'flex items-center justify-center';
	/** What a Shared row means, from the side of the tab being read. */
	const sharedHint = $derived(
		scope === 'end-user'
			? 'Shared: this action concerns end users and admins alike, so it is listed in both matrices. The access set here applies to End-User personas only; Admin personas are set in the Admins matrix.'
			: 'Shared: this action concerns end users and admins alike, so it is listed in both matrices. The access set here applies to Admin personas only; End-User personas are set in the End-Users matrix.'
	);

	/* Grouped by owner, the matrix reads like the feature tree: core-feature,
	   then feature, then its actions. It opens folded on the core-features; a
	   chevron unfolds one level. A search or the Ungranted filter unfolds what
	   holds a match when it starts or changes, never pins it open, and the
	   matrix as it was comes back once it clears. A link to one row unfolds its
	   core-feature and its feature. */
	interface CoreGroup {
		key: string;
		title: string;
		groups: Group[];
	}
	const cores = $derived.by<CoreGroup[] | null>(() => {
		if (groupBy !== 'owner') return null;
		const byCore = new Map<string, CoreGroup>();
		for (const group of groups) {
			const key = `core:${group.coreId ?? 'none'}`;
			const core = byCore.get(key);
			if (core) core.groups.push(group);
			else
				byCore.set(key, {
					key,
					title: group.coreLabel || 'No core-feature',
					groups: [group]
				});
		}
		return [...byCore.values()];
	});
	const coreKeyOf = (group: Group): string => `core:${group.coreId ?? 'none'}`;
	let openGroups = $state<Record<string, boolean>>({});
	const toggleGroup = (key: string) => (openGroups[key] = !openGroups[key]);
	let beforeNarrowing: Record<string, boolean> | null = null;
	const narrowingKey = $derived(
		query.trim() || ungrantedOnly ? JSON.stringify([query.trim(), ungrantedOnly]) : ''
	);
	$effect(() => {
		const key = narrowingKey;
		untrack(() => {
			if (key) {
				beforeNarrowing ??= { ...openGroups };
				for (const group of groups) {
					openGroups[group.key] = true;
					openGroups[coreKeyOf(group)] = true;
				}
			} else if (beforeNarrowing) {
				openGroups = beforeNarrowing;
				beforeNarrowing = null;
			}
		});
	});
	$effect(() => {
		const anchor = anchorKeyFromUrl(page.url);
		if (!anchor) return;
		untrack(() => {
			const group = groups.find((g) => g.rows.some((r) => r.id === anchor));
			if (!group) return;
			openGroups[group.key] = true;
			openGroups[coreKeyOf(group)] = true;
		});
	});

	type MatrixItem =
		| { kind: 'core'; core: CoreGroup }
		| { kind: 'header'; group: Group }
		| { kind: 'row'; group: Group; row: Row };
	/** One group as items: its heading, then its rows while it is unfolded. */
	const groupItems = (group: Group): MatrixItem[] => [
		{ kind: 'header', group },
		...(openGroups[group.key]
			? group.rows.map((row): MatrixItem => ({ kind: 'row', group, row }))
			: [])
	];
	/** Everything the list shows, flat: core-features, their features while unfolded, their rows. */
	const matrixItems = $derived.by<MatrixItem[]>(() =>
		cores
			? cores.flatMap((core): MatrixItem[] => [
					{ kind: 'core', core },
					...(openGroups[core.key] ? core.groups.flatMap(groupItems) : [])
				])
			: groups.flatMap(groupItems)
	);
	const itemKey = (item: MatrixItem): string =>
		item.kind === 'row'
			? `row:${item.row.id}`
			: item.kind === 'core'
				? item.core.key
				: `header:${item.group.key}`;
	/** A row's height before it is drawn: one line, one access box per persona. */
	const itemEstimate = (item: MatrixItem): number => (item.kind === 'core' ? 45 : item.kind === 'row' ? 41 : 37);
	/** A deep link ("Fix now") to a row: the list draws it and scrolls to it. */
	const revealItemKey = $derived.by(() => {
		const anchor = anchorKeyFromUrl(page.url);
		return anchor ? `row:${anchor}` : null;
	});

	const GROUP_MODES = [
		{ code: 'owner' as const, label: 'Owner', hint: 'Group by the feature that owns the action, or the bucket that owns the row' },
		{ code: 'type' as const, label: 'Type', hint: 'Group by System / Actions / Journeys / Surfaces' },
		{ code: 'none' as const, label: 'None', hint: 'One flat list' }
	];

	const projectId = $derived(page.params.projectId ?? '');

	// Dynamic column count: interpolated grid-cols are never emitted by
	// Tailwind's static scan, so set grid-template-columns inline. A persona
	// column holds one access box per row, so the capability column takes
	// whatever is left.
	const matrixColsStyle = $derived(
		visibleRoles.length === 0
			? 'grid-template-columns: 1fr;'
			: `grid-template-columns: minmax(160px,1fr) repeat(${visibleRoles.length}, ${PERSONA_COL_PX}px);`
	);
</script>

<svelte:window onclick={closeFilterMenu} onkeydown={closeFilterMenu} />

<!-- No overflow-hidden on the card itself: the Filter menu must open past its edge. -->
<div class="rounded-card border border-line bg-surface">
	<!-- matrix header -->
	<div
		class="flex flex-wrap items-center justify-between gap-4 rounded-t-card border-b border-line px-5 py-4 {scope ===
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
				<p class="text-[0.6875rem] text-ink-500">
					{scope === 'end-user'
						? 'Outside-in capabilities · customers, buyers, public personas'
						: 'Inside-out capabilities · admins, support, internal operators'}
				</p>
			</div>
		</div>
		<div class="text-right text-[0.6875rem] text-ink-500">
			<p>{capCount} capabilities · {visibleRoles.length} role{visibleRoles.length === 1 ? '' : 's'}</p>
			<!-- No legend: every checkbox is labelled where it is clicked. -->
			<p class="mt-1 hidden text-[0.625rem] text-ink-400">
				Tick who has access to each action · hover a box for what it says
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
				placeholder="Search a feature or an action…"
				class="w-full rounded-field border border-line bg-surface py-1.5 pl-7 pr-7 text-[0.75rem] text-ink-900 placeholder:text-ink-400 hover:border-line-strong focus:border-brand-400"
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

		<!-- Grouping waits behind one Filter button, the way other boards keep their
		     toolbar a single quiet row. The count says the view departs from Owner. -->
		<div class="relative" bind:this={filterMenuEl}>
			<button
				type="button"
				onclick={() => (filterMenuOpen = !filterMenuOpen)}
				aria-expanded={filterMenuOpen}
				aria-haspopup="dialog"
				class="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[0.6875rem] font-medium transition {groupBy !==
				'owner'
					? 'border-brand-300 bg-brand-50 text-brand-600'
					: 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-700'}"
			>
				<Icon name="sliders" size={12} />
				Filter
				{#if groupBy !== 'owner'}
					<span class="rounded-pill bg-brand-500 px-1.5 text-[0.625rem] font-semibold tabular-nums text-white">1</span>
				{/if}
				<Icon name="chevron-down" size={11} class="text-ink-400" />
			</button>
			{#if filterMenuOpen}
				<div bind:this={filterPanel} use:floatInView={{ anchor: filterMenuEl, align: 'left' }}
					role="dialog"
					aria-label="Filter"
					class="w-56 rounded-card border border-line bg-surface p-3 shadow-xl"
				>
					<p class="mb-1.5 flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400">
						<Icon name="layers" size={12} /> Group by
					</p>
					<div class="flex flex-col gap-0.5">
						{#each GROUP_MODES as mode (mode.code)}
							<button
								type="button"
								onclick={() => {
									groupBy = mode.code;
									filterMenuOpen = false;
								}}
								aria-pressed={groupBy === mode.code}
								class="flex flex-col rounded-field px-2 py-1.5 text-left transition {groupBy === mode.code
									? 'bg-brand-50 text-brand-600'
									: 'text-ink-700 hover:bg-surface-sunken'}"
							>
								<span class="text-[0.75rem] font-medium">{mode.label}</span>
								<span class="text-[0.625rem] text-ink-400">{mode.hint}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- The one place the gap is read: red while any row of this tab is held by no
		     role, and one click narrows the matrix to those rows to grant them in place. -->
		<button
			type="button"
			onclick={() => (ungrantedOnly = !ungrantedOnly)}
			aria-pressed={ungrantedOnly}
			title="Show only the capabilities no {scope === 'end-user' ? 'end-user' : 'admin'} role can reach"
			class="flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[0.6875rem] font-medium transition {ungrantedOnly
				? 'border-danger-600 bg-danger-600 text-white hover:bg-danger-700'
				: ungrantedCount > 0
					? 'border-danger-300 bg-danger-50 text-danger-600 hover:border-danger-400'
					: 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-700'}"
		>
			<Icon name="filter" size={12} />
			Ungranted
			<span class="font-mono {ungrantedCount > 0 ? 'font-semibold' : 'opacity-70'}">{ungrantedCount}</span>
		</button>

		{#if query || ungrantedOnly}
			<span class="text-[0.6875rem] text-ink-400">{capCount} of {allRows.length}</span>
			<button
				type="button"
				onclick={() => {
					query = '';
					ungrantedOnly = false;
				}}
				class="text-[0.6875rem] font-medium text-brand-500 hover:text-brand-600"
			>
				Clear
			</button>
		{/if}
	</div>

	<!-- No overflow-hidden here: it would make this box the scroll container
	     and break the page's own pinned header above the matrix. -->
	<div class="rounded-b-card">
		{#if visibleRoles.length === 0}
			<div class="px-5 py-10 text-center text-sm italic text-ink-400">
				No {scope === 'end-user' ? 'End-User' : 'Admin'} role defined yet. Add one from the
				<span class="font-medium text-ink-700">Users</span> page.
			</div>
		{:else}
			{#if groups.length === 0}
				<div class="px-5 py-10 text-center text-sm italic text-ink-400">
					No capability matches {query ? `“${query}”` : 'this filter'}.
				</div>
			{/if}

			<!-- Only the rows near the visible part of the page are drawn: a large
			     product holds thousands of them, and drawing all froze the page. -->
			<VirtualList items={matrixItems} key={itemKey} estimate={itemEstimate} revealKey={revealItemKey}>
				{#snippet children(item: MatrixItem)}
					{#if item.kind === 'core'}
						{@const core = item.core}
						{@const coreOpen = !!openGroups[core.key]}
						<!-- A core-feature line, the first level: its name alone. -->
						<div class="flex items-center gap-2 border-b border-line bg-surface px-5 py-3">
							<button
								type="button"
								onclick={() => toggleGroup(core.key)}
								class="grid size-4 shrink-0 place-items-center text-ink-400 hover:text-ink-700"
								aria-label={coreOpen ? 'Fold core-feature' : 'Unfold core-feature'}
								aria-expanded={coreOpen}
							>
								<Icon
									name="chevron-right"
									size={13}
									class="transition-transform {coreOpen ? 'rotate-90' : ''}"
								/>
							</button>
							<GlossaryText class="min-w-0 truncate text-sm font-semibold text-ink-900" text={core.title} />
						</div>
					{:else if item.kind === 'header'}
						{@const group = item.group}
				<!-- group header. Unfolded, a feature's heading names each persona over
				     its boxes; folded, it counts per persona the actions it has no access
				     to, so it says where access is missing, and a settled one shows nothing. -->
				<div
					class="grid items-center gap-2 border-b border-line bg-surface-sunken/50 px-5 py-2 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-500"
					style={group.unsetKey ? matrixColsStyle : undefined}
				>
					<span class="flex min-w-0 items-center gap-2 {cores ? 'pl-6' : ''}">
						<button
							type="button"
							onclick={() => toggleGroup(group.key)}
							class="grid size-4 shrink-0 place-items-center text-ink-400 hover:text-ink-700"
							aria-label={openGroups[group.key] ? 'Fold group' : 'Unfold group'}
							aria-expanded={!!openGroups[group.key]}
						>
							<Icon
								name="chevron-right"
								size={13}
								class="transition-transform {openGroups[group.key] ? 'rotate-90' : ''}"
							/>
						</button>
						{#if group.featureLabel}
							<!-- The name alone: indentation under its core-feature says the level. -->
							<GlossaryText
								class="min-w-0 truncate text-[0.8125rem] font-medium normal-case tracking-normal text-ink-800"
								text={group.featureLabel}
							/>
						{:else}
							<Icon name={group.icon} size={11} />
							<GlossaryText text={group.title} />
							<span class="text-ink-400">· {group.rows.length}</span>
						{/if}
					</span>
					{#if group.unsetKey}
						{#each visibleRoles as role (role.id)}
							{@const unset = unsetByFeature.get(group.unsetKey)?.get(role.id) ?? 0}
							<span class={HEADING_PERSONA_CELL}>
								{#if openGroups[group.key]}
									<!-- Unfolded, the heading names the persona right above its boxes. -->
									<span
										class="flex min-w-0 items-center gap-1"
										title={role.behaviorValues?.length
											? `Read by the behaviour as ${role.behaviorValues.map((v) => `${v.path} = ${JSON.stringify(v.value)}`).join(', ')}`
											: undefined}
									>
										<Icon name={scope === 'end-user' ? 'users' : 'shield'} size={11} class="shrink-0" />
										<GlossaryText
											class="truncate"
											text={role.name || 'Untitled'}
											onFix={({ original, canonical }) =>
												store.updateRole(role.id, 'name', replaceOccurrence(role.name || '', original, canonical))}
										/>
									</span>
								{:else if unset > 0}
									<span
										class="rounded-pill bg-warning-50 px-2 py-0.5 normal-case tracking-normal text-warning-600 tabular-nums"
										title="{role.name || 'This role'} has no access to {unset} {unset === 1
											? 'action'
											: 'actions'} of this feature"
									>
										{unset} no access
									</span>
								{/if}
							</span>
						{/each}
					{/if}
				</div>

					{:else if item.kind === 'row'}
						{@const group = item.group}
						{@const row = item.row}
					{@const href = capabilityHref(projectId, row.id, row.source)}
					<div
						data-anchor={row.id}
						class="group/row grid items-center gap-2 border-b border-line px-5 py-2 last:border-b-0 hover:bg-surface-sunken/30"
						style={matrixColsStyle}
					>
						<span class="flex min-w-0 items-center gap-2 text-sm text-ink-700 {cores ? 'pl-12' : ''}">
							<span class="size-1.5 shrink-0 {group.bulletClass}"></span>
							<span class="flex min-w-0 flex-col">
								{#if href}
									<!-- The row is a capability that lives somewhere: open its editor
									     rather than making the reader hunt for it. -->
									<a
										{href}
										title={capabilityLinkLabel(row.source, false)}
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
							</span>
							{#if row.capScope === 'both'}
								<span
									class="ml-auto shrink-0 cursor-help rounded-pill bg-brand-50 px-1.5 py-0.5 text-[0.625rem] font-medium text-brand-500"
									title={sharedHint}
								>
									Shared
								</span>
							{/if}
						</span>

						{#each visibleRoles as role (role.id)}
							{@const granted = store.hasAccess(role.id, row.id)}
							{@const who = role.name || 'this role'}
							<!-- One access box per persona, filled with a check when the persona
							     has access (criterion 985ae61e): a grant carries no verb. -->
							<div class={PERSONA_CELL}>
								<button
									type="button"
									onclick={() => store.toggleAccess(role.id, row.id, row.source)}
									aria-pressed={granted}
									title="{granted ? `${who} has access to` : `${who} has no access to`} {row.label}"
									aria-label="{granted ? 'Take back' : 'Grant'} access to {row.label} for {who}"
									class="mx-auto grid size-[22px] place-items-center rounded-md border transition {granted
										? 'border-success-500 bg-success-500 text-white hover:bg-success-600'
										: 'border-line-strong bg-surface text-transparent hover:border-ink-400 hover:text-ink-300'}"
								>
									<Icon name="check" size={13} />
								</button>
							</div>
						{/each}

					</div>
					{/if}
				{/snippet}
			</VirtualList>
		{/if}
	</div>
</div>
