<script lang="ts">
	import { DIALOG, PRESS_FILL } from './page/look';

	/**
	 * Every element of the Specification 360° is validated while it is still a
	 * DRAFT: the team is asked to validate it definitively, one button, the act
	 * the validation card offers too. The celebration follows. Escape or a click
	 * beside it puts the question off for this visit; the card stays.
	 */
	interface Props {
		/** How many elements the team validated. */
		total: number;
		/** True while the definitive validation is on its way. */
		busy: boolean;
		onFinalize: () => void;
		onLater: () => void;
	}
	let { total, busy, onFinalize, onLater }: Props = $props();

	const lead = $derived(total === 1 ? 'The one element of the specification is validated.' : `All ${total} elements of the specification are validated.`);
	let button = $state<HTMLButtonElement | null>(null);
	$effect(() => button?.focus());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onLater()} />

<div
	role="dialog"
	aria-modal="true"
	aria-label="Everything is validated"
	class="animate-lk-fade fixed inset-0 z-[89] box-border flex items-center justify-center bg-ink/45 p-4"
>
	<button type="button" aria-label="Later" tabindex="-1" class="absolute inset-0 cursor-default border-0 bg-transparent" onclick={onLater}></button>
	<div class="relative box-border flex w-full max-w-[460px] flex-col items-center gap-3.5 {DIALOG} px-[26px] pt-7 pb-[22px] text-center">
		<span aria-hidden="true" class="grid size-14 place-items-center bg-green text-[1.625rem] font-bold text-ink">✓</span>
		<h2 class="m-0 text-[1.3125rem] leading-[1.3] font-bold tracking-[-0.02em] text-evo-ink">Everything is validated</h2>
		<p class="m-0 text-sm leading-[1.55] text-evo-ink-3">
			{lead} Validate it definitively: its status switches from <b class="text-evo-orange">DRAFT</b> to <b class="text-evo-green">VALIDATED</b>, and evolutions open.
		</p>
		<div class="mt-1 flex flex-wrap justify-center gap-2">
			<button
				bind:this={button}
				type="button"
				class="{PRESS_FILL} min-h-[42px] px-[18px] text-xs"
				disabled={busy}
				aria-busy={busy}
				onclick={onFinalize}>{busy ? 'Saving…' : 'Validate definitively'}</button
			>
		</div>
	</div>
</div>
