<script lang="ts">
	import { anchorOf } from '$domain/discussions';
	import { USER_SEARCH_FROM } from '$application/spec360/users';
	import { SearchInput, matchesQuery } from '$ui/design-system';
	import MatrixTable from '$ui/spec360/MatrixTable.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SectionBox from '$ui/spec360/page/SectionBox.svelte';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { PermissionTicks } from '$ui/spec360/permission-ticks.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import type { PageData } from './$types';

	/**
	 * Who can do what on its own page (criterion 5787390d), opened from Users
	 * and permissions: every user against every action, the end users first;
	 * a search narrows the columns past 8 users, a user's name opens its page,
	 * and while a draft a cell is ticked in place in the Edit mode (criteria
	 * eba33558, 41514698). The permissions are validated here too; they are
	 * discussed on the list, where the head's comments lead.
	 */
	let { data }: { data: PageData } = $props();
	const base = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);
	const edits = useEdits();
	const validation = useValidation();
	const ticks = new PermissionTicks(edits);
	const mode = useEditMode();
	// Who can do what is ticked while the specification is a draft (criterion 9b3e04e1, 611e98cb on hold), in the
	// page's Edit mode (criterion 41514698).
	const tickable = $derived(validation.draft && validation.source.canWrite && mode.active);
	const userHref = (userId: string) => `${base}/users/${encodeURIComponent(userId)}`;

	let query = $state('');
	const named = $derived(data.users.users.map((u) => ({ ...u, name: edits.shown(anchorOf('role', u.id), { text: u.name }).text })));
	const searchable = $derived(named.length >= USER_SEARCH_FROM);
	const columns = $derived(searchable ? named.filter((u) => matchesQuery(query, u.name)) : named);
	const lead = $derived(
		`Every action of ${data.spec.productName} against every profile. Green: allowed, grey: restricted.${tickable ? ' Click a cell to grant the action or take it back.' : ''}`
	);
</script>

{#snippet tools()}
	<AskAiTool anchor="permissions" title="Permissions" subject="who can do what" />
{/snippet}

<section aria-label="Who can do what" class="flex flex-col">
	<!-- Who can do what is the element itself: its links close the lead, its cross and its check right after them (criterion 14a1164c). -->
	<PageHead title="Who can do what" {lead} back={{ href: `${base}/users`, label: 'All profiles' }} {tools} cite={{ anchor: 'permissions', title: 'Permissions', validates: true, foot: true }} />

	<SectionBox title="Every action, every profile" intro="The end users first, then the admins; a profile's name opens its page.">
		{#if data.users.groups.length === 0}
			<p class="m-0 text-sm text-evo-muted">No feature declares an action yet, so there is nothing to grant.</p>
		{:else if named.length === 0}
			<p class="m-0 text-sm text-evo-muted">No user in the spec yet.</p>
		{:else}
			{#if searchable}
				<SearchInput
					bind:value={query}
					placeholder="Find a user"
					resultLabel={query ? `${columns.length} of ${named.length} ${named.length === 1 ? 'user' : 'users'}` : null}
				/>
			{/if}
			{#if columns.length === 0}
				<p class="m-0 mt-4 text-sm text-evo-muted">No user named “{query}”.</p>
			{:else}
				<MatrixTable users={columns} groups={data.users.groups} {ticks} {tickable} hrefOf={userHref} class="{searchable ? 'mt-3' : ''} max-h-[min(78vh,1100px)] animate-lk-in-fast" />
			{/if}
		{/if}
	</SectionBox>
</section>
