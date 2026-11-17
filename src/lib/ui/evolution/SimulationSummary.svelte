<script lang="ts" module>
	import type { CrossVerdict } from '$domain/evolution';

	/** One impact as the summary lists it: its code, its name, the part of the product it sits in. */
	export interface SummaryImpact {
		readonly code: string;
		readonly label: string;
		readonly area: string;
		readonly decided: boolean;
	}
	export interface SummaryArea {
		readonly code: string;
		readonly label: string;
		readonly major: number;
		readonly minor: number;
		readonly compatible: number;
	}
	export interface SummaryCross {
		readonly id: string;
		readonly key: string;
		readonly title: string;
		readonly verdict: CrossVerdict;
		readonly step: string;
		readonly sub: string;
	}
	/**
	 * The badge of an in-progress evolution, in the design's words and colours: a tag (.ly-tag), a conflict filled
	 * red-ink, an overlap orange, a fit green, a spec still pending a toner-2 chip.
	 */
	export const CROSS_BADGE: Record<CrossVerdict, { readonly word: string; readonly look: string; readonly border: string }> = {
		conflict: { word: 'CONFLICT', look: 'border-[1.5px] border-red-ink bg-red-ink font-evo-mono text-paper', border: 'border-red' },
		overlap: { word: 'OVERLAP', look: 'border-[1.5px] border-orange bg-orange font-evo-mono text-ink', border: 'border-orange' },
		compatible: { word: 'COMPATIBLE', look: 'border-[1.5px] border-green bg-green font-evo-mono text-ink', border: 'border-line' },
		spec_pending: { word: 'SPEC PENDING', look: 'border-[1.5px] border-toner-2 bg-toner-2 font-evo-mono text-ink-2', border: 'border-line' }
	};
</script>

<script lang="ts">
	import { Icon } from '$ui/design-system';
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import { KICKER, PRIMARY_48 } from './evo-look';

	/**
	 * The executive summary of the Simulation (the design's "2 · Tableau de
	 * bord"): how many impacts of each grade, the status, the summary in words,
	 * the impacts by area, then the impacts and the in-progress evolutions to
	 * settle, each one click from its card in the details.
	 *
	 * The design's score card ("68/100 Compatibility index") is left out: the
	 * platform computes no compatibility index, and a figure here would be made up.
	 */
	interface Props {
		counts: { readonly major: number; readonly minor: number; readonly compatible: number };
		/** Nothing is left to decide and the way into the implementation is open. */
		ready: boolean;
		paragraphs: readonly [string, string];
		areas: readonly SummaryArea[];
		majors: readonly SummaryImpact[];
		minors: readonly SummaryImpact[];
		cross: readonly SummaryCross[];
		onImpact: (code: string) => void;
		onCross: (id: string, section: boolean) => void;
		onDetails: () => void;
	}
	let { counts, ready, paragraphs, areas, majors, minors, cross, onImpact, onCross, onDetails }: Props = $props();

	// The design's block (.ly-card): sand, flat, no rule around it.
	const CARD = 'flex min-w-0 flex-col gap-3 rounded-evo-card border border-transparent bg-surface px-6 py-5';
	// A count tile of the design (.ly-found): a big display number, its mono uppercase label.
	const NUMBER = 'text-[1.75rem] leading-none font-bold tracking-[-0.03em]';
	const NUMBER_LABEL = 'font-evo-mono text-xs tracking-[0.06em] uppercase';
	const issues = $derived(cross.filter((c) => c.verdict === 'conflict' || c.verdict === 'overlap'));
	const pending = $derived(cross.filter((c) => c.verdict === 'spec_pending'));
	const cell = (n: number, look: string) => (n > 0 ? look : 'text-ink-4');
</script>

