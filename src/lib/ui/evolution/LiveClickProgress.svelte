<script lang="ts">
	import { confirmDialog } from '$ui/design-system';
	import { useLiveSession, type LiveClick } from './live-session.svelte';

	/**
	 * What the reader's AI does on a click they made, shown where they made it
	 * (ac-evo-live-click-state): thinking or writing, its latest step numbered
	 * from the click, and Cancel, which undoes what it wrote for it
	 * (ac-evo-live-cancel). The header of the request only says it is connected.
	 */
	interface Props {
		/** A click the AI took. */
		click: LiveClick;
		/** What the place calls the AI's work before it says a step of its own. */
		label?: string;
		/** One 28 px target, for the strip that follows a long section (ac-evo-form-controls-follow): what the AI does on hover, Cancel on a click. */
		compact?: boolean;
	}
	let { click, label = 'Lyriks is on it', compact = false }: Props = $props();

	const live = useLiveSession();
	const progress = $derived(live?.progressOf(click) ?? null);
	const doing = $derived(progress ? `${progress.writing ? 'Lyriks is writing' : 'Lyriks is thinking'}${progress.saying ? ` · ${progress.step ? `Step ${progress.step} · ` : ''}${progress.saying}` : ''}` : label);
	/** Once confirmed, the click reads cancelled at once while the server undoes what the AI wrote (ac-evo-form-edit-optimistic). */
	async function cancel() {
		if (!live) return;
		if (
			!(await confirmDialog({
				title: 'Cancel what Lyriks is doing?',
				message: 'Everything it wrote for this request goes back to what it was. What someone changed since stays.',
				confirmLabel: 'Cancel the request'
			}))
		)
			return;
		await live.cancel(click.id);
	}
</script>

{#if compact}
	<button type="button" class="grid size-7 place-items-center rounded-lg bg-violet-tint" title={progress ? `${doing} · click to cancel` : doing} aria-label={progress ? `${doing}: cancel` : doing} disabled={!progress} onclick={cancel}>
		<span class="animate-lk-spin size-3 rounded-full border-2 border-violet/30 border-t-violet-ink" aria-hidden="true"></span>
	</button>
{:else}
<span class="inline-flex min-h-9 max-w-104 items-center gap-1.5 rounded-lg bg-violet-tint px-2.5 font-evo-mono text-xs text-violet-ink" role="status" aria-live="polite">
	<span class="animate-lk-spin size-3 flex-none rounded-full border-2 border-violet/30 border-t-violet-ink" aria-hidden="true"></span>
	<span class="min-w-0 truncate" title={doing}>{doing}</span>
	{#if progress}
		<button type="button" class="quiet flex-none font-evo text-violet-ink" onclick={cancel}>Cancel</button>
	{/if}
</span>
{/if}
