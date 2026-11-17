<script lang="ts">
	/**
	 * The sign a drawing puts on an element a problem sits on (ac-evo-func-uml-text):
	 * the amber triangle of what waits on a person, the same sign as the list of
	 * problems under the drawing, centred on (x, y).
	 */
	interface Props {
		x: number;
		y: number;
	}
	let { x, y }: Props = $props();
</script>

<g transform="translate({x},{y})" class="pointer-events-none" aria-hidden="true">
	<path d="M0,-9 L9,7 H-9 Z" class="fill-orange stroke-surface" stroke-width="2" stroke-linejoin="round" />
	<path d="M0,-3.5 V1.5" class="stroke-paper" stroke-width="2" stroke-linecap="round" />
	<circle cy="4.4" r="1.1" class="fill-paper" />
</g>
