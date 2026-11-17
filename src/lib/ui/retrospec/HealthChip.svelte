<script lang="ts">
	import { healthAbout, healthHint } from '$application/spec360/overview';
	import { floatInView } from '$ui/design-system';

	/**
	 * Project health beside what Lyriks noticed (criterion 1b4a3935): the
	 * Overview's Health figure, its score and its word on a chip, what it
	 * measures and what it weighs in the Overview's own words on hover or
	 * keyboard focus. Nothing to act on here.
	 */
	interface Props {
		health: {
			readonly score: number;
			readonly verdict: 'strong' | 'watch' | 'critical';
			readonly blocking: number;
			readonly total: number;
			readonly codeLinked?: boolean;
		};
	}
	let { health }: Props = $props();

	const TONE = {
		// The design's tags: validated green, to watch orange, a gap red ink.
		strong: { chip: 'border-green bg-green text-ink', word: 'Strong' },
		watch: { chip: 'border-orange bg-orange text-ink', word: 'To watch' },
		critical: { chip: 'border-red-ink bg-red-ink text-paper', word: 'Critical' }
	} as const;
	const tone = $derived(TONE[health.verdict]);

	// Shown while the pointer rests on the chip or the keyboard is on it, as before; it floats under <body> so no box cuts
	// it, inside the window (criterion 5651ca29). Its words stay in the page for the screen reader the chip points to.
	let root = $state<HTMLElement>();
	let hovered = $state(false);
	let focused = $state(false);
	const shown = $derived(hovered || focused);
</script>

{#snippet words()}
	<span class="text-sm font-bold text-ink">Project health · {health.score}/100 · {tone.word}</span>
	<span>{healthAbout(health)}.</span>
	<span>{healthHint(health)}</span>
	<span class="text-ink-3">It rises as your team settles the points listed in Health. Nothing to do now.</span>
{/snippet}

<span
	bind:this={root}
	class="relative inline-flex"
	role="presentation"
	onpointerenter={() => (hovered = true)}
	onpointerleave={() => (hovered = false)}
	onfocusin={() => (focused = true)}
	onfocusout={() => (focused = false)}
>
	<button
		type="button"
		class="inline-flex min-h-7 cursor-help items-center gap-1.5 border-[1.5px] px-2.5 font-evo-mono text-xs font-bold tracking-[0.06em] uppercase {tone.chip}"
		aria-describedby="health-tip"
	>
		Project health {health.score}/100 · {tone.word}
		<span aria-hidden="true" class="grid size-3.5 place-items-center border border-current text-[0.5625rem] leading-none">i</span>
	</button>
	<span id="health-tip" class="sr-only">{@render words()}</span>
	{#if shown}
		<span
			use:floatInView={{ anchor: root, align: 'right' }}
			aria-hidden="true"
			class="pointer-events-none box-border flex w-[320px] max-w-[80vw] animate-lk-in-fast flex-col gap-1.5 border-[1.5px] border-ink bg-paper p-3.5 text-left text-[0.8125rem] leading-normal font-normal text-ink-2 shadow-pop"
		>{@render words()}</span>
	{/if}
</span>
