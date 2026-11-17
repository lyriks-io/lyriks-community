<script lang="ts">
	import { onDestroy } from 'svelte';
	import { zoomKeyLabel } from './wheel-zoom';

	/**
	 * Says how a drawing in a page zooms, for a moment, when a plain wheel
	 * scrolled the page over it (ac-diag-wheel). The drawing calls `poke()`.
	 */
	// Long enough to be read, short enough not to stay in the way.
	const SHOWN_MS = 1400;
	let shown = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const key = zoomKeyLabel();

	export function poke() {
		shown = true;
		clearTimeout(timer);
		timer = setTimeout(() => (shown = false), SHOWN_MS);
	}
	onDestroy(() => clearTimeout(timer));
</script>

<div
	class="pointer-events-none absolute inset-0 z-20 grid place-items-center transition-opacity duration-200 {shown ? 'opacity-100' : 'opacity-0'}"
	aria-hidden="true"
>
	<span class="bg-ink px-3 py-2 font-evo text-sm font-medium text-paper">{key} + scroll to zoom</span>
</div>
