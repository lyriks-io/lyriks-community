<script lang="ts">
	import { goto } from '$app/navigation';
	import { Icon } from '$ui/design-system';
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import type { FigureTone, OverviewFigure } from '$application/spec360/overview';

	/**
	 * One figure of the Overview (criteria 416e4885, f5909522), the design's
	 * .kp: a toner tile, its number large in mono with a hard shadow in its
	 * colour (deeper under the pointer), its label and its line; Health reads
	 * its word in its colour and, under it, what it measures in its own words
	 * (criterion f5909522). A click brings its section into view, or opens the
	 * page that tells it in full (Health); pointed at,
	 * it says what it weighs.
	 */
	let { figure }: { figure: OverviewFigure } = $props();

	const SHADOW: Record<FigureTone, string> = {
		blue: 'var(--color-blue)',
		violet: 'var(--color-violet)',
		green: 'var(--color-green)',
		orange: 'var(--color-orange)',
		red: 'var(--color-red)'
	};
	const WORD: Record<FigureTone, string> = {
		blue: 'text-blue-ink',
		violet: 'text-violet-ink',
		green: 'text-green-ink',
		orange: 'text-orange-ink',
		red: 'text-red-ink'
	};

	function go() {
		if (figure.href) return void goto(figure.href);
		document.getElementById(figure.target)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' });
	}
</script>

<button
	type="button"
	class="group/kp flex min-w-0 cursor-pointer items-center gap-3.5 border border-transparent bg-toner px-4 py-3.5 text-left text-ink transition-colors duration-150 hover:border-line"
	style:--pc={SHADOW[figure.tone]}
	title={figure.hint}
	aria-label="{figure.label}: {figure.value === '…' ? figure.line : `${figure.value}${figure.word ? `, ${figure.word.text}` : ''}, ${figure.line}`}{figure.about ? `. ${figure.about}` : ''}"
	onclick={go}
>
	<!-- A figure still being read waits in grey, with no colour of its own yet. -->
	<span
		class="flex-none font-evo-mono text-[2.375rem] leading-none font-bold tracking-[-0.02em] tabular-nums transition-[text-shadow] duration-100 {figure.value === '…'
			? 'text-ink-4'
			: '[text-shadow:0.06em_0.06em_0_var(--pc)] group-hover/kp:[text-shadow:0.09em_0.09em_0_var(--pc)]'}"
		aria-hidden="true">{figure.value}</span
	>
	<span class="grid min-w-0 gap-[3px]" aria-hidden="true">
		<span class="flex items-center gap-1.5 font-evo-mono text-[0.65625rem] leading-[1.3] tracking-[0.08em] text-ink-3 uppercase">
			{figure.label}
			{#if figure.noCode}<span class="inline-flex text-ink-3" title="No code linked: the health reads the specification alone"><Icon name="code" size={12} /></span>{/if}
		</span>
		<span class="truncate text-[0.78125rem] leading-[1.35] text-ink-2"
			>{#if figure.word}<b class="font-bold {WORD[figure.word.tone]}">{figure.word.text}</b>{' · '}{/if}{figure.line}</span
		>
		{#if figure.about}<span class="text-[0.6875rem] leading-[1.35] text-ink-3" data-figure-about>{figure.about}</span>{/if}
	</span>
</button>
