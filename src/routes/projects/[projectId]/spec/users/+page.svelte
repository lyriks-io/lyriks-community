<script lang="ts">
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import { addedLast } from '$application/spec360/edits';
	import { accessCount, endUsersFirst, USER_SEARCH_FROM } from '$application/spec360/users';
	import { openTopicsOfUser } from '$application/spec360/users-reach';
	import { SearchInput, matchesQuery } from '$ui/design-system';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import BarList from '$ui/spec360/page/BarList.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SectionBox from '$ui/spec360/page/SectionBox.svelte';
	import { BTN, FACT, MORE } from '$ui/spec360/page/look';
	import UserRow from '$ui/spec360/users/UserRow.svelte';
	import { useDiscussions } from '$ui/spec360/discussions.svelte';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { PermissionTicks } from '$ui/spec360/permission-ticks.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import type { PageData } from './$types';

	/**
	 * Users and permissions (criterion 4146848b): who uses the product, one row
	 * per user, the end users first (criterion c6cca8af), each with a bar of how
	 * many actions it can perform and its Validate; a row opens the user's page,
	 * where it is edited, discussed and deleted. Under the list, a user is added
	 * in the Edit mode (criteria e356a69c, 41514698), and who can do what opens
	 * on its own page (criterion 5787390d), next to the permissions' Validate and
	 * discussion. The head carries the page's tools (criterion 14a1164c), its
	 * facts as chips; each section is a box.
	 */
	let { data }: { data: PageData } = $props();
	const edits = useEdits();
	const validation = useValidation();
	const discussions = useDiscussions();
	const ticks = new PermissionTicks(edits);
	const mode = useEditMode();
	// Users are added and deleted while the specification is a draft (criterion 9b3e04e1, 611e98cb on hold).
	const tickable = $derived(validation.draft && validation.source.canWrite);
	const base = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);

	// What the page read, with the users added and deleted on their way laid over it; the one just added is named at
	// the foot, where Add a user was clicked (criteria e356a69c, 4b3d2b4d).
	const all = $derived(
		addedLast(
			endUsersFirst([
				...data.users.users.filter((u) => !edits.gone(anchorOf('role', u.id))),
				...edits.added('user', data.users.users.map((u) => u.id)).map((a) => ({ id: a.id, name: a.name, description: '', tone: 'customer', userClass: 'end' as const }))
			]),
			(u) => edits.naming(anchorOf('role', u.id))
		)
	);
	const rows = $derived(
		all.map((u) => {
			const anchor = anchorOf('role', u.id);
			const values = edits.shown(anchor, { text: u.name, desc: u.description });
			const access = accessCount(data.users.groups, (row) => ticks.holds(u.id, row));
			return { user: u, anchor, values, granted: access.granted, total: access.total, openTopics: openTopicsOfUser(discussions.document.threads, u.id) };
		})
	);

	let query = $state('');
	const searchable = $derived(all.length >= USER_SEARCH_FROM);
	const shown = $derived(searchable ? rows.filter((r) => matchesQuery(query, r.values.text, r.values.desc)) : rows);
	const anchors = $derived(rows.map((r) => r.anchor));
	const admins = $derived(all.filter((u) => u.userClass === 'admin').length);
	const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
	const census = $derived([plural(all.length, 'user'), plural(all.length - admins, 'end user'), plural(admins, 'admin user')]);
	// Adding a user is editing: it waits for the page's Edit mode (criterion 41514698).
	const addable = $derived(tickable && mode.active && !query);
	const userHref = (userId: string) => `${base}/users/${encodeURIComponent(userId)}`;
</script>

{#snippet tools()}
	<AskAiTool anchor="permissions" title="Permissions" subject="Users and permissions" />
{/snippet}

<div class="flex flex-col">
	<PageHead title="Users and permissions" lead="Who uses {data.spec.productName}, and how many actions each profile can perform; open one to see which." {tools} cite={{ anchor: 'permissions', title: 'Permissions' }}>
		{#snippet meta()}
			{#each census as fact (fact)}<span class={FACT}>{fact}</span>{/each}
		{/snippet}
	</PageHead>

	<div class="flex flex-col gap-6">
		<SectionBox id="kb-users-list" title="Profiles" intro="End users first, then the admins; open one to see what it can reach.">
			{#snippet actions()}
				<!-- Validate all comes forward while the pointer is on the section. -->
				{#if all.length > 0}<SectionValidateAll {anchors} what="users" sectionId="kb-users-list" />{/if}
			{/snippet}
			{#if searchable}
				<div class="mb-3">
					<SearchInput bind:value={query} placeholder="Find a user" resultLabel={query ? `${shown.length} of ${all.length} users` : null} />
				</div>
			{/if}
			<div class="flex flex-col gap-3">
				{#if shown.length === 0}
					<p class="m-0 text-sm text-evo-muted">{all.length === 0 ? 'No user in the spec yet.' : `No user matches “${query}”.`}</p>
				{/if}
				{#if shown.length > 0 || addable}
					<BarList label="Users">
						{#each shown as r (r.user.id)}
							<UserRow
								anchor={r.anchor}
								name={r.values.text}
								description={r.values.desc ?? ''}
								admin={r.user.userClass === 'admin'}
								granted={r.granted}
								total={r.total}
								openTopics={r.openTopics}
								href={userHref(r.user.id)}
							/>
						{/each}
						{#snippet more()}
							{#if addable}
								<!-- A new user is an end user, named and described in place: the list's last line, in the Edit mode. -->
								<div role="listitem" class={shown.length > 0 ? 'border-t border-evo-line-soft' : ''}>
									<button
										type="button"
										class="flex min-h-12 w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-[18px] text-left {MORE} transition-colors duration-150 hover:bg-evo-hover"
										onclick={() => void edits.add('user')}
									>
										<span aria-hidden="true">+</span>Add a user
									</button>
								</div>
							{/if}
						{/snippet}
					</BarList>
				{/if}
			</div>
		</SectionBox>

		<!-- Who can do what as a whole: its own page, validated and discussed here. -->
		<SectionBox title="Who can do what" intro="Every action against every profile, on a page of its own.">
			<div id={anchorDomId('permissions')} data-evo-waits={validation.waitsOnMe('permissions') || undefined} class="flex scroll-mt-36 flex-col gap-2">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
					{#if data.users.groups.length > 0}
						<a href="{base}/users/matrix" class={BTN}>See who can do what (full matrix)</a>
					{:else}
						<span class="text-sm text-evo-muted">No feature declares an action yet, so nobody can do anything.</span>
					{/if}
					<span class="ml-auto flex items-center gap-2"><SpecControls anchor="permissions" title="Permissions" /></span>
				</div>
				<BlockFoot anchor="permissions" title="Permissions" />
			</div>
		</SectionBox>
	</div>
</div>
