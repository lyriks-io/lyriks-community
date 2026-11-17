<script lang="ts">
	import type { Snippet } from 'svelte';
	import { intoAppFoot } from './app-foot';

	/**
	 * A page's foot actions (the step's next move, the page before and after),
	 * kept in view: they live in the app's foot under the scroller, across the
	 * window like the app bar, rather than at the end of a long page. The bar
	 * stays low: its buttons read compact there (app.css, #app-foot).
	 */
	interface Props {
		/** The id the bar carries (evo-scroll STEP_FOOT_ID: where a validation sends the reader once nothing waits). */
		id?: string | null;
		/** How the actions are laid out in the bar. */
		class?: string;
		children: Snippet;
	}
	let { id = null, class: layout = '', children }: Props = $props();
</script>

<!-- The wrapper stays in the page, so Svelte never walks the bar where it moved. -->
<div class="contents">
	<div id={id ?? undefined} class="border-t-[1.5px] border-ink bg-paper py-2" {@attach intoAppFoot}>
		<div class="mx-auto box-border w-full max-w-[1200px] px-6 {layout}">{@render children()}</div>
	</div>
</div>
