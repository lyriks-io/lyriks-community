<script lang="ts">
	import { Icon } from '$ui/design-system';

	/**
	 * A user's mark: the same user icon for everyone, so a user reads at a glance
	 * wherever the specification names it, on the design's avatar square (.ly-avatar,
	 * toner-2 and ink); an admin user carries a small shield on the tile's top-right
	 * corner, in the admin blue on a paper ring, as the request's diagrams draw it
	 * (ac-evo-func-uml).
	 */
	interface Props {
		admin: boolean;
		/** Pixel size of the tile. */
		size?: number;
		round?: boolean;
	}
	let { admin, size = 32, round = true }: Props = $props();

	const badge = $derived(Math.max(9, Math.round(size * 0.42)));
	const corner = $derived(round ? Math.round(-badge * 0.22) : Math.round(-badge * 0.35));
</script>

<span
	aria-hidden="true"
	class="relative flex flex-none items-center justify-center {round ? '' : 'rounded-xl'} bg-toner-2 text-ink"
	style:width="{size}px"
	style:height="{size}px"
	data-user-mark={admin ? 'admin' : 'end'}
>
	<Icon name="user" size={Math.round(size * 0.5)} />
	{#if admin}
		<span
			class="absolute flex items-center justify-center bg-evo-blue text-white ring-2 ring-white"
			style:width="{badge}px"
			style:height="{badge}px"
			style:top="{corner}px"
			style:right="{corner}px"
			data-admin-shield
		>
			<Icon name="shield" size={Math.max(6, Math.round(badge * 0.62))} />
		</span>
	{/if}
</span>
