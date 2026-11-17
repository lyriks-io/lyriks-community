<script lang="ts">
	import type { ConcurrentImpactReading } from '$lib/server/evolution-cross.server';
	import { heightVar } from '$ui/shell/height-var';
	import '$ui/spec360/knowledge-rows.css';
	import AiPromptButton from './AiPromptButton.svelte';
	import SimulationCrossRow from './SimulationCrossRow.svelte';
	import { fillEvolutionPrompt } from './fill-prompt';
	import { concurrentSummary, crossWordsNamed } from './impact-board';

	/**
	 * What the evolutions picked on the list do to each other (criterion
	 * f70b2e9f): under the rows at the top of Knowledge, each pair with its
	 * verdict, conflicts first and open, then what the report cannot see and the
	 * evolutions it could not compare (criterion 0922523f). It reads, it settles
	 * nothing: the platform has no act that settles a conflict between two
	 * evolutions.
	 */
	interface Props {
		report: ConcurrentImpactReading;
		projectId: string;
		canEdit: boolean;
		onBack: () => void;
	}
	let { report, projectId, canEdit, onBack }: Props = $props();

	const keys = $derived(report.picked.map((p) => p.key));
	const summary = $derived(concurrentSummary(keys, report.pairs.map((p) => p.there.verdict)));
	const pairKey = (p: ConcurrentImpactReading['pairs'][number]) => `${p.here.id}-${p.there.id}`;
	/** A conflict reads open; a click flips any pair from how it starts. */
	let flipped = $state<ReadonlySet<string>>(new Set());
	const isOpen = (p: ConcurrentImpactReading['pairs'][number]) => (p.there.verdict === 'conflict') !== flipped.has(pairKey(p));
	function flip(key: string) {
		const next = new Set(flipped);
		if (!next.delete(key)) next.add(key);
		flipped = next;
	}
	const LINK = 'font-semibold text-blue-ink hover:underline';
</script>

<!-- Its height is published (--kb-head-h) for what lands under it (data-sticky-head). -->
<div class="kbar" data-sticky-head {@attach heightVar('--kb-head-h')}>
	<div class="khead">
		<button type="button" class="kup" onclick={onBack}><span aria-hidden="true">←</span> All changes</button>
		<h1 class="kname">Concurrent impact</h1>
		<span class="kkey">{keys.join(', ')}</span>
	</div>
	<div class="ksb" class:draft={summary.warns} role="status">
		<span class="pill">{summary.pill}</span>
		<span class="txt">{summary.sentence}</span>
	</div>
</div>

<div class="evo-motion animate-lk-in mx-auto flex max-w-6xl flex-col gap-6 font-evo text-[0.9375rem] leading-normal text-evo-ink">
	{#if report.pairs.length > 0}
		<div class="overflow-hidden rounded-evo-card border border-line bg-surface">
			{#each report.pairs as pair, i (pairKey(pair))}
				{@const key = pairKey(pair)}
				<section class={i > 0 ? 'border-t-[1.5px] border-line-strong' : ''} aria-label="{pair.here.key} and {pair.there.key ?? pair.there.title}">
					<p class="m-0 flex flex-wrap items-baseline gap-x-2 px-5 pt-3 text-[0.8125rem]">
						<a class={LINK} href={pair.here.href}><span class="font-evo-mono text-xs">{pair.here.key}</span> {pair.here.title || 'Untitled request'}</a>
						<span class="font-evo-mono text-ink-3" aria-hidden="true">×</span>
						<a class={LINK} href={pair.there.href}><span class="font-evo-mono text-xs">{pair.there.key}</span> {pair.there.title || 'Untitled request'}</a>
					</p>
					<div class="[&>div]:border-t-0">
						<SimulationCrossRow cross={pair.there} words={crossWordsNamed(pair.here.key, { ...pair.there, key: pair.there.key ?? pair.there.title })} hereLabel={pair.here.key} rowId="xe-{key}" open={isOpen(pair)} onToggle={() => flip(key)} />
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<p class="m-0 rounded-evo-card border border-line bg-surface px-5 py-8 text-center text-sm text-ink-2">
			{report.picked.length === 1 ? 'No other evolution in progress to compare it with.' : 'Nothing to compare yet: these evolutions have not drafted what they change.'}
		</p>
	{/if}

	<section class="flex flex-col gap-3 border border-dashed border-ink-3 px-5 py-4 text-sm leading-[1.5] text-ink-2" aria-label="What this report cannot see">
		<h2 class="m-0 text-[0.9375rem] font-bold text-evo-ink">What this report cannot see</h2>
		<p class="m-0 max-w-[80ch]">It compares what each evolution declares it changes: its features and its tables. What a change moves by ripple is read on the Simulation of each evolution.</p>
		{#if report.undrafted.length > 0}
			<p class="m-0 max-w-[80ch]">{report.undrafted.length === 1 ? 'This evolution could not be compared: it has' : 'These evolutions could not be compared: they have'} no change drafted and no frozen specification yet.</p>
			<ul class="m-0 flex list-none flex-col gap-2 p-0">
				{#each report.undrafted as request (request.id)}
					<li class="flex flex-wrap items-center justify-between gap-3">
						<a class={LINK} href={request.href}><span class="font-evo-mono text-xs">{request.key}</span> {request.title || 'Untitled request'}</a>
						{#if canEdit}<AiPromptButton prompt={fillEvolutionPrompt(request, projectId)} label="Fill it with my AI" look="outline" copied="Prompt copied: paste it into your AI. Come back here once it has drafted its changes." />{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
