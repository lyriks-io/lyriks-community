<script lang="ts" generics="T">
	import { onMount, tick, type Snippet } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	/**
	 * A list that only keeps in the page the items near the visible part of its
	 * scroll area: the rest is replaced by two spacers of the same height, and
	 * items are added or removed as the reader scrolls. For lists of thousands of
	 * heavy rows (the Access matrix), where drawing everything froze the page.
	 *
	 * Heights may differ per item: each one starts at `estimate(item)` and is
	 * replaced by its measured height once drawn. The server renders the first
	 * `initialCount` items only. `revealKey` draws the item with that key and
	 * scrolls to it, so a deep link to a row still lands on it.
	 */
	interface Props {
		items: readonly T[];
		key: (item: T) => string;
		estimate: (item: T) => number;
		children: Snippet<[T]>;
		/** Pixels drawn beyond each edge of the visible area. */
		overscan?: number;
		initialCount?: number;
		revealKey?: string | null;
	}
	let { items, key, estimate, children, overscan = 800, initialCount = 30, revealKey = null }: Props =
		$props();

	let listEl: HTMLDivElement | undefined = $state();
	let scroller: HTMLElement | null = null;
	const measured = new SvelteMap<string, number>();

	/** Visible window, in pixels from the top of the list. Null until mounted (server render). */
	let view = $state<{ top: number; bottom: number } | null>(null);

	const offsets = $derived.by(() => {
		const out = new Array<number>(items.length + 1);
		out[0] = 0;
		for (let i = 0; i < items.length; i++)
			out[i + 1] = out[i] + (measured.get(key(items[i])) ?? estimate(items[i]));
		return out;
	});
	const total = $derived(offsets[items.length]);

	/** First index whose bottom edge is below `y` (binary search over the offsets). */
	function indexAt(y: number): number {
		let lo = 0;
		let hi = items.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (offsets[mid + 1] <= y) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	const revealIndex = $derived(
		revealKey ? items.findIndex((item) => key(item) === revealKey) : -1
	);

	const range = $derived.by(() => {
		let start = 0;
		let end = Math.min(items.length, initialCount);
		if (view) {
			start = indexAt(Math.max(0, view.top - overscan));
			end = Math.min(items.length, indexAt(view.bottom + overscan) + 1);
		}
		if (revealIndex >= 0 && (revealIndex < start || revealIndex >= end)) {
			start = Math.min(start, Math.max(0, revealIndex - 5));
			end = Math.max(end, Math.min(items.length, revealIndex + 20));
		}
		return { start, end };
	});

	function update() {
		if (!listEl || !scroller) return;
		const listTop = listEl.getBoundingClientRect().top;
		const area = scroller.getBoundingClientRect();
		view = { top: area.top - listTop, bottom: area.bottom - listTop };
	}

	/** Records an item's drawn height; the spacers follow. */
	function measure(node: HTMLElement, itemKey: string) {
		let current = itemKey;
		const record = () => {
			const h = node.offsetHeight;
			if (h > 0 && measured.get(current) !== h) measured.set(current, h);
		};
		const observer = new ResizeObserver(record);
		observer.observe(node);
		record();
		return {
			update(next: string) {
				current = next;
				record();
			},
			destroy: () => observer.disconnect()
		};
	}

	onMount(() => {
		let host = listEl?.parentElement ?? null;
		while (host && !/(auto|scroll)/.test(getComputedStyle(host).overflowY)) host = host.parentElement;
		scroller = host ?? document.documentElement;
		const target: HTMLElement | Window = host ?? window;
		update();
		target.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		return () => {
			target.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
		};
	});

	// A deep link to a row that is not drawn yet: draw it (see `range`), then
	// bring it into view.
	$effect(() => {
		const i = revealIndex;
		if (i < 0 || !listEl || !scroller) return;
		void tick().then(() => {
			if (!listEl || !scroller) return;
			const listTop = listEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
			scroller.scrollTop += listTop + offsets[i] - 120;
			update();
		});
	});
</script>

<div bind:this={listEl}>
	<div style="height: {offsets[range.start]}px" aria-hidden="true"></div>
	{#each items.slice(range.start, range.end) as item (key(item))}
		<div use:measure={key(item)}>
			{@render children(item)}
		</div>
	{/each}
	<div style="height: {total - offsets[range.end]}px" aria-hidden="true"></div>
</div>
