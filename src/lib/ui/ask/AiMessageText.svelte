<script lang="ts">
	/**
	 * The words of the AI in a conversation (criterion 7f4690b0): a page of the
	 * installation it cites opens from its name; a link elsewhere reads as plain
	 * text. `origin` is the installation's own, as the browser reached it.
	 */
	import { messageSegments } from '$domain/ai-conversations';
	import { MORE } from '$ui/spec360/page/look';

	let { text, origin }: { text: string; origin: string } = $props();
	const parts = $derived(messageSegments(text, origin));
</script>

{#each parts as part, i (i)}{#if part.href}<a class="{MORE} underline decoration-1 underline-offset-2" href={part.href}>{part.text}</a>{:else}{part.text}{/if}{/each}
