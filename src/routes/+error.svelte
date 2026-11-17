<script lang="ts">
	import { page } from '$app/state';
	import { Icon, Logo } from '$ui/design-system';
	import InactiveProjectNotice from '$ui/shell/InactiveProjectNotice.svelte';

	/** Community works on one project at a time: an inactive one offers to become the active project (EVO-001). */
	const inactiveProjectId = $derived(page.error?.inactiveProjectId ?? null);

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? 'Page not found' : 'Something went wrong');
	const detail = $derived(
		notFound
			? 'The page you are looking for does not exist or has moved.'
			: (page.error?.message ?? 'An unexpected error occurred.')
	);
</script>

<div class="grid h-screen place-items-center bg-evo-page px-4 font-evo">
	<div class="w-full max-w-sm text-center">
		<Logo size={44} class="mx-auto mb-3" />
		{#if inactiveProjectId}
			<InactiveProjectNotice projectId={inactiveProjectId} message={page.error?.message ?? ''} detail={page.error?.detail} />
		{:else}
			<p class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">{page.status}</p>
			<h1 class="mt-1.5 text-[1.375rem] font-bold tracking-[-0.02em] text-ink">{title}</h1>
			<p class="mt-2 text-[0.9375rem] text-ink-2">{detail}</p>
			<a
				href="/"
				class="pressable mt-6 inline-flex min-h-10 items-center gap-2 border-[1.5px] border-ink bg-evo-violet px-4 text-xs font-bold tracking-[0.07em] text-paper uppercase no-underline hover:text-paper"
			>
				<Icon name="arrow-left" size={16} />
				Back to home
			</a>
		{/if}
	</div>
</div>
