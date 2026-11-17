<script lang="ts">
	import { Icon, pushToast } from '$ui/design-system';

	/**
	 * Hands a piece of work to the person's own AI (any MCP client bound to this
	 * install): copies the prompt that asks it, says so, then runs what follows
	 * on the page. The work itself comes back through the MCP, and the page
	 * re-reads it as it lands.
	 */
	interface Props {
		prompt: string;
		label: string;
		/** What the toast says once the prompt is copied. */
		copied?: string;
		/** The AI's button filled in the LLM's violet, or the design's unfilled button. */
		look?: 'gradient' | 'outline';
		/** What the page does once the prompt is copied, such as opening the tab the AI fills. */
		then?: () => void;
	}
	let { prompt, label, copied = 'Prompt copied: paste it into your AI. This page fills in as it writes.', look = 'gradient', then }: Props = $props();

	async function copy() {
		try {
			await navigator.clipboard.writeText(prompt);
			pushToast({ level: 'success', message: copied });
			then?.();
		} catch {
			pushToast({ level: 'error', message: 'The clipboard is not available here.' });
		}
	}
</script>

<button
	type="button"
	class="pressable inline-flex min-h-11 items-center gap-2 rounded-field border-[1.5px] border-ink px-4 text-xs font-bold tracking-[0.07em] uppercase {look === 'gradient' ? 'bg-violet-ink text-paper' : 'bg-transparent text-ink'}"
	title={prompt}
	onclick={copy}
>
	<Icon name="sparkles" size={14} />
	{label}
</button>
