<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '$ui/design-system';
	import { flashElement } from '$ui/shell/focus-field';
	import type { UsersStore } from '$ui/users/draft-store.svelte';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import ScopedMatrix from './ScopedMatrix.svelte';
	import { inferCapScope, roleClass, type CapScope, type RoleClass } from './scope';

	interface Props {
		store: UsersStore;
	}
	let { store }: Props = $props();

	// A graph/search deep-link (`?node=<capabilityId>`) must open the scope tab
	// that actually shows that row — the matrix renders one scope at a time.
	const deepLinkCapId = page.url.searchParams.get('node');
	const deepLinkScope = ((): RoleClass | null => {
		if (!deepLinkCapId) return null;
		const sys = store.systemCapabilities.find((c) => c.id === deepLinkCapId);
		if (sys) return inferCapScope('system', sys.label) === 'admin' ? 'admin' : 'end-user';
		const feat = store.derivedFeatures.find((c) => c.id === deepLinkCapId);
		if (feat) return inferCapScope('feature', feat.label, feat.sourceRefLabel) === 'admin' ? 'admin' : 'end-user';
		const jr = store.derivedJourneys.find((c) => c.id === deepLinkCapId);
		if (jr) return inferCapScope('journey', jr.label, jr.sourceRefLabel) === 'admin' ? 'admin' : 'end-user';
		const srf = store.derivedSurfaces.find((c) => c.id === deepLinkCapId);
		if (srf) return inferCapScope('surface', srf.label, srf.sourceRefLabel) === 'admin' ? 'admin' : 'end-user';
		const off = store.draft.offStructureCapabilities.find((c) => c.id === deepLinkCapId);
		if (off) return inferCapScope('off_structure', off.label || '') === 'admin' ? 'admin' : 'end-user';
		return null;
	})();
	let scopeTab = $state<RoleClass>(deepLinkScope ?? 'end-user');
	// The matrix wrapper — a per-capability banner chip flashes it after switching
	// to the scope that holds the uncovered row (see `focusCapability`).
	let matrixEl = $state<HTMLElement>();

	/** Count capabilities visible in a given scope — for the tab badges. */
	function countForScope(scope: RoleClass): number {
		const keep = (s: CapScope) => s === scope || s === 'both';
		let n = 0;
		for (const c of store.systemCapabilities)
			if (keep(inferCapScope('system', c.label))) n++;
		for (const c of store.derivedFeatures)
			if (keep(inferCapScope('feature', c.label, c.sourceRefLabel))) n++;
		for (const c of store.derivedJourneys)
			if (keep(inferCapScope('journey', c.label, c.sourceRefLabel))) n++;
		for (const c of store.derivedSurfaces)
			if (keep(inferCapScope('surface', c.label, c.sourceRefLabel))) n++;
		for (const c of store.draft.offStructureCapabilities)
			if (keep(inferCapScope('off_structure', c.label || ''))) n++;
		return n;
	}

	const navGroups = $derived<SectionNavGroup[]>([
		{
			label: 'Access matrix',
			items: [
				{
					id: 'end-user',
					icon: 'users',
					label: 'End-Users',
					hint: 'Outside-in capabilities',
					count: countForScope('end-user')
				},
				{
					id: 'admin',
					icon: 'shield',
					label: 'Admins',
					hint: 'Inside-out capabilities',
					count: countForScope('admin')
				}
			]
		}
	]);

	const roleCount = $derived(store.draft.roles.length);
	const grantCount = $derived(store.draft.permissions.length);
	const derivedCount = $derived(
		store.derivedFeatures.length + store.derivedJourneys.length + store.derivedSurfaces.length
	);

	// Coherence error surfaced inline: a feature no role can perform is reachable
	// by nobody. Lead with features (the matrix's purpose); count the rest.
	const uncoveredFeatures = $derived(store.uncoveredCapabilities.filter((c) => c.source === 'feature'));
	const uncoveredOther = $derived(store.uncoveredCapabilities.filter((c) => c.source !== 'feature'));
	const endUserRoleCount = $derived(
		store.draft.roles.filter((r) => roleClass(r.tone) === 'end-user').length
	);
	const adminRoleCount = $derived(roleCount - endUserRoleCount);

	type UncoveredCap = (typeof store.uncoveredCapabilities)[number];

	/** Banner chip → reveal an uncovered row: switch to the scope tab that shows
	    it (mirrors ScopedMatrix's filter), then flash the matrix. */
	function focusCapability(c: UncoveredCap) {
		scopeTab = inferCapScope(c.source, c.label) === 'admin' ? 'admin' : 'end-user';
		flashElement(matrixEl);
	}

	const projectId = $derived(page.params.projectId);

	// The mirror image of an uncovered feature: a role that holds no grant at all
	// is powerless. Its next-best-action is the opposite one — author a feature it
	// can use — so the banner offers a per-role shortcut into Features' create mode.
	const orphanRoles = $derived(
		store.draft.roles.filter((r) => !store.draft.permissions.some((p) => p.roleId === r.id))
	);

	/** Deep-link into Features' create mode, noting the role it's for (informational
	    — the grant itself is still authored in the matrix, never mutated here). */
	function featuresNewHref(roleName?: string): string | undefined {
		if (!projectId) return undefined;
		const forParam = roleName ? `&for=${encodeURIComponent(roleName)}` : '';
		return `/projects/${projectId}/features?new=1${forParam}`;
	}
