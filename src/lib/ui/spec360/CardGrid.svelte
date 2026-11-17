<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CardGridMotion, provideCardGrid } from './card-grid.svelte';

	/**
	 * A grid of small cards whose discussions open inside them: an open card
	 * keeps its row and spans it (`motion.lock` gives its style), and the other
	 * cards make room with a smooth move. The children snippet receives the
	 * motion so each card reads its lock.
	 */
	interface Props {
		class?: string;
		id?: string;
		children: Snippet<[CardGridMotion]>;
	}
	let { class: extra = '', id, children }: Props = $props();
	const motion = provideCardGrid(new CardGridMotion());

	$effect(() => {
		const el = motion.el;
		if (!el) return;
		motion.measure();
		const sizes = new ResizeObserver(() => motion.measure());
		sizes.observe(el);
		return () => sizes.disconnect();
	});
</script>

<div {id} bind:this={motion.el} class={extra}>
	{@render children(motion)}
</div>
