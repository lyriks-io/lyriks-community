<script lang="ts">
	import { shell } from './shell-state.svelte';

	/**
	 * The head of the navigation: the Lyriks logo, which leads Home, and the
	 * button that folds the navigation. Folded, the button is the Lyriks mark
	 * (the logo's three bars) with a small arrow at its side, so the column reads
	 * as one that opens; pointed at or reached by the keyboard, the mark gives
	 * way to the unfold icon (criterion 53c5c6f0). Its styles live with the
	 * navigation's (AppSidebar.svelte).
	 */
	interface Props {
		/** Folded as this browser keeps it: what the button's name and tooltip say a click does. */
		folded: boolean;
		/** Drawn folded to its icons (never on a phone). */
		iconsOnly: boolean;
	}
	let { folded, iconsOnly }: Props = $props();
</script>

<div class="sh">
	<a href="/" aria-label="Lyriks, home" class="logo"><img src="/brand/lyriks-logo-on-ink.png" alt="" /></a>
	<button
		type="button"
		class="sbtog"
		aria-label={folded ? 'Expand the sidebar' : 'Collapse the sidebar'}
		title={folded ? 'Expand the sidebar ( [ )' : 'Collapse the sidebar ( [ )'}
		data-tip={folded ? 'Expand the sidebar ( [ )' : undefined}
		onclick={() => shell.fold(!shell.folded)}
	>
		<svg class="pn" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"><rect x="3" y="4" width="18" height="16"></rect><path d="M9 4v16"></path><path class="ar" d="M15.5 9.5L13 12l2.5 2.5"></path></svg>
		<!-- Folded, the Lyriks mark (the logo's three bars) stands in for the arrow, a small arrow at its side saying the column opens (criterion 53c5c6f0). -->
		{#if iconsOnly}
			<svg class="mk" viewBox="0 0 30 18" width="30" height="18" aria-hidden="true">
				<rect x="0" y="1" width="11" height="4" fill="var(--color-blue)"></rect>
				<rect x="0" y="7" width="11" height="4" fill="var(--color-violet)"></rect>
				<rect x="0" y="13" width="19" height="4" fill="var(--color-orange)"></rect>
				<path d="M24.5 6l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"></path>
			</svg>
		{/if}
	</button>
</div>
