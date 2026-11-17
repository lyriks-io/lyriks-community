<script lang="ts">
	import type { Finding } from '$domain/retrospec';
	import { DrawerSection, SideDrawer } from '$ui/design-system';
	import RereadCode from '$ui/ai-session/RereadCode.svelte';
	import { BTN, KICK, QUIET, TAG, TAG_ORANGE } from '$ui/spec360/page/look';

	/**
	 * The points to review of a feature's page (criterion c72a7e79): what Lyriks
	 * noticed that names the feature, one row each with its severity tag. A
	 * point opens its problem sheet in the side drawer, where the reader's AI
	 * can re-read the code it is about (ac-ai-session-reread); it is decided on
	 * where every point is, the Overview (criterion e0f69b3c), which the drawer
	 * leads to.
	 */
	let { findings, decideHref }: { findings: readonly Finding[]; decideHref: string } = $props();
	// The point shown stays while the drawer slides out: only `opened` says whether it is open.
	let open = $state.raw<Finding | null>(null);
	let opened = $state(false);
	const close = () => (opened = false);
	const TAG_MAJOR = `${TAG} border-red text-red-ink`;
	/** "IN SHORT" is the sheet's own paragraph, under its title, as the design reads it. */
	const SHORT = 'IN SHORT';
</script>

<!-- The design's point rows (.flist.ptlist): toner, the point in bold, its severity tag at the right. -->
<div class="grid gap-2" role="list">
	{#each findings as f (f.id)}
		<div role="listitem" class="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border border-line bg-toner px-4 py-2.5">
			<button
				type="button"
				class="cursor-pointer border-0 bg-transparent p-0 text-left text-[0.90625rem] leading-[1.35] font-semibold text-ink hover:text-blue-ink"
				aria-haspopup="dialog"
				onclick={() => ((open = f), (opened = true))}
			>
				<span class="sr-only">{f.tone === 'major' ? 'Major point: ' : 'Minor point: '}</span>{f.text}
			</button>
			<span aria-hidden="true" class={f.tone === 'major' ? TAG_MAJOR : TAG_ORANGE}>{f.tone === 'major' ? 'Major' : 'Minor'}</span>
		</div>
	{/each}
</div>

<SideDrawer open={opened && !!open} onClose={close} kicker={open?.sheet.kicker} alert={open?.tone === 'major'} title={open?.sheet.title || open?.text || ''}>
	{#if open}
		{@const f = open}
		{#each f.sheet.sections.filter((s) => s.heading === SHORT && s.text) as s (s.heading)}
			<p class="m-0 leading-[1.6] text-evo-ink-2">{s.text}</p>
		{/each}
		{#each f.sheet.sections.filter((s) => s.heading !== SHORT) as s (s.heading)}
			{#if s.list?.length}
				<DrawerSection title={s.heading}>
					{#each s.list as row, i (i)}<div><span class="mr-2 font-evo-mono text-xs text-evo-muted">{row.k}</span>{row.v}</div>{/each}
				</DrawerSection>
			{:else if s.text}
				<div class="mt-6 mb-2 {KICK}">{s.heading}</div>
				<p class="m-0 text-sm leading-[1.6] text-evo-ink-2">{s.text}</p>
			{/if}
		{/each}
	{/if}
	{#snippet foot()}
		<a href={decideHref} class={BTN}>Decide in Health<span aria-hidden="true">→</span></a>
		{#if open}<RereadCode page="retrospec" anchor={open.id} title={open.sheet.title || open.text} text={open.text} />{/if}
		<button type="button" class={QUIET} onclick={close}>Close</button>
	{/snippet}
</SideDrawer>
