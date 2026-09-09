<script lang="ts">
	import { page } from '$app/state';
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import { untrack } from 'svelte';
	import { GlossaryStore } from '$ui/glossary/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import GlossaryBoard from '$ui/glossary/GlossaryBoard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const store = untrack(
		() =>
			new GlossaryStore(
				data.draft,
				data.corpus,
				data.session,
				toastNotifier,
				data.revision
			)
	);

	// Live-sync: re-hydrate the store when a fresh server `load` lands.
	$effect(() => {
		store.hydrate(data.draft, data.revision);
	});

	const projectName = $derived(data.productName);

</script>

<svelte:head>
	<title>{projectName} · Glossary · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5">
		<PageHeading
			eyebrow="Glossary"
			title="Lock the project vocabulary."
			description="The canonical term wins every time. Synonyms are tracked, and the ones to avoid stop a downstream LLM from drifting into ambiguous language."
			help={CAPABILITY_HELP.glossary}
			class="mb-7"
		/>

		<div class="pb-4">
			<GlossaryBoard {store} />
		</div>
	</div>
</div>

<SaveBar saveStatus={store.saveStatus} coherence={store.coherence} />
