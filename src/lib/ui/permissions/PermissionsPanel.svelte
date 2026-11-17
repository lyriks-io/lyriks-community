<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '$ui/design-system';
	import type { UsersStore } from '$ui/users/draft-store.svelte';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import ScopedMatrix from './ScopedMatrix.svelte';
	import { inferCapScope, roleClass, type RoleClass } from './scope';

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

	const navGroups = $derived<SectionNavGroup[]>([
		{
			label: 'Access matrix',
			items: [
				{
					id: 'end-user',
					label: 'End-Users',
					hint: 'Outside-in capabilities',
				},
				{
					id: 'admin',
					label: 'Admins',
					hint: 'Inside-out capabilities',
				}
			]
		}
	]);

	const roleCount = $derived(store.draft.roles.length);
	const grantCount = $derived(store.draft.permissions.length);
	const derivedCount = $derived(
		store.derivedFeatures.length + store.derivedJourneys.length + store.derivedSurfaces.length
	);

	const endUserRoleCount = $derived(
		store.draft.roles.filter((r) => roleClass(r.tone) === 'end-user').length
	);
	const adminRoleCount = $derived(roleCount - endUserRoleCount);

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
		{roleCount} roles ({endUserRoleCount} end-user / {adminRoleCount} admin) · {grantCount} access grants.
		Roles are owned by the Personas tab; this tab never edits roles. Tick who has access to each
		action: one box per role, no verb to choose. Adding, editing or deleting something are actions
		of their own, each with its row.
	</span>
</div>

<!-- A role that holds nothing at all is powerless: flag it with its one-click fix.
     Capabilities no role holds are not listed here; the matrix toolbar's Ungranted
     filter narrows the rows to them, where each is granted in place. -->
{#if orphanRoles.length > 0}
	<div
		class="mb-6 flex items-start gap-3 rounded-card border border-danger-300 bg-danger-50/60 px-4 py-3 text-xs text-danger-700"
		role="alert"
	>
		<Icon name="info" size={16} />
		<div class="min-w-0">
			<p class="font-semibold">
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
		</div>
	</div>
{/if}

<!-- Retired from the screen (spec: criterion b150e01c): the rows are re-derived on every
     load. Pass it back as the SectionNav `footer` to show the manual refresh again. -->
{#snippet refreshDerived()}
	<button
		type="button"
		onclick={() => invalidateAll()}
		class="flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-[0.6875rem] font-medium text-ink-600 transition hover:bg-surface-sunken hover:text-ink-900"
		title="Re-pull feature-, journey- and surface-derived rows from upstream"
	>
		<Icon name="rotate" size={14} /> Refresh derived
	</button>
{/snippet}

<!-- Scope switcher as the section's second-level nav (same chrome as Foundation's
     Ops tab), with the matrix as its content. data-anchor lets a "Fix now"
     deep-link scroll to + flash the matrix. -->
<SectionNav groups={navGroups} active={scopeTab} onSelect={(id) => (scopeTab = id as RoleClass)}>
	<div data-anchor="access-matrix">
		{#if scopeTab === 'end-user'}
			<ScopedMatrix {store} scope="end-user" />
		{:else}
			<ScopedMatrix {store} scope="admin" />
		{/if}
	</div>
</SectionNav>
