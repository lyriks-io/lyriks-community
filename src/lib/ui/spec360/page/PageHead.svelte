<script lang="ts">
	import type { Snippet } from 'svelte';
	import { anchorDomId } from '$domain/discussions';
	import BackLink from './BackLink.svelte';
	import BlockFoot from '../BlockFoot.svelte';
	import CiteLinks from '../CiteLinks.svelte';
	import SpecControls from '../SpecControls.svelte';
	import { META } from './look';
	import { usePageBanner } from './page-banner';
	import { useEditMode } from '../edit-mode.svelte';
	import { knowledgeHeadAbove } from '../knowledge-head';

	/**
	 * The head of a page of Knowledge, after the design: a band of paper
	 * across the page. Its first part is the kicker (a page under another
	 * names it there as a link, `up`: no trail names where a page sits,
	 * criterion 8a6a568b), the title and the page's main action at its right;
	 * Edit follows the DRAFT tag at the top of Knowledge (criterion 41514698)
	 * and Ask my AI sits at the foot of the navigation (criterion 44aa7b4f).
	 * Under the three rows at the top of Knowledge, which stay in view, the
	 * whole head scrolls with the page (criterion 14a1164c); elsewhere (Notices)
	 * its first part stays at the top and draws its ink rule once the rest has
	 * gone under it. `bare` leaves the first part out: the Overview's title is
	 * the product's name at the top of Knowledge. The second part (the lead, a
	 * status line, the chips of facts, what the page adds: figures, an editor)
	 * closes the band with the ink rule. `aside` sits at the right of the lead
	 * and drops under it on a phone. `cite` names what a page that lists bears
	 * on (the product, who can do what, the branding, the view open): its
	 * comments and its sources close the lead as two links, the way About the
	 * product closes its summary (criterion 14a1164c).
	 */
	interface Props {
		title: string;
		kicker?: string;
		/** The page this one sits under, named before the kicker as a link to it: a feature's core feature, an action's feature. */
		up?: { readonly label: string; readonly href: string } | null;
		/** No first part: the page's title is the product's name at the top of Knowledge (the Overview). */
		bare?: boolean;
		lead?: string;
		back?: { href: string; label: string } | null;
		/** The page's main action, at the right of the title. */
		tools?: Snippet;
		/** The title as the page draws it: the element's name as a field of the Edit mode (StagedText). */
		name?: Snippet;
		/** A tag on the title's line, after it: the Overview's DRAFT while the specification is not validated (criterion 14a1164c). */
		mark?: Snippet;
		/** A line of status under the title: a tag, a version, a link. */
		status?: Snippet;
		/** The facts under the lead, as chips: "17 actions", "45 rules", "Used by 3 profiles". */
		meta?: Snippet;
		aside?: Snippet;
		/** What the page adds under the lead (tags, figures, an editor). */
		children?: Snippet;
		/**
		 * What the page bears on, as Ask my AI does (criterion 44aa7b4f): its comments and sources close the lead.
		 * `validates` adds its cross and its check right after them, where the head is the element itself (the
		 * matrix); `foot` opens its thread at the head's foot, where no block of the page holds it.
		 */
		cite?: { readonly anchor: string; readonly title: string; readonly validates?: boolean; readonly foot?: boolean } | null;
	}
	let { title, kicker, up = null, bare = false, lead, back = null, tools, name, mark, status, meta, aside, children, cite = null }: Props = $props();
	// What the Specification 360° shows under every head: the validation owed, the code changed (page-banner).
	const banner = usePageBanner();
	// In the Edit mode the head draws a blue line along its top (criterion 41514698); under Knowledge's rows they draw it.
	const mode = useEditMode();
	const headed = knowledgeHeadAbove();
	const sticks = $derived(!headed());

	let head = $state<HTMLElement | null>(null);
	let intro = $state<HTMLElement | null>(null);
	let stuck = $state(false);
	// Stuck once the band under the title has scrolled under it: the title then draws its own rule.
	$effect(() => {
		const scroller = document.getElementById('app-scroll');
		if (!sticks || !scroller || !head || !intro) return;
		const read = () => {
			if (!head || !intro) return;
			stuck = intro.getBoundingClientRect().bottom <= head.getBoundingClientRect().bottom + 1;
		};
		read();
		scroller.addEventListener('scroll', read, { passive: true });
		return () => scroller.removeEventListener('scroll', read);
	});
</script>

{#if !bare}
	<header
		bind:this={head}
		data-page-head={sticks || undefined}
		class="{sticks ? 'sticky top-0 z-20' : ''} -mx-[26px] -mt-[22px] flex flex-col gap-2 bg-paper px-[26px] pt-[22px] pb-3.5 max-[760px]:-mx-4 max-[760px]:-mt-4 max-[760px]:px-4 max-[760px]:pt-4 {stuck
			? 'border-b-2 border-ink'
			: ''} {sticks && mode.available && mode.active ? 'shadow-[inset_0_3px_0_var(--color-blue)]' : ''}"
	>
		{#if back}<BackLink href={back.href} label={back.label} />{/if}
		{#if kicker}<span class="-mb-0.5 font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase"
				>{#if up}<a href={up.href} class="text-blue-ink underline decoration-1 underline-offset-[3px] hover:decoration-2">{up.label}</a> · {/if}{kicker}</span
			>{/if}
		<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
			<div class="flex min-w-0 flex-[1_1_320px] flex-wrap items-center gap-x-3 gap-y-1.5">
				<h1 class="m-0 min-w-0 text-[2.125rem] leading-[0.98] font-bold tracking-[-0.025em] text-balance text-ink [overflow-wrap:anywhere] max-[700px]:text-[1.625rem]">{#if name}{@render name()}{:else}{title}{/if}</h1>
				{@render mark?.()}
			</div>
			{#if tools}<div class="ml-auto flex flex-none flex-wrap items-center gap-2.5">{@render tools()}</div>{/if}
		</div>
	</header>
{/if}
<section
	bind:this={intro}
	class="-mx-[26px] mb-6 flex flex-col gap-2 border-b-2 border-ink bg-paper px-[26px] pb-[18px] max-[760px]:-mx-4 max-[760px]:px-4"
>
	<div class="flex flex-wrap items-start gap-6">
		<div class="flex min-w-0 flex-[999_1_420px] flex-col gap-2">
			{#if status}<div class="flex flex-wrap items-center gap-2.5">{@render status()}</div>{/if}
			{#if lead || cite}
				<p class="m-0 max-w-[86ch] text-[0.9375rem] leading-[1.6] text-ink-2">
					<!-- With no lead before them, the links start the line: their gap after a text is taken back. -->
					{lead ?? ''}{#if cite}<span class={lead ? '' : '-ml-1.5'}><CiteLinks anchor={cite.anchor} /></span>{#if cite.validates}<SpecControls anchor={cite.anchor} title={cite.title} inline cites trailing />{/if}{/if}
				</p>
			{/if}
			{#if meta}<div class="flex flex-wrap items-center gap-1.5 {META}">{@render meta()}</div>{/if}
			{@render children?.()}
			{#if cite?.foot}<div id={anchorDomId(cite.anchor)} class="flex scroll-mt-36 flex-col gap-2 empty:hidden"><BlockFoot anchor={cite.anchor} title={cite.title} /></div>{/if}
		</div>
		{#if aside}<div class="flex flex-[1_1_200px] justify-end max-[700px]:justify-start">{@render aside()}</div>{/if}
	</div>
</section>
{#if banner}{@render banner()}{/if}
