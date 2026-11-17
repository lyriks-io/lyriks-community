<script lang="ts">
	import { shell } from './shell-state.svelte';
	import SideIcon from './SideIcon.svelte';

	/**
	 * The slim paper bar above every page (criterion 8a6a568b): on a phone the
	 * Menu that opens the navigation (criterion d5c9c712). It holds no chip of
	 * the reader's AI: Ask my AI in the navigation alone says whether it is
	 * connected (criterion 4cb97f74). It names no
	 * trail: the navigation lights the section, the tab bar of Knowledge its
	 * chapter, and each page names itself. With nothing to hold, a wide screen
	 * shows no bar at all. It carries the role of the old app bar
	 * (data-app-bar): what sticks under the top of the page sticks under it.
	 */
</script>

<!-- A wide screen shows no bar; a phone keeps it for its Menu (criterion 8a6a568b). -->
<header data-app-bar class="lk-top bare">
	<button type="button" class="burger" aria-label="Menu" aria-expanded={shell.menuOpen} onclick={() => (shell.menuOpen = true)}><SideIcon name="menu" size={18} /></button>
</header>

<style>
	/* The design's top bar (.top, .burger): paper, a 2px ink rule under it. */
	.lk-top {
		position: relative;
		z-index: 20;
		display: flex;
		flex: none;
		align-items: center;
		gap: 12px;
		box-sizing: border-box;
		height: 56px;
		min-width: 0;
		padding: 0 20px;
		border-bottom: 2px solid var(--color-ink);
		background: var(--color-paper);
		color: var(--color-ink);
	}
	.burger {
		display: none;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		padding: 0;
		border: 1.5px solid var(--color-ink);
		background: var(--color-paper);
		color: var(--color-ink);
		cursor: pointer;
	}
	.burger:hover {
		background: var(--color-ink);
		color: var(--color-paper);
	}
	@media (min-width: 981px) {
		.lk-top.bare {
			display: none;
		}
	}
	@media (max-width: 980px) {
		.lk-top {
			padding: 0 16px;
		}
		.burger {
			display: inline-flex;
		}
	}
</style>
