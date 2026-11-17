<script lang="ts">
	import { untrack } from 'svelte';
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import { CoherenceStore } from '$ui/coherence/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import GuaranteeTiers from '$ui/coherence/sections/GuaranteeTiers.svelte';
	import ThresholdControl from '$ui/coherence/sections/ThresholdControl.svelte';
	import GeneratePanel from '$ui/coherence/sections/GeneratePanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const store = untrack(() => new CoherenceStore(data.draft, data.analysis, data.session, toastNotifier, data.revision));

	// Live-sync: re-hydrate the draft and the server-recomputed analysis when a fresh load lands.
	$effect(() => {
		store.hydrate(data.draft, data.revision);
		store.analysis = data.analysis;
	});
</script>

<svelte:head>
	<title>{data.productName} · Generate specs · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5">
		<PageHeading eyebrow="Generate specs" help={CAPABILITY_HELP.generate} class="mb-7" />
		<section class="space-y-5 pb-4">
			<div class="grid gap-5 lg:grid-cols-[1fr_minmax(260px,360px)]">
				<GuaranteeTiers {store} productTier={data.tier} />
				<ThresholdControl {store} />
			</div>
			<GeneratePanel {store} />
		</section>
	</div>
</div>

<SaveBar saveStatus={store.saveStatus} />
