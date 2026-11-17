<script lang="ts">
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import PageFrame from '$ui/shell/PageFrame.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import EvolutionPanel from '$ui/evolution/EvolutionPanel.svelte';
	import RoadmapTab from '$ui/features/sections/RoadmapTab.svelte';
	import { PillTabs, type PillTab } from '$ui/design-system';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { setAdminNames } from '$ui/users/admin-names-context';
	import SectionWaiting from '$ui/shell/SectionWaiting.svelte';
	import CommunityLock from '$ui/shell/CommunityLock.svelte';
	import { sectionWait } from '$ui/shell/section-wait';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The request's diagrams mark a person who is an admin role with its shield.
	setAdminNames(() => data.adminNames);

	// Two tabs: the change requests, and the roadmap moved here from Features.
	// The tab lives in the URL (?tab=roadmap) so the server loads the roadmap
	// only when it is shown, and an old Features roadmap link lands on it.
	type Tab = 'requests' | 'roadmap';
	const tabs: PillTab[] = [
		{ id: 'requests', label: 'Requests', desc: 'Change requests, idea to acceptance' },
		{ id: 'roadmap', label: 'Roadmap', desc: 'Phase by phase delivery' }
	];
	const tab = $derived<Tab>(!data.locked && data.roadmap ? 'roadmap' : 'requests');
	const wait = $derived(sectionWait('changes', data.chrome.tabs, page.params.projectId ?? ''));

	function selectTab(next: Tab) {
		const url = new URL(page.url);
		url.searchParams.delete('request');
		if (next === 'roadmap') url.searchParams.set('tab', 'roadmap');
		else url.searchParams.delete('tab');
		void goto(url, { noScroll: true, keepFocus: true });
	}
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
			{#if wait && !data.roadmap}
				<SectionWaiting title="Changes" {wait} />
			{/if}
			<!-- The Evolution pages carry their own heading (the design's); the roadmap keeps its tabs back to them. -->
			{#if data.roadmap}
				<PageHeading eyebrow="Evolution" help={CAPABILITY_HELP.evolution} class="mb-6">
					<PillTabs
						{tabs}
						active={tab}
						onSelect={(id) => selectTab(id as Tab)}
						label="Evolution views"
					/>
				</PageHeading>
			{/if}
			{#if data.roadmap}
				<RoadmapTab
					draft={data.roadmap.draft}
					revision={data.roadmap.revision}
					session={data.session}
					collaborators={data.team.collaborators}
					featureActions={data.roadmap.featureActions}
					implementation={data.roadmap.implementation}
				/>
			{:else if !wait}
				<EvolutionPanel
					projectId={page.params.projectId ?? ''}
					data={data.evolution}
					canEdit={data.evolution.actor.role !== 'viewer'}
				/>
			{/if}
		{/if}
	</div>
</PageFrame>