<section aria-label="Summary" class="flex flex-col gap-4">
	<div class="flex flex-wrap items-stretch gap-4">
		<div class="{CARD} flex-[1_1_240px]">
			<span class={KICKER}>Issues</span>
			<div class="flex gap-2">
				<span class="flex flex-1 flex-col gap-1 rounded-evo-btn bg-red-tint px-3 py-2.5">
					<span class="{NUMBER} text-red-ink">{counts.major}</span>
					<span class="{NUMBER_LABEL} text-red-ink">Major</span>
				</span>
				<span class="flex flex-1 flex-col gap-1 rounded-evo-btn bg-orange-tint px-3 py-2.5">
					<span class="{NUMBER} text-orange-ink">{counts.minor}</span>
					<span class="{NUMBER_LABEL} text-orange-ink">Minor</span>
				</span>
				<span class="flex flex-1 flex-col gap-1 rounded-evo-btn bg-green-tint px-3 py-2.5">
					<span class="{NUMBER} text-green-ink">{counts.compatible}</span>
					<span class="{NUMBER_LABEL} text-green-ink">Compatible</span>
				</span>
			</div>
		</div>
		<div class="{CARD} flex-[1_1_240px]">
			<span class={KICKER}>Status</span>
			<span
				class="inline-flex items-center gap-2 self-start border-[1.5px] px-3.5 py-2 font-evo-mono text-[0.8125rem] font-bold tracking-[0.06em] uppercase {ready ? 'border-green bg-green text-ink' : 'border-orange bg-orange text-ink'}"
			>
				<Icon name="alert-triangle" size={16} />{ready ? 'Implementable' : 'Implementable under conditions'}
			</span>
		</div>
	</div>

	<div class="flex flex-wrap items-stretch gap-4">
		<div class="{CARD} flex-[1_1_300px]">
			<span class={KICKER}>Executive summary</span>
			<p class="text-base leading-[1.65] text-ink-2">{paragraphs[0]}</p>
			<p class="text-base leading-[1.65] text-ink-2">{paragraphs[1]}</p>
		</div>
		<div class="{CARD} flex-[2.2_1_600px]">
			<div class="flex flex-wrap items-center justify-between gap-3"><span class={KICKER}>Impacts by area</span></div>
			<div class="overflow-x-auto">
				<table class="w-full min-w-[480px] border-collapse text-sm">
					<thead>
						<tr class="border-b-[1.5px] border-ink text-left font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">
							<th class="py-1.5 font-normal">Area</th>
							<th class="w-20 px-2 py-1.5 text-center font-normal">Major</th>
							<th class="w-20 px-2 py-1.5 text-center font-normal">Minor</th>
							<th class="w-[100px] px-2 py-1.5 text-center font-normal">Compatible</th>
							<th class="w-[28%] px-2 py-1.5 font-normal">Distribution</th>
						</tr>
					</thead>
					<tbody>
						{#each areas as area (area.code)}
							<tr class="border-t border-line">
								<td class="py-2.5 pr-3 font-semibold whitespace-nowrap">{area.label}</td>
								<td class="px-2 py-2.5 text-center">
									<span class="inline-block min-w-[26px] rounded-md px-2 py-0.5 font-evo-mono text-[0.8125rem] font-bold {cell(area.major, 'bg-red-ink text-paper')}">{area.major || '–'}</span>
								</td>
								<td class="px-2 py-2.5 text-center">
									<span class="inline-block min-w-[26px] rounded-md px-2 py-0.5 font-evo-mono text-[0.8125rem] font-bold {cell(area.minor, 'bg-orange text-ink')}">{area.minor || '–'}</span>
								</td>
								<td class="px-2 py-2.5 text-center">
									<span class="inline-block min-w-[26px] rounded-md px-2 py-0.5 font-evo-mono text-[0.8125rem] font-bold {cell(area.compatible, 'bg-green text-ink')}">{area.compatible || '–'}</span>
								</td>
								<td class="px-2 py-2.5">
									<div class="flex h-3 gap-[2px] overflow-hidden bg-toner-2">
										<div class="bg-red" style="flex: {area.major}"></div>
										<div class="bg-orange" style="flex: {area.minor}"></div>
										<div class="bg-green" style="flex: {area.compatible}"></div>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<div class="flex flex-wrap items-stretch gap-4">
		<div class="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-evo-card border border-transparent bg-surface p-6">
			<span class={KICKER}>Impacts on the existing system</span>
			{#each majors as impact (impact.code)}
				<button
					type="button"
					class="flex min-h-[52px] w-full items-center gap-3 rounded-evo-btn border border-red px-3 py-2 text-left text-evo-ink {impact.decided ? 'bg-green-tint' : 'bg-red-tint'}"
					onclick={() => onImpact(impact.code)}
				>
					<span class="w-16 flex-none border border-red-ink bg-red-ink px-2 py-[3px] text-center font-evo-mono text-[0.625rem] font-bold tracking-[0.06em] text-paper">MAJOR</span>
					<span class="flex min-w-0 flex-1 flex-col gap-px">
						<span class="font-bold">{impact.label}</span>
						<span class="font-evo-mono text-xs text-ink-3">{impact.area}</span>
					</span>
					<span class="text-[0.8125rem] font-bold {impact.decided ? 'text-green-ink' : 'text-red-ink'}">→</span>
				</button>
			{/each}
			{#each minors as impact (impact.code)}
				<button
					type="button"
					class="flex min-h-[52px] w-full items-center gap-3 rounded-evo-btn border border-orange bg-orange-tint px-3 py-2 text-left text-evo-ink"
					onclick={() => onImpact(impact.code)}
				>
					<span class="w-16 flex-none border border-orange bg-orange px-2 py-[3px] text-center font-evo-mono text-[0.625rem] font-bold tracking-[0.06em] text-ink">MINOR</span>
					<span class="flex min-w-0 flex-1 flex-col gap-px">
						<span class="font-bold">{impact.label}</span>
						<span class="font-evo-mono text-xs text-ink-3">{impact.area}</span>
					</span>
					<span class="text-[0.8125rem] font-bold text-orange-ink">→</span>
				</button>
			{/each}
			{#if majors.length === 0 && minors.length === 0}
				<span class="text-sm font-bold text-green-ink">✓ Nothing to settle with the product as it stands: every point fits.</span>
			{/if}
		</div>

		<div class="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-evo-card border border-transparent bg-surface p-6">
			<span class={KICKER}>Conflicts with in-progress evolutions</span>
			{#each issues as issue (issue.id)}
				{@const badge = CROSS_BADGE[issue.verdict]}
				<button
					type="button"
					class="flex min-h-[52px] w-full items-center gap-3 rounded-evo-btn border bg-toner-1 px-3 py-2 text-left text-evo-ink {badge.border}"
					onclick={() => onCross(issue.id, true)}
				>
					<span class="w-[88px] flex-none px-2 py-[3px] text-center text-[0.625rem] font-bold tracking-[0.06em] {badge.look}">{badge.word}</span>
					<span class="flex min-w-0 flex-1 flex-col gap-px">
						<span class="font-bold">{issue.key} · {issue.title}</span>
						<span class="text-[0.8125rem] text-ink-3">{issue.sub}</span>
					</span>
					<span class="text-ink-3" aria-hidden="true">→</span>
				</button>
			{/each}
			{#if issues.length === 0}
				<span class="text-sm font-bold text-green-ink">✓ Fits with every validated evolution in progress</span>
			{/if}
			{#if pending.length > 0}
				<div class="flex flex-col gap-1.5 rounded-evo-btn border border-dashed border-ink-3 bg-paper px-3.5 py-3">
					<span class="text-sm font-bold text-evo-ink">⏳ {pending.length} {pending.length === 1 ? 'evolution' : 'evolutions'} not checked yet</span>
					{#each pending as entry (entry.id)}
						<button type="button" class="flex items-baseline gap-2 text-left text-sm leading-normal text-ink-2" onclick={() => onCross(entry.id, false)}>
							<span><b class="font-evo-mono text-xs text-evo-ink">{entry.key}</b> · {entry.title} is still in {entry.step}. Lyriks will check it once its spec is validated.</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<PageFoot class="flex flex-wrap items-center justify-end gap-2.5">
		<button type="button" class={PRIMARY_48} onclick={onDetails}>See the impacts in detail →</button>
	</PageFoot>
</section>
