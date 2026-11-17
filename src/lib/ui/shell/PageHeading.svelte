<script lang="ts">
	import type { Snippet } from 'svelte';
	import { HelpTip, Icon, type HelpEntry } from '$ui/design-system';

	/**
	 * The heading every project page opens with: the capability's name and the "?"
	 * that explains the page. A page with tabs passes its tab bar as children; it
	 * then sits under the name, on one compact row closed by the "?".
	 *
	 * That tab row is sticky: it stays right under the app's top bar while the
	 * page scrolls beneath it, so the reader always knows which tab they are on.
	 * The name above it scrolls away with the content, and a page without tabs
	 * pins nothing. The row bleeds over the scroll area's `px-6` padding so the
	 * content never shows beside it, and once it is pinned it draws a bottom edge
	 * to separate itself from what passes underneath.
	 *
	 * The name and the tab row are siblings, not wrapped together, because a
	 * sticky element is confined to its parent: it must live in the page's own
	 * content column to stay pinned for the whole scroll.
	 *
	 * The row's height is published on the scroll area as `--page-header-h`, so
	 * the page's own sticky panels (section menus, inspectors, rails) stop just
	 * under it instead of sliding behind it; without tabs it stays unset (0).
	 *
	 * The name sits 0.25rem inside the tab strip's left edge, on every page with
	 * or without tabs: flush with the box it reads offset, because the strip's
	 * rounded corner pulls its visible edge inward.
	 *
	 * A title sentence and an intent paragraph used to sit under the name; they
	 * repeated what the "?" already says and pushed the content down, so the page
	 * opens on its name alone. The help belongs to the page's heading, not to the
	 * top bar, so it moves with the page.
	 */
	interface Props {
		/** The capability's name, in small brand-tinted capitals. */
		eyebrow: string;
		/** Optional didactic help; renders the "?" at the far right when present. */
		help?: HelpEntry;
		/** Extra classes for the heading's last row (spacing tweaks per page). */
		class?: string;
		/** The page's tab bar, pinned under the name with the "?" beside it. */
		children?: Snippet;
		/** A way back, drawn as an arrow before the name on the same line. */
		back?: { label: string; onclick: () => void };
		/** A small mark read beside the name (a reading the page wants next to its title), never a banner. */
		meta?: Snippet;
	}
	let { eyebrow, help, class: klass = 'mb-6', children, back, meta }: Props = $props();

	let tabRow = $state<HTMLElement>();
	let pinned = $state(false);

	$effect(() => {
		const el = tabRow;
		if (!el) return;
		let host = el.parentElement;
		while (host && !/(auto|scroll)/.test(getComputedStyle(host).overflowY)) host = host.parentElement;
		if (!host) return;
		const scrollArea = host;
		const publish = () => scrollArea.style.setProperty('--page-header-h', `${el.offsetHeight}px`);
		const onScroll = () =>
			(pinned = el.getBoundingClientRect().top <= scrollArea.getBoundingClientRect().top + 0.5);
		publish();
		onScroll();
		const ro = new ResizeObserver(publish);
		ro.observe(el);
		scrollArea.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			ro.disconnect();
			scrollArea.removeEventListener('scroll', onScroll);
			scrollArea.style.removeProperty('--page-header-h');
		};
	});
</script>

{#if children}
	{#if meta}
		<div class="flex items-center gap-2.5">
			<h1 class="pl-1 font-evo-mono text-sm font-bold tracking-[0.08em] text-ink uppercase">{eyebrow}</h1>
			{@render meta()}
		</div>
	{:else}
		<h1 class="pl-1 font-evo-mono text-sm font-bold tracking-[0.08em] text-ink uppercase">{eyebrow}</h1>
	{/if}
	<div
		bind:this={tabRow}
		class="sticky top-0 z-20 -mx-6 flex items-center gap-4 border-b px-6 py-2.5 transition-[border-color,box-shadow] duration-150 {pinned
			? 'border-ink'
			: 'border-transparent'} {klass}"
		style="background:var(--color-canvas)"
	>
		<div class="min-w-0 flex-1">
			{@render children()}
		</div>
		{#if help}
			<HelpTip variant="page" {...help} />
		{/if}
	</div>
{:else}
	<header class="flex items-center gap-4 {klass}">
		{#if back}
			<button
				type="button"
				onclick={back.onclick}
				class="-mr-2 grid size-7 shrink-0 place-items-center text-blue-ink transition hover:bg-blue-tint"
				aria-label={back.label}
				title={back.label}
			>
				<Icon name="arrow-left" size={15} />
			</button>
		{/if}
		{#if meta}
			<div class="flex min-w-0 flex-1 items-center gap-2.5">
				<h1 class="min-w-0 pl-1 font-evo-mono text-sm font-bold tracking-[0.08em] text-ink uppercase">
					{eyebrow}
				</h1>
				{@render meta()}
			</div>
		{:else}
			<h1 class="min-w-0 flex-1 pl-1 font-evo-mono text-sm font-bold tracking-[0.08em] text-ink uppercase">
				{eyebrow}
			</h1>
		{/if}
		{#if help}
			<HelpTip variant="page" {...help} />
		{/if}
	</header>
{/if}
