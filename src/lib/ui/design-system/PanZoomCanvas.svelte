<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { BOARD_DOTS } from './board-look';
	import WheelHint from './WheelHint.svelte';
	import { zoomKeyLabel } from './wheel-zoom';
	import type { DiagramEnlarger } from './enlarge.svelte';
	import type { PanZoom } from './pan-zoom.svelte';

	interface Props {
		view: PanZoom;
		/** The enlarged dialog the diagram opens in; no enlarge button without one. Its holder heads it with DiagramHeader. */
		enlarger?: DiagramEnlarger;
		/** Height of the canvas in its card, any CSS length, unless a holder sets `--diagram-fill`; in the dialog it takes the room left. */
		height: string;
		label: string;
		/** What the panel shows before its own buttons (a view switch, for example). */
		before?: Snippet;
		/** Drawn on the dotted canvas of the boards, as the data map is (criterion 59998858). */
		dotted?: boolean;
		children: Snippet;
	}
	let { view, enlarger, height, label, before, dotted = false, children }: Props = $props();

	let viewport = $state<HTMLDivElement | null>(null);
	let hint = $state<WheelHint | null>(null);
	const enlarged = $derived(enlarger?.enlarged ?? false);
	// In a page the wheel scrolls the page; enlarged, or in a dialog, the diagram has the room and the wheel zooms it (ac-diag-wheel).
	$effect(() => {
		if (!viewport) return;
		return view.attach(viewport, { ownsRoom: () => enlarged || !!viewport?.closest('[aria-modal="true"]'), hint: () => hint?.poke() });
	});
	const zoomKey = zoomKeyLabel();
	// Opening or closing the dialog shows the whole diagram again, once the new size is laid out.
	$effect(() => {
		void enlarged;
		const frame = requestAnimationFrame(() => untrack(() => view.refit()));
		return () => cancelAnimationFrame(frame);
	});
	const BUTTON = 'inline-flex h-6 w-6 items-center justify-center rounded-field text-ink-500 hover:bg-surface-sunken hover:text-ink-700 disabled:opacity-30';
</script>

<div class="relative {enlarged ? 'flex min-h-0 flex-1 flex-col' : ''}">
	<!-- Pannable / zoomable canvas: drag to pan, wheel to zoom, arrows + / - / 0 by keyboard.
	     A custom widget, hence role="application" and its own keys; the panel below
	     stays reachable for anyone who cannot drag. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={viewport}
		role="application"
		tabindex="0"
		aria-label="{label}: hold and drag to move, {enlarged ? 'scroll' : `${zoomKey} + scroll`} to zoom, double-click to fit"
		class="relative w-full touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent-300 {enlarged ? 'min-h-0 flex-1' : ''}"
		class:cursor-grabbing={view.dragging}
		class:cursor-grab={!view.dragging}
		style="{enlarged ? '' : `height: var(--diagram-fill, ${height});`}{dotted ? BOARD_DOTS : ''}"
		data-dotted={dotted || undefined}
		onpointerdown={view.onPointerDown}
		onpointermove={view.onPointerMove}
		onpointerup={view.onPointerUp}
		onpointercancel={view.onPointerUp}
		ondragstart={(e) => e.preventDefault()}
		ondblclick={() => view.showAll()}
		onkeydown={view.onKeyDown}
	>
		<div class="absolute left-0 top-0 origin-top-left" style="transform: translate({view.tx}px, {view.ty}px) scale({view.scale})">
			{@render children()}
		</div>
		{#if !enlarged}<WheelHint bind:this={hint} />{/if}
	</div>

	<div class="absolute right-2 top-2 flex items-center gap-1 rounded-field border border-line bg-surface/90 p-1 text-[0.6875rem] shadow-sm backdrop-blur">
		{@render before?.()}
		<button type="button" class={BUTTON} aria-label="Zoom out" title="Zoom out (-)" disabled={view.atMin} onclick={() => view.zoomOut()}>
			<Icon name="minus" size={14} />
		</button>
		<!-- The zoom shown is also the fit control: one icon only in the panel, the enlarge one;
		     enlarged, the panel holds the zoom alone and the dialog closes from its head (ac-diag-fs-2, -3). -->
		<button
			type="button"
			class="h-6 w-10 rounded-field text-center font-mono text-[0.625rem] text-ink-500 hover:bg-surface-sunken hover:text-ink-700"
			aria-label="Fit to view"
			title="Fit to view (0, or double-click)"
			onclick={() => view.showAll()}
		>
			{Math.round(view.scale * 100)}%
		</button>
		<button type="button" class={BUTTON} aria-label="Zoom in" title="Zoom in (+)" disabled={view.atMax} onclick={() => view.zoomIn()}>
			<Icon name="plus" size={14} />
		</button>
		{#if enlarger && !enlarged}
			<button type="button" class={BUTTON} aria-label="Enlarge" title="Enlarge" onclick={() => enlarger.open()}>
				<Icon name="expand" size={14} />
			</button>
		{/if}
	</div>
</div>
