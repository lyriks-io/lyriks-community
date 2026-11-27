<script lang="ts">
	/**
	 * What an action of the journeys diagram is for (criterion 3feec278): its
	 * description alone, the action's card saying its name already, in a card
	 * under it (above it where the window has no room below). Fixed and moved
	 * under the body, so the diagram's scrolling box never cuts it.
	 */
	interface Props {
		id: string;
		/** The action's card, where it stood when the pointer rested on it. */
		at: DOMRect;
		description: string;
	}
	let { id, at, description }: Props = $props();

	const GAP = 8;
	const EDGE = 8;
	const WIDTH = 300;

	let height = $state(0);
	const place = $derived.by(() => {
		const left = Math.max(EDGE, Math.min(at.left, window.innerWidth - WIDTH - EDGE));
		const fitsBelow = at.bottom + GAP + height <= window.innerHeight - EDGE;
		return { left, top: fitsBelow ? at.bottom + GAP : Math.max(EDGE, at.top - GAP - height) };
	});

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
</script>

<div
	use:portal
	{id}
	role="tooltip"
	bind:offsetHeight={height}
	class="pointer-events-none fixed z-[110] border-[1.5px] border-ink bg-paper px-3.5 py-2.5 shadow-[3px_3px_0_0_var(--color-ink)]"
	style="left:{place.left}px;top:{place.top}px;width:{WIDTH}px"
>
	{#if description.trim()}
		<p class="m-0 line-clamp-[10] text-[0.8125rem] leading-snug whitespace-pre-line text-ink">{description}</p>
	{:else}
		<p class="m-0 text-[0.8125rem] text-ink-3">No description yet.</p>
	{/if}
</div>
