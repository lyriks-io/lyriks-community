<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { DecisionAnswer, DecisionQuestion, FigureTone, MissingPiece } from '$domain/evolution';
	import { TONE } from './verdict-tones';
	import MeasureTable from './MeasureTable.svelte';

	/**
	 * The decision card (ac-evo-form-decision-brief): worth it, how big, how
	 * risky, and what is still missing to decide, each missing piece a link to
	 * where it is answered. Each question unfolds its Details under the card
	 * (ac-evo-form-decision-details); How big reads as a rank, never a bare count
	 * (ac-evo-form-decision-size-rank).
	 */
	interface Props {
		reading: { headline: string; tone: FigureTone; missing: readonly MissingPiece[]; answers: readonly DecisionAnswer[] };
		onJump: (piece: MissingPiece) => void;
	}
	let { reading, onJump }: Props = $props();
	const head = $derived(TONE[reading.tone]);

	let opened = $state<DecisionQuestion | null>(null);
	const shown = $derived(reading.answers.find((a) => a.key === opened && a.details.length > 0) ?? null);
	// What a person owes, apart from what the platform reads on its own (the impact).
	const owed = $derived(reading.missing.filter((m) => m.step === 'need'));
	const read = $derived(reading.missing.filter((m) => m.step !== 'need'));
</script>

<section class="rounded-card border border-transparent bg-surface" aria-label="To decide">
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b-[1.5px] border-ink px-4 py-2.5">
		<Icon name={head.icon} size={15} class={head.text} />
		<span class="text-sm font-bold {head.text}">{reading.headline}</span>
		{#each owed as piece (piece.key)}
			<button
				type="button"
				class="rounded-pill border-[1.5px] px-2 py-0.5 font-mono text-[0.6875rem] font-bold tracking-[0.06em] uppercase hover:underline {TONE.decide.badge}"
				onclick={() => onJump(piece)}
			>
				{piece.label}
			</button>
		{/each}
		{#each read as piece (piece.key)}
			<button
				type="button"
				class="ml-auto flex items-center gap-1 text-[0.6875rem] font-semibold hover:underline {TONE.todo.text}"
				onclick={() => onJump(piece)}
			>
				<Icon name={TONE.todo.icon} size={11} />
				{piece.label}: read at the Impact analysis
			</button>
		{/each}
	</div>
	<div class="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
		{#each reading.answers as a (a.key)}
			{@const look = TONE[a.tone]}
			{@const isOpen = opened === a.key}
			<div class="flex min-w-0 flex-col gap-1 px-4 py-3 {isOpen ? 'bg-surface-sunken' : ''}">
				<p class="font-mono text-xs tracking-[0.08em] text-ink-500 uppercase">{a.question}</p>
				<p class="flex items-start gap-1.5 text-sm font-bold {a.tone === 'ok' ? 'text-ink-900' : look.text}">
					<!-- A size is neither good nor bad: once known, it reads without a verdict icon. -->
					{#if !(a.key === 'size' && a.tone === 'ok')}<Icon name={look.icon} size={13} class="mt-0.5 shrink-0 {look.text}" />{/if}
					<!-- Shortened while closed; opened, it reads in full. Never a tooltip-only text. -->
					<span class={isOpen ? '' : 'line-clamp-2'}>{a.answer}</span>
				</p>
				{#if a.detail}<p class="text-xs text-ink-500 {isOpen ? 'whitespace-pre-line' : 'line-clamp-2'}">{a.detail}</p>{/if}
				{#if a.validation}
					<p class="flex items-center gap-1 font-mono text-[0.6875rem] font-bold {a.validation.validated ? TONE.ok.text : TONE.decide.text}">
						<Icon name={a.validation.validated ? TONE.ok.icon : TONE.decide.icon} size={11} />
						{a.validation.text}
					</p>
				{/if}
				{#if a.details.length > 0}
					<button
						type="button"
						class="mt-auto flex items-center gap-0.5 self-start pt-1 text-xs font-semibold text-blue-ink hover:underline"
						aria-expanded={isOpen}
						onclick={() => (opened = isOpen ? null : a.key)}
					>
						{isOpen ? 'Hide details' : 'Details'}
						<Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={12} />
					</button>
				{/if}
			</div>
		{/each}
	</div>
	{#if shown}
		<div class="grid gap-3 border-t border-line bg-surface-sunken px-4 py-3 md:grid-cols-2" aria-label="{shown.question} details">
			{#each shown.details as group (group.title)}
				<div class="min-w-0 space-y-1">
					<p class="flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.08em] text-ink-500 uppercase">
						{#if group.tone}<span class="size-2.5 {TONE[group.tone].dot}"></span>{/if}
						{group.title}
					</p>
					{#if group.measures}<MeasureTable measures={group.measures} />{/if}
					<ul class="space-y-1 text-xs">
						{#each group.items as item, i (i)}
							<li class="flex items-start gap-1.5">
								{#if item.tone}<Icon name={TONE[item.tone].icon} size={12} class="mt-0.5 shrink-0 {TONE[item.tone].text}" />{/if}
								<span class="min-w-0 text-ink-800">
									{item.label}
									{#if item.note}<span class="block text-[0.6875rem] text-ink-500">{item.note}</span>{/if}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</section>
