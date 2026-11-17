<script lang="ts">
	import { Button, Chip, Icon } from '$ui/design-system';
	import EarsText from '$ui/glossary/EarsText.svelte';
	import { placeElementId, reportReading, type ImplementationVerdict } from '$domain/evolution';
	import type { ReportPart } from '$lib/server/evolution-view.server';
	import { DECISION_LABEL, TONE, VERDICT_LOOK, VERDICT_ORDER, type Tone } from './verdict-tones';

	/**
	 * The implementation report, read the way the impact report is read
	 * (ac-evo-impl-layout): one verdict on top that counts the lines, then only
	 * what waits on a person now, worst first; what is settled (proved by the
	 * code, or already decided) is folded behind one count, and what the touched
	 * features already carried before this request (inherited) is folded apart,
	 * in grey, because it never holds the request. Every line is derived from the
	 * implementation index against the frozen version; a person decides each line
	 * the request brought.
	 */
	type Report = NonNullable<ReportPart['report']>;
	type Line = Report['lines'][number];
	interface Props {
		report: Report;
		specVersion: number;
		canEdit: boolean;
		busy: boolean;
		highlighted: string | null;
		run: (op: Record<string, unknown>) => Promise<unknown>;
	}
	let { report, specVersion, canEdit, busy, highlighted, run }: Props = $props();

	let settledOpen = $state(false);
	let beforeOpen = $state(false);

	const read = $derived(reportReading(report.lines));
	const own = $derived(report.lines.filter((l) => l.scope !== 'inherited'));
	const before = $derived(read.before);
	const waiting = $derived(read.waiting);
	const settled = $derived(read.settled);
	// A conform line is proved by the code: it never waits on a person.
	const undecided = $derived(own.filter((l) => l.decision === 'undecided' && l.verdict !== 'conform'));
	const provedCount = $derived(settled.filter((l) => l.verdict === 'conform').length);

	/** Counted once, in the verdict the report opens on (ac-evo-impl-bar). */
	const count = (verdict: ImplementationVerdict) => own.filter((l) => l.verdict === verdict).length;

	/** The one verdict the report opens on. */
	const headline = $derived.by((): { tone: Tone; title: string } => {
		if (report.status === 'building' || report.lines.length === 0) return { tone: 'todo', title: 'No report yet' };
		if (own.some((l) => l.verdict === 'regression' && l.decision !== 'validated')) return { tone: 'blocks', title: 'It breaks something' };
		const toDecide = undecided.filter((l) => l.verdict !== 'missing');
		if (toDecide.length > 0) return { tone: 'decide', title: `${toDecide.length} ${toDecide.length === 1 ? 'line' : 'lines'} to decide` };
		const toBuild = undecided.length - toDecide.length;
		if (toBuild > 0) return { tone: 'todo', title: `${toBuild} to build` };
		if (own.some((l) => l.decision === 'invalidated')) return { tone: 'decide', title: 'Sent back to the build' };
		return { tone: 'ok', title: 'Built as specified' };
	});

	const decide = (line: Line, decision: string) => run({ op: 'decide_line', lineId: line.id, decision });
	const mark = (id: string) => (highlighted === id ? 'ring-2 ring-blue ring-offset-2' : '');
</script>

