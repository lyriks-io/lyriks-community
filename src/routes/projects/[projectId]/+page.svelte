<script lang="ts">
	import PageFrame from '$ui/shell/PageFrame.svelte';
	import StartChoice from '$ui/shell/StartChoice.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.projectName} · Lyriks</title>
</svelte:head>

<PageFrame>
	<div class="flex animate-lk-in flex-col gap-5">
		<div class="flex flex-col gap-1.5">
			<h1 class="m-0 text-[1.75rem] leading-[1.15] font-bold">{data.projectName}</h1>
			<h2 class="m-0 text-[1.375rem] leading-tight font-semibold text-evo-ink-2">How do you want to start?</h2>
		</div>
		<StartChoice projectId={data.projectId} />
	</div>
</PageFrame>
