<script lang="ts">
	import { Icon, ScoreRing, toneText, type Tone } from '$ui/design-system';

	type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

	interface Props {
		saveStatus: SaveStatus;
		/** Per-capability local coherence chip (optional). */
		coherence?: { score: number; tone: Tone; label: string } | null;
	}
	let { saveStatus, coherence = null }: Props = $props();
</script>

<!-- @container : the helper text shows (and stays on ONE truncating line) only
     when the footer itself is wide enough — it can be narrow under a sidebar even
     on a wide screen, where it used to wrap to several lines and bloat the bar. -->
<footer
	class="@container sticky bottom-0 z-10 flex items-center gap-4 border-t border-line bg-surface/85 px-6 py-3 backdrop-blur"
>
	<span class="hidden min-w-0 flex-1 truncate text-xs text-ink-400 @2xl:block">
		Navigate freely - every capability is open. Spec health is tracked in the Control Center.
	</span>

	<div class="ml-auto flex items-center gap-4">
		{#if coherence}
			<div class="flex items-center gap-2">
				<ScoreRing score={coherence.score} tone={coherence.tone} size={36} />
				<div class="hidden text-right leading-tight sm:block">
					<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
						Local coherence
					</p>
					<p class="text-xs font-semibold {toneText[coherence.tone]}">{coherence.label}</p>
				</div>
			</div>
			<span class="h-6 w-px bg-line"></span>
		{/if}

		<!-- role=status + aria-live so screen-reader users are told when work saves,
		     is saving, or fails (was a silent visual-only cue). Status text uses the
		     -700 ramp step to meet WCAG AA contrast as small text. -->
		<div role="status" aria-live="polite" aria-atomic="true">
			{#if saveStatus === 'saved'}
				<span class="flex items-center gap-1.5 text-xs font-medium text-success-700">
					<Icon name="check" size={14} /> Auto-saved
				</span>
			{:else if saveStatus === 'saving'}
				<span class="flex items-center gap-1.5 text-xs font-medium text-ink-600">
					<span class="size-2 animate-pulse rounded-full bg-ink-400"></span> Saving…
				</span>
			{:else if saveStatus === 'error'}
				<span class="flex items-center gap-1.5 text-xs font-medium text-danger-700">
					<Icon name="info" size={14} /> Save failed - your last change may be unsaved
				</span>
			{/if}
		</div>
	</div>
</footer>
