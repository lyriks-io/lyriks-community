<script lang="ts">
	import { onMount } from 'svelte';
	import { REVIEW_BUTTON, SECTION_TITLE } from './evo-look';
	import { choiceLabel, chooseForAllOffers, elementHref, lineOffers, touchedBand, waitsOnText, type TouchedAbility } from './touched-validation';
	import type { TouchedValidationState } from './touched-validation.svelte';

	/**
	 * The block Not validated in Knowledge of the Simulation (EVO-003): every
	 * existing element the change touches that nobody validated in Knowledge,
	 * where it sits and whom it waits on, with its two choices: Validate now
	 * (the reader's own validation, as on the Specification 360°) or Validate at
	 * the landing. Nothing is held: the freeze sets what is left to the landing.
	 */
	interface Props {
		projectId: string;
		touched: TouchedValidationState;
		ability: TouchedAbility;
	}
	let { projectId, touched, ability }: Props = $props();

	onMount(() => void touched.load());

	const reading = $derived(touched.reading);
	const lines = $derived(touched.lines);
	const forAll = $derived(chooseForAllOffers(lines, ability));
	const band = $derived(reading ? touchedBand({ ...reading, lines }) : null);
</script>

{#if reading}
	<section id="touched-validation" aria-label="Not validated in Knowledge" class="flex flex-col gap-4 rounded-evo-card border border-transparent bg-surface p-6">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h3 class={SECTION_TITLE}>Not validated in Knowledge</h3>
			{#if forAll.atLanding || forAll.validateNow}
				<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Choose for all">
					<span class="text-xs text-ink-3">Choose for all:</span>
					{#if forAll.validateNow}
						<button type="button" class={REVIEW_BUTTON} disabled={touched.busy} onclick={() => void touched.validateNow(lines.filter((l) => l.choice === 'none').map((l) => l.id))}>Validate now</button>
					{/if}
					{#if forAll.atLanding}
						<button type="button" class={REVIEW_BUTTON} disabled={touched.busy} onclick={() => void touched.allAtLanding()}>Validate at the landing</button>
					{/if}
				</div>
			{/if}
		</div>
		<p class="text-sm text-ink-2" data-testid="touched-band">{band}</p>
		{#if lines.length > 0}
			<ul class="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-toner-1">
				{#each lines as line (line.id)}
					{@const offers = lineOffers(line, ability)}
					{@const chosen = choiceLabel(line)}
					<li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-element={line.id}>
						<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
							<a class="text-sm font-bold text-evo-ink underline-offset-2 hover:underline" href={elementHref(projectId, line.id)}>{line.title}</a>
							<span class="text-xs text-ink-3">{line.place ? `${line.place} · ` : ''}{line.relation === 'used' ? 'Built on' : 'Amended'} · {waitsOnText(line.waitsOn)}</span>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							{#if chosen}<span class="text-xs font-bold text-evo-green">{chosen}</span>{/if}
							{#if offers.validateNow}
								<button type="button" class={REVIEW_BUTTON} disabled={touched.busy} onclick={() => void touched.validateNow([line.id])}>Validate now</button>
							{/if}
							{#if offers.atLanding}
								<button type="button" class={REVIEW_BUTTON} disabled={touched.busy} onclick={() => void touched.atLanding(line.id)}>Validate at the landing</button>
							{/if}
							{#if offers.takeBack}
								<button type="button" class="text-xs text-ink-3 underline underline-offset-2" disabled={touched.busy} onclick={() => void touched.takeBack(line.id)}>Take back</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		{#if ability.frozen && lines.length > 0}
			<p class="text-xs text-ink-3">The version is frozen: its choices read only until a rebrief reopens it.</p>
		{/if}
	</section>
{:else if touched.failed}
	<section aria-label="Not validated in Knowledge" class="rounded-evo-card bg-surface p-6 text-sm text-ink-2">Knowledge could not be read: the rest of the Simulation reads as usual.</section>
{/if}
