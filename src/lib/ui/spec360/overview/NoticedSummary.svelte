<script lang="ts">
	import type { NoticedSummary } from '$application/spec360/noticed';
	import Gauge from '$ui/design-system/Gauge.svelte';
	import { PRESS_LINE, TAG } from '../page/look';

	/**
	 * What Lyriks noticed, summed up on the Overview (criterion 55a7fe86): one
	 * bar split into the major points still to review, the minor ones and the
	 * settled ones (the app's Gauge, criterion b663dee4), its legend, one line
	 * per type, the heaviest first, with its count and its major points in a
	 * red tag; then Review the N points. The list itself is a page of its own:
	 * the button opens it, a type's line opens it on that type.
	 */
	interface Props {
		summary: NoticedSummary;
		/** The page What Lyriks noticed. */
		href: string;
	}
	let { summary, href }: Props = $props();
	const pointsWord = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;
	const review = $derived(
		summary.pending === 0 ? `See the ${pointsWord(summary.total)}` : summary.pending === 1 ? 'Review the point' : `Review the ${summary.pending} points`
	);
	const legend = $derived([
		{ value: summary.major, label: 'major', tone: 'bg-red' },
		{ value: summary.minor, label: 'minor', tone: 'bg-orange' },
		{ value: summary.settled, label: 'settled', tone: 'bg-green' }
	]);
	const typeHref = (key: string) => `${href}?type=${encodeURIComponent(key)}`;
</script>

<div class="border border-line bg-toner px-4 pt-0.5 pb-2">
	<div class="grid gap-2 pt-3.5 pb-3">
		<Gauge
			parts={legend.map((l) => ({ value: l.value, tone: l.tone }))}
			total={summary.total}
			counts
			height={10}
			label="{summary.major} major and {summary.minor} minor to review, {summary.settled} settled"
		/>
		<div class="flex flex-wrap gap-x-4 gap-y-1 font-evo-mono text-[0.6875rem] text-ink-3">
			{#each legend as l (l.label)}
				<span class="inline-flex items-center gap-1.5"><i class="size-2 {l.tone}" aria-hidden="true"></i><b class="text-ink">{l.value}</b>{l.label}</span>
			{/each}
		</div>
	</div>
	<ul class="m-0 list-none border-t border-line p-0" aria-label="Points by type">
		{#each summary.types as t (t.key)}
			<li class="border-b border-line last:border-b-0">
				<a
					href={typeHref(t.key)}
					title={t.meaning}
					class="-mx-1 flex min-h-11 items-center gap-3 px-1 py-1.5 text-ink no-underline transition-colors duration-150 hover:bg-toner-1 hover:text-ink"
				>
					<strong class="min-w-0 flex-1 text-[0.84375rem] leading-snug font-semibold tracking-[-0.01em]">{t.label}</strong>
					{#if t.major > 0}<span class="{TAG} min-h-[22px] border-red px-[7px] text-[0.6875rem] text-red-ink">{t.major} major</span>{/if}
					<span class="w-[76px] flex-none text-right font-evo-mono text-[0.6875rem] whitespace-nowrap text-ink-3"
						><b class="font-semibold text-ink-2 tabular-nums">{t.count}</b>&nbsp;{t.count === 1 ? 'point' : 'points'}</span
					>
				</a>
			</li>
		{/each}
	</ul>
</div>
<div class="mt-3.5"><a {href} class="{PRESS_LINE} inline-flex h-8 items-center px-3.5 text-[0.625rem] no-underline">{review}</a></div>
