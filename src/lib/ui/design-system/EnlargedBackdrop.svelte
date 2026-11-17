<script lang="ts">
	import { portalWhile, type DiagramEnlarger } from './enlarge.svelte';

	interface Props {
		enlarger: DiagramEnlarger;
	}
	let { enlarger }: Props = $props();
</script>

<!-- The page behind an enlarged diagram, dimmed; a click on it closes the dialog like Escape. -->
{#if enlarger.enlarged}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div use:portalWhile={true} class="fixed inset-0 z-[59] bg-ink-900/40" onclick={() => enlarger.close()}></div>
{/if}
