<script lang="ts">
	import { goto } from '$app/navigation';
	import { DIALOG, PRESS_FILL, PRESS_LINE, TAG_VALID } from './page/look';

	/**
	 * The Specification 360° just switched from DRAFT to VALIDATED: the team is
	 * congratulated, then reads the validated spec or creates its first
	 * evolution, which is simulated against it.
	 */
	interface Props {
		productName: string;
		/** How many elements the team validated. */
		total: number;
		evolutionsHref: string;
		onClose: () => void;
	}
	let { productName, total, evolutionsHref, onClose }: Props = $props();

	// The palette's hues, from its tokens.
	const COLORS = ['blue', 'violet', 'orange', 'green', 'magenta', 'red'].map((hue) => `var(--color-${hue})`);
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
	const elements = $derived(`${total} ${total === 1 ? 'element' : 'elements'}`);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div role="dialog" aria-modal="true" aria-label="Specification validated" class="animate-lk-fade fixed inset-0 z-[90] box-border flex items-center justify-center overflow-hidden bg-ink/45 p-4">
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
	<div class="animate-lk-burst relative box-border flex w-[520px] max-w-full flex-col items-center gap-3.5 {DIALOG} px-7 pt-8 pb-[26px] text-center">
		<span aria-hidden="true" class="animate-lk-pop grid size-[72px] place-items-center bg-green text-4xl font-extrabold text-ink">✓</span>
		<span class={TAG_VALID}>DRAFT → VALIDATED</span>
		<h2 class="m-0 text-[1.625rem] leading-[1.2] font-bold tracking-[-0.03em]">Congratulations!</h2>
		<span class="text-[0.9375rem] leading-[1.55] text-evo-ink-3"
			>{elements} validated by your team. The specification of {productName} is now the reference: every evolution will be simulated against it.</span
		>
		<div class="mt-1.5 flex flex-wrap justify-center gap-2.5">
			<button type="button" class="{PRESS_LINE} min-h-11 px-[18px] text-xs" onclick={onClose}>See the validated spec</button>
			<button
				type="button"
				class="{PRESS_FILL} min-h-11 px-[18px] text-xs"
				onclick={() => {
					onClose();
					void goto(evolutionsHref);
				}}>Create a first evolution →</button
			>
		</div>
	</div>
</div>