</script>

<!-- summary strip -->
<div
	class="mb-6 hidden flex-wrap items-center gap-3 rounded-card border border-line bg-brand-50/40 px-4 py-3 text-xs text-ink-700"
>
	<Icon name="info" size={14} />
	<span>
		<strong class="font-semibold">Derived matrix.</strong>
		{derivedCount} derived capabilities ({store.derivedSurfaces.length} surfaces) ·
		{store.systemCapabilities.length} system actions ·
		{roleCount} roles ({endUserRoleCount} end-user / {adminRoleCount} admin) · {grantCount} grants.
		Roles are owned by the Personas tab; this tab never edits roles. Tick what each role may do:
		<strong class="font-semibold">Visible</strong> decides whether the capability is reachable at
		all (on a surface, whether the role can open the page), and Create / Read / Update / Delete
		cover what it may then do with the data behind it.
	</span>
</div>

<!-- coherence error: capabilities (features first) no role can perform. Each name
     is a chip that jumps to (and flashes) its row in the matrix below. -->
{#if uncoveredFeatures.length > 0 || uncoveredOther.length > 0 || orphanRoles.length > 0}
	{#snippet capChip(c: UncoveredCap)}
		<button
			type="button"
			onclick={() => focusCapability(c)}
			class="rounded-pill border border-danger-300 bg-surface px-2 py-0.5 font-medium text-danger-700 transition hover:border-danger-400 hover:bg-danger-50"
			title="Show “{c.label}” in the matrix"
		>
			{c.label}
		</button>
	{/snippet}
	<div
		class="mb-6 flex items-start gap-3 rounded-card border border-danger-300 bg-danger-50/60 px-4 py-3 text-xs text-danger-700"
		role="alert"
	>
		<Icon name="info" size={16} />
		<div class="min-w-0">
			{#if uncoveredFeatures.length > 0}
				<p class="font-semibold">
					{uncoveredFeatures.length}
					{uncoveredFeatures.length === 1 ? 'feature has' : 'features have'} no user right -
					no role can use {uncoveredFeatures.length === 1 ? 'it' : 'them'}. Grant each to at least
					one role below.
				</p>
				<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
					{#each uncoveredFeatures as c (c.id)}{@render capChip(c)}{/each}
				</div>
				<!-- Next best action for a feature nobody holds: jump straight to the
				     matrix row where you grant it. -->
				<button
					type="button"
					onclick={() => uncoveredFeatures[0] && focusCapability(uncoveredFeatures[0])}
					class="mt-2 inline-flex items-center gap-1 rounded-pill bg-danger-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-danger-700"
				>
					<Icon name="arrow-right" size={12} /> Grant to a role
				</button>
			{/if}
			{#if uncoveredOther.length > 0}
				<p class="mt-2 text-danger-600">Also ungranted:</p>
				<div class="mt-1.5 flex flex-wrap gap-1.5">
					{#each uncoveredOther as c (c.id)}{@render capChip(c)}{/each}
				</div>
			{/if}
			{#if orphanRoles.length > 0}
				<p class="mt-3 font-semibold">
					{orphanRoles.length}
					{orphanRoles.length === 1 ? 'role has' : 'roles have'} no access -
					give {orphanRoles.length === 1 ? 'it' : 'each'} a feature to use.
				</p>
				<!-- Mirror next best action: author a feature for the powerless role. Each
				     chip deep-links to Features' create mode, scoped to that role. -->
				<div class="mt-1.5 flex flex-wrap gap-1.5">
					{#each orphanRoles as r (r.id)}
						<a
							href={featuresNewHref(r.name || 'unnamed role')}
							class="inline-flex items-center gap-1 rounded-pill bg-danger-600 px-2.5 py-1 font-semibold text-white transition hover:bg-danger-700"
							title="Create a feature for {r.name || 'this role'}"
						>
							<Icon name="plus" size={12} /> New feature for {r.name || 'this role'}
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Scope switcher as the section's second-level nav (same chrome as Foundation's
     Ops tab), with the matrix as its content. data-anchor lets a "Fix now"
     deep-link (and the banner chips above) scroll to + flash the matrix. -->
<SectionNav groups={navGroups} active={scopeTab} onSelect={(id) => (scopeTab = id as RoleClass)}>
	{#snippet footer()}
		<!-- Refresh Derived Capabilities -->
		<button
			type="button"
			onclick={() => invalidateAll()}
			class="flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-[11px] font-medium text-ink-600 transition hover:bg-surface-sunken hover:text-ink-900"
			title="Re-pull feature-, journey- and surface-derived rows from upstream"
		>
			<Icon name="rotate" size={14} /> Refresh derived
		</button>
	{/snippet}
	<div bind:this={matrixEl} data-anchor="access-matrix">
		{#if scopeTab === 'end-user'}
			<ScopedMatrix {store} scope="end-user" />
		{:else}
			<ScopedMatrix {store} scope="admin" />
		{/if}
	</div>
</SectionNav>
