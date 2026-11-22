<script lang="ts">
	import PageFrame from '$ui/shell/PageFrame.svelte';
	import EvolutionPanel from '$ui/evolution/EvolutionPanel.svelte';
	import { page } from '$app/state';
	import { setAdminNames } from '$ui/users/admin-names-context';
	import SectionWaiting from '$ui/shell/SectionWaiting.svelte';
	import CommunityLock from '$ui/shell/CommunityLock.svelte';
	import { sectionWait } from '$ui/shell/section-wait';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The request's diagrams mark a person who is an admin role with its shield.
	setAdminNames(() => data.adminNames);

	const wait = $derived(sectionWait('changes', data.chrome.tabs, page.params.projectId ?? ''));
</script>

<svelte:head>
	<title>{data.productName} · Evolution · Lyriks</title>
</svelte:head>

<!-- The Evolution pages sit in the page column of the design, like every page of the app bar. -->
<!-- A request opens on the rows at the top of Knowledge, across the page (criterion 595efead). -->
<PageFrame wide={!data.locked && (!!data.evolution.reading || !!data.evolution.concurrent)}>
	<div>
		{#if data.locked}
			<!-- Community: the entry opens on the plan that opens Evolutions (EVO-001). -->
			<CommunityLock lock="evolutions" title="Changes" />
		{:else}
			<!-- Before there is a validated knowledge the entry still opens, and says why it is empty (criterion 6213ef4c). -->
			{#if wait}
				<SectionWaiting title="Changes" {wait} />
			{:else}
				<EvolutionPanel
					projectId={page.params.projectId ?? ''}
					data={data.evolution}
					canEdit={data.evolution.actor.role !== 'viewer'}
				/>
			{/if}
		{/if}
	</div>
</PageFrame>
