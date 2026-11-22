<script lang="ts">
	/**
	 * A person in a UML drawing, as the app marks a user everywhere (ac-evo-func-uml):
	 * the user icon in a round tile, centred on (x, y), and for an admin a small
	 * shield on the tile's top-right corner, in the admin class's blue. The tile
	 * takes the drawing's stroke (`tone`), dashed for a person named but not declared.
	 */
	interface Props {
		x: number;
		y: number;
		/** Radius of the tile. */
		r?: number;
		/** The stroke class the drawing gives it (selected, marked, plain). */
		tone: string;
		strokeWidth?: number;
		dashed?: boolean;
		admin?: boolean;
	}
	let { x, y, r = 22, tone, strokeWidth = 1.5, dashed = false, admin = false }: Props = $props();

	// The lucide `user` icon (24 x 24), drawn at about two thirds of the tile.
	const s = $derived(r * 1.3);
	const badge = $derived(Math.max(6, r * 0.34));
	const bx = $derived(x + r * 0.72);
	const by = $derived(y - r * 0.72);
</script>

<g aria-hidden="true">
	<circle cx={x} cy={y} {r} class="fill-surface {tone}" stroke-width={strokeWidth} stroke-dasharray={dashed ? '3 2' : undefined} />
	<g transform="translate({x - s / 2},{y - s / 2}) scale({s / 24})" class="fill-none {tone}" stroke-width={(strokeWidth * 24) / s + 0.4} stroke-linecap="round" stroke-linejoin="round">
		<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
		<circle cx="12" cy="7" r="4" />
	</g>
	{#if admin}
		<circle cx={bx} cy={by} r={badge} class="fill-evo-blue stroke-paper" stroke-width="2" data-admin-shield />
		<g transform="translate({bx - badge * 0.62},{by - badge * 0.62}) scale({(badge * 1.24) / 24})" class="fill-none stroke-paper" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
			<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
		</g>
	{/if}
</g>
