<script lang="ts" module>
	import type { DossierCounts } from '$lib/server/evolution-view.server';
	import type { GradedItem } from './impact-board';

	export type SimulationPoint = DossierCounts['docking']['points'][number];
	export type SimulationItem = GradedItem<SimulationPoint>;

	/** The ways a major impact is decided on the page: only what the platform really does. */
	export interface DecisionOption {
		readonly id: 'fix' | 'risk';
		readonly letter: string;
		readonly label: string;
		readonly description: string;
	}

	/**
	 * A finding is fixed where it lives in the specification, or accepted as a
	 * known risk with a reason (decide_finding). Nothing else decides one, so a
	 * point no finding stands behind offers nothing to choose.
	 */
	export function decisionOptions(item: SimulationItem): DecisionOption[] {
		const point = item.point;
		const options: Omit<DecisionOption, 'letter'>[] = [
			...(point?.fixTarget
				? [{ id: 'fix' as const, label: 'Fix it where it lives', description: 'Opens the element of the specification the finding names, to change it there.' }]
				: []),
			...(point?.findingId
				? [
						{
							id: 'risk' as const,
							label: 'Accept it as a known risk',
							description:
								item.qualification === 'collision'
									? 'The finding stays on the request with your reason, and no longer holds it at the gate.'
									: 'The finding stays on the request with your reason, marked as decided.'
						}
					]
				: [])
		];
		return options.map((o, i) => ({ ...o, letter: 'ABCD'.charAt(i) }));
	}
</script>

<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { personKey } from '$domain/evolution';
	import { initials } from '$ui/team/team-style';
	import BlockControls, { type ValidateControl } from './BlockControls.svelte';
	import { KICKER, NEXT_BAND, NEXT_BAND_TEXT, PRIMARY_44, SECONDARY_44, primary44 } from './evo-look';
	import { personName } from './people';

	/**
	 * One impact of the Simulation in the details, the design's card for its
	 * grade: a major one says what blocks or is to decide and how it is decided,
	 * a minor one what has to change, a compatible one why it holds. The design's
	 * drawings beside the text (data schema, calculation flow, before and after)
	 * are left out: the platform draws none of them per impact.
	 */
	interface Props {
		item: SimulationItem;
		open: boolean;
		onToggle: () => void;
		/** The next best action of the tab: its decision is the only violet one. */
		isNext: boolean;
		/** Whether the person asked for the ways to decide it. */
		deciding: boolean;
		onDecide: () => void;
		onAcceptRisk: (letter: string) => void;
		onTakeBack: () => void;
		onFix: (target: string) => void;
		onSheet: () => void;
		/** Where the person goes once it is decided. */
		next: { readonly label: string; readonly go: () => void } | null;
		canEdit: boolean;
		actorId: string;
		members: readonly { id: string; name: string }[];
	}
	let { item, open, onToggle, isNext, deciding, onDecide, onAcceptRisk, onTakeBack, onFix, onSheet, next, canEdit, actorId, members }: Props = $props();

	// A tile inside its section's sand block, its grade on a 6px edge drawn inside it (red major, orange minor), as the design marks a severity.
	const BORDER = { major: 'shadow-[inset_6px_0_0_var(--color-red)]', minor: 'shadow-[inset_6px_0_0_var(--color-orange)]', compatible: '' } as const;
	const options = $derived(item.grade === 'major' ? decisionOptions(item) : []);
	const risk = $derived(item.point?.risk ?? null);
	const riskOption = $derived(options.find((o) => o.id === 'risk') ?? null);
	const shown = $derived(deciding || !!risk);

	function riskControl(letter: string): ValidateControl {
		if (risk) {
			const name = personName(risk.by, members);
			const mine = personKey(risk.by) === personKey(actorId);
			return {
				look: mine ? 'mine' : 'done',
				title: mine ? `You validated option ${letter} · click to withdraw` : `Validated by ${name} · click to withdraw`,
				run: canEdit ? onTakeBack : null,
				withdraws: true,
				stamps: [{ id: risk.by, initials: mine ? 'YOU' : initials(name), title: `${name} · validated`, ok: true, me: mine, name }],
				settled: true
			};
		}
		return { look: 'grey', title: `Validate option ${letter}`, run: canEdit ? () => onAcceptRisk(letter) : null, what: `option ${letter}`, stamps: [], settled: false };
	}
	const sheetLink = 'self-start text-left text-[0.8125rem] font-semibold text-blue-ink hover:underline';
