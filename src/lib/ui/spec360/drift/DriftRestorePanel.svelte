<script lang="ts">
	import { copyPrompt } from '$ui/evolution/copy-prompt';
	import { BTN, BTN_MAIN, LINK } from '../page/look';

	/**
	 * The brief that restores the behaviour the spec describes (criterion
	 * 53e7e3da): prefilled with what Lyriks knows of the change, edited at will,
	 * then copied for the reader's AI. While the change waits, it is also where
	 * the change is rejected. Lyriks hands nothing to a tracker or a repository
	 * itself: the reader's own AI does, with the brief.
	 */
	interface Props {
		/** The brief, bound: an edit survives the panel closing and opening again. */
		brief: string;
		/** The change still waits and the reader may decide on it: the panel offers to reject it. */
		canReject: boolean;
		busy: boolean;
		onReject: () => void;
		onClose: () => void;
	}
	let { brief = $bindable(), canReject, busy, onReject, onClose }: Props = $props();
	/** Rejecting is destructive: the filled button in red ink. */
	const DANGER = BTN_MAIN.replace('bg-evo-violet', 'bg-red-ink');
</script>

<div class="animate-lk-in-fast mt-3.5 border-[1.5px] border-line bg-surface-sunken px-4 py-3.5" role="region" aria-label="Brief to restore the previous version">
	<b class="text-[0.9375rem] text-ink">Brief to restore the previous version</b>
	<p class="m-0 mt-1.5 mb-2 text-sm text-ink-2">Edit it if needed, then copy it into your AI coding tool or send it to your AI.</p>
	<label class="block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase"
		>Restore brief<textarea
			bind:value={brief}
			spellcheck="false"
			class="mt-1.5 mb-2.5 box-border block min-h-[190px] w-full resize-y border-[1.5px] border-ink-3 bg-paper px-2.5 py-2 font-evo-mono text-xs font-normal leading-normal tracking-normal text-ink normal-case outline-none focus:border-blue"
		></textarea></label
	>
	<div class="flex flex-wrap items-center gap-1.5">
		{#if canReject}
			<button type="button" class="{DANGER} max-[700px]:min-h-11" disabled={busy} onclick={onReject}>Reject the change</button>
		{/if}
		<button type="button" class="{BTN} max-[700px]:min-h-11" onclick={() => void copyPrompt(brief, 'Brief copied')}>Copy the brief</button>
		<button
			type="button"
			class="{BTN} max-[700px]:min-h-11"
			title="Copies the brief for your AI coding tool: it restores the code, then syncs the implementation index"
			onclick={() => void copyPrompt(brief, 'Brief copied: paste it in your AI coding tool. It restores the code, then syncs the implementation index.')}
			>Send to my AI</button
		>
		<button type="button" class="{LINK} max-[700px]:min-h-11" onclick={onClose}>Close</button>
	</div>
</div>
