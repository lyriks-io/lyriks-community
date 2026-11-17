<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The success dialog that ends a long piece of work (a retrospecification, an
	 * evolution gone live): confetti behind a card with the check, a kicker that
	 * names what ended and a title; what the work left and the way on are the
	 * caller's. Escape closes it.
	 */
	interface Props {
		/** What ended, for assistive technology: "Retrospecification complete". */
		label: string;
		kicker: string;
		title: string;
		onClose: () => void;
		children: Snippet;
	}
	let { label, kicker, title, onClose, children }: Props = $props();

	// The palette's hues, as tokens.
	const COLORS = ['var(--color-blue)', 'var(--color-violet)', 'var(--color-orange)', 'var(--color-green)', 'var(--color-magenta)', 'var(--color-red)'];
	// A fixed scatter, the same at every opening: decoration, nothing measured.
	const confetti = Array.from({ length: 36 }, (_, i) => {
		const r = (n: number) => ((i * 7919 + n * 104729) % 997) / 997;
		return {
			left: Math.round(r(1) * 100),
			width: 6 + Math.round(r(2) * 5),
			height: 10 + Math.round(r(3) * 6),
			round: i % 2 === 0,
			color: COLORS[i % COLORS.length],
			duration: (2.6 + r(4) * 2).toFixed(1),
			delay: (r(5) * 2.2).toFixed(2)
		};
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div role="dialog" aria-modal="true" aria-label={label} class="animate-lk-fade fixed inset-0 z-[90] box-border flex items-center justify-center overflow-hidden bg-ink/45 p-4">
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
		{#each confetti as c, i (i)}
			<span
				class="absolute -top-5 {c.round ? '' : ''}"
				style:left="{c.left}%"
				style:width="{c.width}px"
				style:height="{c.height}px"
				style:background={c.color}
				style:animation="lk-fall {c.duration}s linear {c.delay}s infinite"
			></span>
		{/each}
	</div>
	<div class="animate-lk-burst relative box-border flex w-[560px] max-w-full flex-col items-center gap-3.5 border-2 border-ink bg-paper px-7 pt-8 pb-[26px] text-center shadow-pop">
		<span aria-hidden="true" class="animate-lk-pop grid size-[72px] place-items-center bg-green text-4xl font-extrabold text-ink">✓</span>
		<span class="border-[1.5px] border-green bg-green px-3 py-1 font-evo-mono text-xs font-bold tracking-[0.06em] text-ink uppercase">{kicker}</span>
		<h2 class="m-0 text-[1.625rem] leading-[1.2] font-bold tracking-[-0.02em] text-ink">{title}</h2>
		{@render children()}
	</div>
</div>