</script>

<div id="sim-{item.code}" class="overflow-hidden rounded-evo-card border border-transparent bg-toner-1 {BORDER[item.grade]}">
	<button
		type="button"
		class="flex w-full flex-wrap items-center gap-4 px-5 text-left text-evo-ink {item.grade === 'compatible' ? 'min-h-14 py-3.5' : 'min-h-16 py-4'}"
		aria-expanded={open}
		onclick={onToggle}
	>
		<span class="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5"><span class="text-base font-bold">{item.label}</span></span>
		{#if risk && riskOption}
			<span class="inline-flex items-center gap-1.5 bg-green-tint px-2.5 py-1 font-evo-mono text-xs font-bold whitespace-nowrap text-green-ink">✓ Option {riskOption.letter} · {riskOption.label}</span>
		{/if}
		<Icon name="chevron-down" size={20} class="transition-transform duration-200 {open ? 'rotate-180' : ''}" />
	</button>

	{#if open}
		{#if item.grade === 'major'}
			<div class="flex flex-col gap-6 px-6 pb-6">
				<div class="flex min-w-0 flex-col gap-2.5">
					<span class={KICKER}>{item.qualification === 'collision' ? 'Blocking point' : 'To decide'}</span>
					<p class="text-base leading-[1.55] font-medium text-evo-ink">{item.reason}</p>
					{#if item.note}
						<div class="animate-lk-in rounded-lg bg-red-tint px-3.5 py-3 text-sm leading-normal text-evo-ink shadow-[inset_6px_0_0_var(--color-red)]"><b class="text-red-ink">Lyriks findings:</b> {item.note}</div>
					{/if}
					<button type="button" class={sheetLink} onclick={onSheet}>Open the full problem sheet →</button>
				</div>
				{#if options.length > 0 && !shown}
					<div class="flex justify-end">
						<button type="button" class={primary44(isNext)} onclick={onDecide}>Make a decision →</button>
					</div>
				{/if}
				{#if options.length > 0 && shown}
					<div class="animate-lk-in flex flex-col gap-3">
						<span class={KICKER}>Suggested workarounds</span>
						<div class="flex flex-wrap gap-4">
							{#each options as option (option.id)}
								<div class="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-evo-btn border-[1.5px] border-line bg-paper p-[18px]">
									<span class="font-bold text-evo-ink">{option.letter} · {option.label}</span>
									<p class="text-sm leading-[1.55] text-ink-2">{option.description}</p>
									{#if option.id === 'risk' && risk}
										<span class="text-[0.8125rem] text-ink-3">Accepted by {personName(risk.by, members)}: {risk.reason}</span>
									{/if}
									<div class="mt-auto flex items-center justify-end gap-1.5">
										{#if option.id === 'fix' && item.point?.fixTarget}
											{@const target = item.point.fixTarget}
											<button type="button" class="{SECONDARY_44} max-w-full whitespace-normal!" onclick={() => onFix(target)}>Fix it where it lives →</button>
										{:else}
											<BlockControls validate={riskControl(option.letter)} />
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				{#if risk && riskOption}
					<div class={NEXT_BAND}>
						<span class={NEXT_BAND_TEXT}>Option {riskOption.letter} validated for this impact.</span>
						{#if next}<button type="button" class={PRIMARY_44} onclick={next.go}>{next.label}</button>{/if}
					</div>
				{/if}
			</div>
		{:else if item.grade === 'minor'}
			<div class="flex flex-wrap gap-6 px-6 pb-6">
				<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
					<span class={KICKER}>Expected change</span>
					<p class="leading-[1.6] text-evo-ink">{item.reason}</p>
					{#if item.note}<p class="leading-[1.6] text-ink-2">{item.note}</p>{/if}
					<button type="button" class={sheetLink} onclick={onSheet}>Open the full problem sheet →</button>
				</div>
			</div>
		{:else}
			<div class="flex flex-wrap gap-6 px-6 pb-6">
				<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
					<span class={KICKER}>Compatibility reason</span>
					<p class="leading-[1.6] text-evo-ink">{item.reason}</p>
					{#if item.note && item.note !== item.reason}<p class="leading-[1.6] text-ink-2">{item.note}</p>{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>
