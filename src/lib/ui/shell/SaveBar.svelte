<script lang="ts">
	import { Icon, type Tone } from '$ui/design-system';

	type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

	interface Props {
		saveStatus: SaveStatus;
		/**
		 * Per-capability local coherence chip. Still accepted so no page has to
		 * change, but no longer drawn: the one Project health is read on the Overview.
		 */
		coherence?: { score: number; tone: Tone; label: string } | null;
	}
	let { saveStatus }: Props = $props();
</script>

<!-- No footer bar any more: the save state is a small indicator floating at the
     bottom right of the page, where it takes no row from the content. -->

<!-- Hidden for now, kept to bring back: the helper line and the local coherence
     chip. The one Project health is read on the Overview.

<footer
	class="@container sticky bottom-0 z-10 flex items-center gap-4 border-t border-line bg-surface/85 px-6 py-3 backdrop-blur"
>
	<span class="hidden min-w-0 flex-1 truncate text-xs text-ink-400 @2xl:block">
		Navigate freely - every capability is open. Project health is read on the Overview.
	</span>

	<div class="ml-auto flex items-center gap-4">
		{#if coherence}
			<div class="flex items-center gap-2">
				<ScoreRing score={coherence.score} tone={coherence.tone} size={36} />
				<div class="hidden text-right leading-tight sm:block">
					<p class="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
						Local coherence
					</p>
					<p class="text-xs font-semibold {toneText[coherence.tone]}">{coherence.label}</p>
				</div>
			</div>
			<span class="h-6 w-px bg-line"></span>
		{/if}
	</div>
</footer>
-->

<!-- role=status + aria-live so screen-reader users are told when work saves,
     is saving, or fails (was a silent visual-only cue). Status text uses the
     -700 ramp step to meet WCAG AA contrast as small text. -->
<div
	role="status"
	aria-live="polite"
	aria-atomic="true"
	class="pointer-events-none fixed right-4 bottom-[calc(var(--app-foot-h,0px)+16px)] z-20"
>
	{#if saveStatus === 'saved'}
		<span
			class="inline-flex items-center gap-1 border-[1.5px] border-green bg-green-tint px-2.5 py-1 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-green-ink uppercase"
		>
			<Icon name="check" size={12} /> Saved
		</span>
	{:else if saveStatus === 'saving'}
		<span
			class="inline-flex items-center gap-1.5 border-[1.5px] border-line bg-paper px-2.5 py-1 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-ink-3 uppercase"
		>
			<span class="size-2 animate-pulse bg-orange"></span> Saving…
		</span>
	{:else if saveStatus === 'error'}
		<span
			class="inline-flex items-center gap-1 border-[1.5px] border-red-ink bg-red-tint px-2.5 py-1 text-[0.6875rem] font-semibold text-red-ink"
		>
			<Icon name="info" size={12} /> Save failed - your last change may be unsaved
		</span>
	{/if}
</div>
