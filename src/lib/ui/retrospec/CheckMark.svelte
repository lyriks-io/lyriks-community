<script lang="ts">
	/**
	 * The check of a step or a phase done (criterion 642d3667): drawn whole as a
	 * stroke, so no font can cut or shrink it the way a typed character was.
	 * It takes the colour of its square's text.
	 */
	let { size = 16 }: { size?: number } = $props();
</script>

<svg data-check width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>
