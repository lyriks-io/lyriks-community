<script lang="ts">
	import { untrack } from 'svelte';
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import { page } from '$app/state';
	import { Icon } from '$ui/design-system';
	import { UsersStore } from '$ui/users/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import { anchorKeyFromUrl, focusField } from '$ui/shell/focus-field';
	import RoleClassPanels from '$ui/users/RoleClassPanels.svelte';
	import PermissionsPanel from '$ui/permissions/PermissionsPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const store = untrack(
		() =>
			new UsersStore(data.draft, data.derived, data.session, toastNotifier, data.revision)
	);

	// Live refresh from the project's change stream (see project +layout.svelte).
	$effect(() => {
		store.hydrate(data.draft, data.revision);
		store.setDerived(data.derived);
	});

	const projectName = $derived(data.productName);

	// Two tabs on one screen (prototype's "Users & Permissions"). Deep-link the
	// access matrix via ?tab=permissions so Control Center "Fix now" lands on it.
	type Tab = 'personas' | 'permissions';
	let tab = $state<Tab>(page.url.searchParams.get('tab') === 'permissions' ? 'permissions' : 'personas');

	const tabs: { id: Tab; label: string; eyebrow: string; icon: 'users' | 'shield'; count: number }[] =
		$derived([
			{ id: 'personas', label: 'Personas', eyebrow: 'End-users & admins', icon: 'users', count: store.draft.roles.length },
			{ id: 'permissions', label: 'Access matrix', eyebrow: 'Capabilities × roles', icon: 'shield', count: store.draft.permissions.length }
		]);

	// Deep-link jump target ("Fix now" from Global Coherence): the `use:focusField`
	// below flashes the matching `data-anchor` field once the page has landed.
	const focusKey = $derived(anchorKeyFromUrl(page.url));

</script>

<svelte:head>
	<title>{projectName} · Users & Permissions · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5" use:focusField={focusKey}>
		<PageHeading
			eyebrow="Users & Permissions"
			title="Who are the users, and who can do what."
			description="Define the personas - End-Users (outside-in) and Admins (inside-out) - then set the access matrix that grants each capability to a role. Personas flow downstream to Features, Journeys and the Behavior editor; the matrix columns are these same roles."
			help={CAPABILITY_HELP.users}
			class="mb-6"
		/>

		<!-- Primary tab switcher — white bar, gradient pill on the active tab. -->
		<div
			class="mb-6 inline-flex flex-wrap gap-1 rounded-card border border-line bg-surface p-1.5"
			role="tablist"
		>
			{#each tabs as t (t.id)}
				{@const isActive = t.id === tab}
				<button
					type="button"
					role="tab"
					aria-selected={isActive}
					onclick={() => (tab = t.id)}
					class="flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-left transition {isActive
						? 'gradient-violet text-white shadow-md shadow-brand-500/20'
						: 'text-ink-500 hover:bg-surface-sunken'}"
				>
					<Icon name={t.icon} size={16} />
					<span class="text-left">
						<span class="block text-sm font-semibold leading-tight">{t.label}</span>
						<span class="block text-[10px] leading-tight {isActive ? 'text-white/75' : 'text-ink-400'}">
							{t.eyebrow}
						</span>
					</span>
					<span
						class="ml-1 rounded px-1.5 py-0.5 font-mono text-[10px] {isActive
							? 'bg-white/15 text-white'
							: 'bg-surface-sunken text-ink-500'}"
					>
						{t.count}
					</span>
				</button>
			{/each}
		</div>

		{#if tab === 'personas'}
			<RoleClassPanels {store} suggestions={data.personaSuggestions} focusId={focusKey} />
		{:else}
			<PermissionsPanel {store} />
		{/if}
	</div>
</div>

<SaveBar saveStatus={store.saveStatus} coherence={store.coherence} />
