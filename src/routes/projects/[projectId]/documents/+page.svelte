<script lang="ts">
	import { untrack } from 'svelte';
	import { DocumentsStore } from '$ui/documents/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import DocumentsBoard from '$ui/documents/DocumentsBoard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const store = untrack(
		() => new DocumentsStore(data.draft, data.session, toastNotifier, data.revision)
	);

	$effect(() => {
		store.hydrate(data.draft, data.revision);
	});

	const projectName = $derived(data.productName);
</script>

<svelte:head>
	<title>{projectName} · Documents & Sources · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5">
		<header class="mb-7">
			<p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
				Documents & Sources
			</p>
			<h1 class="mt-1 text-3xl font-bold tracking-tight text-ink-900">
				Where every claim comes from.
			</h1>
			<p class="mt-2 max-w-2xl text-sm text-ink-500">
				A register of the interviews, research, links, regulations and evidence behind the spec - so
				any requirement can cite its source. Not a document store: it records the reference, not the
				bytes.
			</p>
		</header>

		<DocumentsBoard {store} />
	</div>
</div>

<SaveBar saveStatus={store.saveStatus} />
