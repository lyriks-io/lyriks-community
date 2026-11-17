<script lang="ts">
	import AiPromptButton from '$ui/evolution/AiPromptButton.svelte';

	/**
	 * A view of Technology & data with nothing yet (criterion 0b935dad): what it holds, what fills it, and the one
	 * step that starts it, for who may write: a prompt for the reader's own AI.
	 */
	let { headline, text, prompt = null }: { headline: string; text: string; prompt?: string | null } = $props();
</script>

<div class="flex flex-wrap items-center justify-between gap-4 border border-dashed border-ink-3 bg-surface px-5 py-4">
	<p class="m-0 max-w-[62ch] text-sm leading-[1.5] text-ink-2"><b class="font-semibold text-ink">{headline}</b> {text}</p>
	{#if prompt}<AiPromptButton {prompt} label="Describe it with my AI" look="outline" />{/if}
</div>
