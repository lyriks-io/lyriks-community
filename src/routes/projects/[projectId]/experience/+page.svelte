<script lang="ts">
	import { untrack } from 'svelte';
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import { page } from '$app/state';
	import { ExperienceStore } from '$ui/experience/draft-store.svelte';
	import { anchorKeyFromUrl, focusField } from '$ui/shell/focus-field';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import TabBar from '$ui/experience/TabBar.svelte';
	import Journeys from '$ui/experience/sections/Journeys.svelte';
	import Screens from '$ui/experience/sections/Screens.svelte';
	import Components from '$ui/experience/sections/Components.svelte';
	import BackendPanel from '$ui/experience/sections/BackendPanel.svelte';
	import BrandDesign from '$ui/experience/sections/brand/BrandDesign.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const store = untrack(() => {
		const s = new ExperienceStore(data.draft, data.session, toastNotifier, data.revision);
		s.formFactors = data.formFactors ?? [];
		s.productName = data.productName ?? '';
		s.dataModel = data.dataModel ?? { entities: [], fields: [] };
		s.capabilityAccess = data.capabilityAccess ?? [];

		// Deep-link from a "Fix now" link (e.g. a state-type conflict): focus the
		// named screen + element so the user lands on the exact field to fix.
		const sp = page.url.searchParams;
		const screen = sp.get('screen');
		const urlTab = sp.get('tab');
		if (urlTab === 'journeys' || urlTab === 'components' || urlTab === 'data') {
			// Graph/search deep-link to a journey, step, component or template. Use
			// the store methods so navigation remains local and survives draft hydration.
			s.switchDesignMode('experience');
			s.switchTab(urlTab);
			// Steps only render for the selected journey — select the linked one so
			// the anchor has something to flash.
			const anchorId = sp.get('node');
			if (anchorId) {
				const step = s.draft.steps.find((st) => st.id === anchorId);
				const journeyId = step?.journeyId ?? (s.draft.journeys.some((j) => j.id === anchorId) ? anchorId : null);
				// selectJourney TOGGLES — calling it on the already-selected journey would close it.
				if (journeyId && s.selectedJourneyId !== journeyId) s.selectJourney(journeyId);
			}
		}
		if (urlTab === 'screens' || screen) {
			s.switchDesignMode('experience');
			s.switchTab('screens');
		}
		if (screen && s.draft.builder) {
			// The Screens panel owns which screen is open — hand it the target, or
			// the link lands on the entry screen and looks like it did nothing.
			s.focusScreenId = screen;
			s.selectBuilderNode(sp.get('node'));
		}
		return s;
	});

	// Live-sync: re-hydrate the store when a fresh server `load` lands.
	$effect(() => {
		store.hydrate(data.draft, data.revision);
	});

	const projectName = $derived(data.productName);

	// Deep-link jump target (graph explorer / search): flash the matching
	// `data-anchor` card (journey, step, component…) once the page has landed.
	const focusKey = $derived(anchorKeyFromUrl(page.url));
</script>

<svelte:head>
	<title>{projectName} · Experience · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5" use:focusField={focusKey}>
		<PageHeading
			eyebrow="Design & Experience"
			title="Lock the visual language and walk users through the product."
			description="Capture the brand so a downstream LLM ships on-brand UI, then map journeys, build screens, and explore them in the live simulator."
			help={CAPABILITY_HELP.experience}
			class="mb-6"
		/>

		<!-- One tab bar for the whole page: Brand & Design sits alongside the views. -->
		<div class="mb-6">
			<TabBar
				active={store.activeTab}
				brandActive={store.activeDesignMode === 'brand'}
				{store}
				onSwitch={(tab) => {
					if (tab === 'brand') {
						store.switchDesignMode('brand');
					} else {
						store.switchDesignMode('experience');
						store.switchTab(tab);
					}
				}}
			/>
		</div>

		{#if store.activeDesignMode === 'brand'}
			<div class="pb-4">
				<BrandDesign {store} />
			</div>
		{:else}
			<div class="space-y-6 pb-4">
				{#if store.activeTab === 'journeys'}
					<Journeys {store} roles={data.roles} />
				{:else if store.activeTab === 'components'}
					<Components {store} roles={data.roles} />
				{:else if store.activeTab === 'data'}
					<BackendPanel {store} />
				{:else}
					<Screens {store} roles={data.roles} />
				{/if}
			</div>
		{/if}
	</div>
</div>

<SaveBar saveStatus={store.saveStatus} coherence={store.coherence} />
