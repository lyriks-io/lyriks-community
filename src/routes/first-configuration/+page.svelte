<script lang="ts">
	import { goto } from '$app/navigation';
	import InstallConfigurationForm from '$ui/settings/InstallConfigurationForm.svelte';
	import { isCommunity, PRICING_URL } from '$domain/licensing';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// What a Community installation holds, said before anything else is chosen (EVO-001).
	const community = $derived(isCommunity(data.edition));
</script>

<svelte:head><title>First configuration · Lyriks</title></svelte:head>

<div class="h-full overflow-y-auto">
	<div class="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-5 px-6 py-10">
		<div class="space-y-1">
			<h1 class="font-evo-mono text-sm font-semibold tracking-[0.08em] text-ink uppercase">First configuration</h1>
			<p class="text-sm text-ink-2">
				Nothing leaves this installation until you tick it. You can change all of this at any time in Settings,
				Configuration.
			</p>
		</div>
		{#if community}
			<section data-community-scope class="border-l-[6px] border-blue bg-blue-tint p-4 text-sm text-ink">
				<p class="m-0">This Community installation holds one user and one project, without Evolutions or solver.</p>
				<p class="m-0 mt-1 text-ink-2">
					The plans that open them:
					{#if data.onlineHelp}<a class="font-semibold text-blue-ink hover:underline" href={PRICING_URL} target="_blank" rel="noopener noreferrer">{PRICING_URL.replace(/^https?:\/\//, '')}</a>{:else}{PRICING_URL.replace(/^https?:\/\//, '')}{/if}.
				</p>
			</section>
		{/if}
		<section class="border-[1.5px] border-ink bg-surface p-5">
			<InstallConfigurationForm
				choices={data.configuration}
				destinations={data.destinations}
				assistantEnabled={data.assistantEnabled}
				canEdit
				submitLabel="Validate"
				onSaved={() => goto('/', { invalidateAll: true })}
			/>
		</section>
	</div>
</div>
