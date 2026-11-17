<script lang="ts">
	import { untrack, type Snippet } from 'svelte';

	/**
	 * The one highlight under a navigation's selected entry, shared by the tab
	 * bars, the main navigation and every section menu so they all move alike.
	 *
	 * Place it as the first child of `container` (which must be `relative`) and
	 * give the entries `relative` too, so they paint above it. It measures the
	 * element `target` selects inside the container.
	 *
	 * Only a change of SELECTION slides. Anything else that moves the entries (the
	 * container resizing, a wrap, the sidebar folding, which also changes `watch`)
	 * puts the highlight in place at once, so it never trails behind its entry.
	 * A resize arriving mid-slide retargets the slide instead of snapping.
	 *
	 * `overlay` is drawn above the entries and clipped to the highlight with the
	 * same timing: the tab bars draw their labels in white there, so a label turns
	 * white exactly where the highlight covers it, never ahead of it.
	 *
	 * With no target it draws nothing: the entry keeps its own selected look
	 * until `onPlaced(true)` says the highlight is there (server render).
	 */
	interface Props {
		container: HTMLElement | undefined;
		/** CSS selector of the selected entry inside the container; null = none selected. */
		target: string | null;
		/** A change that moves the entries without changing the selection. */
		watch?: unknown;
		/** The highlight's look (background, radius, shadow). */
		class?: string;
		/** Corner radius of the overlay's clip, in px (matches the highlight's). */
		radius?: number;
		/** Content laid out like the entries, shown only inside the highlight. */
		overlay?: Snippet;
		/** Told whether the highlight is drawn, so the entry can drop its own background. */
		onPlaced?: (placed: boolean) => void;
	}
	let {
		container,
		target,
		watch,
		class: klass = '',
		radius = 8,
		overlay,
		onPlaced
	}: Props = $props();

	type Box = { left: number; top: number; width: number; height: number };
	let box = $state<Box | null>(null);
	/** True while a selection slide runs; transitions exist only then. */
	let sliding = $state(false);
	let size = $state({ width: 0, height: 0 });
	let slideTimer: ReturnType<typeof setTimeout> | undefined;
	const SLIDE_MS = 300;

	/** The selected entry's box, in the container's padding-box coordinates. */
	function measureTarget(selector: string | null): Box | null {
		if (!container || !selector) return null;
		const el = container.querySelector<HTMLElement>(selector);
		if (!el) return null;
		const base = container.getBoundingClientRect();
		const rect = el.getBoundingClientRect();
		// An absolute child is placed from the padding box: drop the border, add
		// the scroll, so the highlight sits exactly on the entry.
		return {
			left: rect.left - base.left - container.clientLeft + container.scrollLeft,
			top: rect.top - base.top - container.clientTop + container.scrollTop,
			width: rect.width,
			height: rect.height
		};
	}

	function place(selector: string | null, slide: boolean) {
		const next = measureTarget(selector);
		untrack(() => {
			if (container) size = { width: container.clientWidth, height: container.clientHeight };
			const placedBefore = box !== null;
			if (slide && placedBefore && next) {
				sliding = true;
				clearTimeout(slideTimer);
				slideTimer = setTimeout(() => (sliding = false), SLIDE_MS + 50);
			}
			const same =
				box && next
					? box.left === next.left &&
						box.top === next.top &&
						box.width === next.width &&
						box.height === next.height
					: box === next;
			if (!same) box = next;
			if (placedBefore !== (next !== null)) onPlaced?.(next !== null);
		});
	}

	let lastTarget: string | null | undefined;
	let lastWatch: unknown;
	$effect(() => {
		const t = target;
		const w = watch;
		untrack(() => {
			// Slide only when the selection itself changed.
			const slide = lastTarget !== undefined && t !== lastTarget && w === lastWatch;
			lastTarget = t;
			lastWatch = w;
			place(t, slide);
		});
	});

	$effect(() => {
		if (!container) return;
		const observer = new ResizeObserver(() =>
			untrack(() => place(target, sliding))
		);
		observer.observe(container);
		for (const child of container.children) observer.observe(child);
		return () => {
			observer.disconnect();
			clearTimeout(slideTimer);
		};
	});

	const motion = $derived(
		sliding
			? 'transition-[left,top,width,height,clip-path] duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none'
			: ''
	);
	const clip = $derived(
		box
			? `inset(${box.top}px ${size.width - box.left - box.width}px ${size.height - box.top - box.height}px ${box.left}px round ${radius}px)`
			: 'inset(50%)'
	);
</script>

{#if box}
	<span
		aria-hidden="true"
		class="pointer-events-none absolute {klass} {motion}"
		style="left: {box.left}px; top: {box.top}px; width: {box.width}px; height: {box.height}px;"
	></span>
	{#if overlay}
		<div
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 z-10 {motion}"
			style="clip-path: {clip};"
		>
			{@render overlay()}
		</div>
	{/if}
{/if}