{#snippet lineRow(line: Line, tone: Tone)}
	{@const look = VERDICT_LOOK[line.verdict]}
	{@const lineId = placeElementId({ kind: 'line', id: line.id })}
	<li id={lineId} class="flex scroll-mt-6 flex-wrap items-start gap-2 rounded-field border border-line border-l-4 px-3 py-2 text-xs transition-shadow {TONE[tone].row} {mark(lineId)}">
		<Icon name={look.icon} size={13} class="mt-0.5 shrink-0 {TONE[tone].text}" />
		<div class="min-w-0 flex-1">
			<p class="text-ink-900"><span class="font-mono font-bold tracking-[0.04em] uppercase {TONE[tone].text}">{look.label}</span> · <EarsText text={line.requirement} /></p>
			{#if (line.verdict === 'non_conform' || line.verdict === 'regression') && line.specStatement}
				<p class="mt-0.5 text-ink-700"><span class="font-bold text-green-ink">The spec says:</span> <EarsText text={line.specStatement} /></p>
				<p class="text-ink-700"><span class="font-bold text-red-ink">The code does:</span> {line.codeStatement}</p>
			{:else if line.filePath}
				<p class="font-mono text-ink-500">{line.filePath}{line.lineRange ? `:${line.lineRange}` : ''}</p>
			{:else if line.verdict !== 'missing'}
				<!-- A line still to build says so in its verdict: "nothing located" beside it says it twice. -->
				<p class="text-ink-500">{line.codeStatement}</p>
			{/if}
		</div>
		{#if line.decision !== 'undecided'}
			<span class="flex items-center gap-1">
				<Chip tone={line.decision === 'invalidated' ? 'warning' : 'neutral'}>{DECISION_LABEL[line.decision] ?? line.decision}</Chip>
				{#if canEdit && report.status !== 'closed' && line.decision !== 'adopted'}
					<button type="button" class="quiet text-[0.6875rem] text-ink-900" disabled={busy} onclick={() => decide(line, 'undecided')} title="Take the decision back">Undo</button>
				{/if}
			</span>
		{:else if canEdit && report.status !== 'closed'}
			<span class="flex gap-1">
				{#if line.verdict === 'out_of_scope'}
					<Button size="sm" variant="outline" disabled={busy} onclick={() => decide(line, 'adopted')}>Adopt into the spec</Button>
					<Button size="sm" variant="ghost" disabled={busy} onclick={() => decide(line, 'removed')}>Remove from the code</Button>
				{:else}
					<Button size="sm" variant="outline" disabled={busy} onclick={() => decide(line, 'validated')}>Validate</Button>
					<Button size="sm" variant="ghost" disabled={busy} onclick={() => decide(line, 'invalidated')}>Send back</Button>
				{/if}
			</span>
		{/if}
	</li>
{/snippet}

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-3 rounded-card border border-l-4 px-4 py-3 {TONE[headline.tone].box}">
		<Icon name={TONE[headline.tone].icon} size={18} class={TONE[headline.tone].text} />
		<span class="text-base font-bold {TONE[headline.tone].text}">{headline.title}</span>
		<span class="flex flex-wrap gap-1.5">
			{#each VERDICT_ORDER as verdict (verdict)}
				{#if count(verdict) > 0}
					<span class="inline-flex items-center gap-1 rounded-pill border-[1.5px] px-2 py-0.5 font-mono text-[0.6875rem] font-bold tracking-[0.06em] uppercase {VERDICT_LOOK[verdict].badge}">
						<Icon name={VERDICT_LOOK[verdict].icon} size={11} />
						{count(verdict)} {VERDICT_LOOK[verdict].label.toLowerCase()}
					</span>
				{/if}
			{/each}
		</span>
		<span class="font-mono text-[0.6875rem] text-ink-500">against spec version {specVersion}</span>
		<!-- Built on its own (ac-evo-impl-9): at the freeze and after every index sync, never by a click. -->
		{#if report.status !== 'closed'}<span class="ml-auto font-mono text-[0.6875rem] text-ink-400">Rebuilt on its own after each index sync</span>{/if}
	</div>

	{#if report.lines.length === 0}
		<p class="text-xs text-ink-500 italic">
			Nothing built yet: write the code against version {specVersion} and sync the implementation index from the checkout; the report builds itself from that sync.
		</p>
	{/if}

	{#if waiting.length > 0}
		{#each VERDICT_ORDER as verdict (verdict)}
			{@const lines = waiting.filter((l) => l.verdict === verdict)}
			{@const open = lines.filter((l) => l.decision === 'undecided')}
			{#if lines.length > 0}
				<div class="space-y-1">
					{#if canEdit && verdict !== 'out_of_scope' && open.length > 1 && report.status !== 'closed'}
						<div class="flex justify-end">
							<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'decide_line', verdict, decision: 'validated' })}>
								Validate the {open.length} {VERDICT_LOOK[verdict].label.toLowerCase()}
							</Button>
						</div>
					{/if}
					<ul class="space-y-1" aria-label={VERDICT_LOOK[verdict].label}>
						{#each lines as line (line.id)}
							{@render lineRow(line, VERDICT_LOOK[verdict].tone)}
						{/each}
					</ul>
				</div>
			{/if}
		{/each}
	{/if}

	{#if settled.length > 0}
		<button type="button" class="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700" aria-expanded={settledOpen} onclick={() => (settledOpen = !settledOpen)}>
			<Icon name={settledOpen ? 'chevron-up' : 'chevron-down'} size={12} />
			<span class="size-2.5 {TONE.ok.dot}"></span>
			{settled.length} settled: {[provedCount > 0 ? `${provedCount} proved by the code` : '', settled.length > provedCount ? `${settled.length - provedCount} decided` : ''].filter(Boolean).join(', ')}
		</button>
		{#if settledOpen}
			<ul class="space-y-1">
				{#each settled as line (line.id)}{@render lineRow(line, line.verdict === 'conform' ? 'ok' : VERDICT_LOOK[line.verdict].tone)}{/each}
			</ul>
		{/if}
	{/if}

	{#if before.length > 0}
		<button type="button" class="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700" aria-expanded={beforeOpen} onclick={() => (beforeOpen = !beforeOpen)}>
			<Icon name={beforeOpen ? 'chevron-up' : 'chevron-down'} size={12} />
			<span class="size-2.5 {TONE.before.dot}"></span>
			{before.length} older {before.length === 1 ? 'point' : 'points'} of these features, from before this change. For information only: {before.length === 1 ? 'it does' : 'they do'} not block it.
		</button>
		{#if beforeOpen}
			<ul class="space-y-1">
				{#each before as line (line.id)}{@render lineRow(line, 'before')}{/each}
			</ul>
		{/if}
	{/if}
</div>
