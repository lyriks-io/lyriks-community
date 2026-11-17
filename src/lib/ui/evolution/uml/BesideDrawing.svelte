<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A view's list of drawings beside the drawing and as tall as it
	 * (ac-evo-func-uml): the list is out of the flow of the layout, so it scrolls
	 * instead of stretching the drawing; above it on a narrow screen.
	 */
	interface Props {
		list: Snippet;
		children: Snippet;
		/** The diagram fills the dialog: the drawing takes the height left. */
		enlarged: boolean;
		/** The drawing's height in the card, unless a holder sets `--diagram-fill`. */
		height: string;
	}
	let { list, children, enlarged, height }: Props = $props();
</script>

<div class="flex flex-col md:flex-row {enlarged ? 'min-h-0 flex-1' : ''}">
	<div class="relative shrink-0 border-b border-line md:w-56 md:border-b-0 md:border-r">
		<div class="max-h-40 overflow-y-auto overscroll-contain md:absolute md:inset-0 md:max-h-none">
			{@render list()}
		</div>
	</div>
	<div class="flex min-w-0 flex-1 flex-col {enlarged ? 'min-h-0' : ''}" style={enlarged ? undefined : `min-height: var(--diagram-fill, ${height})`}>
		{@render children()}
	</div>
</div>
