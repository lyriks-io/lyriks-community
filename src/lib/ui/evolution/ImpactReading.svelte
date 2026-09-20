<script lang="ts">
	import { Button, Chip, Icon } from '$ui/design-system';
	import { IMPACT_HYPOTHESES, IMPACT_SECTIONS, type ImpactHypothesis } from '$domain/evolution';
	import type { DossierCounts, ImpactPart } from '$lib/server/evolution-view.server';
	import { applyEvolution } from './reading-api';

	/**
	 * The impact report: what implementing the request would move, in the
	 * specification and in the code. The three hypotheses are computed together
	 * and read at once (ac-evo-imp-11): one sentence per hypothesis on top, then
	 * ONE list of what moves where every node says what happens to it under
	 * add, change and remove side by side. The contradictions the engine found
	 * sit below, because they are the only thing that holds a request back.
	 */
	interface Props {
		projectId: string;
		dossier: DossierCounts;
		impacts: Record<ImpactHypothesis, ImpactPart['impact']>;
		canEdit: boolean;
		onFixNow: (target: string) => void;
	}
	let { projectId, dossier, impacts, canEdit, onFixNow }: Props = $props();

	type Finding = ImpactPart['impact']['findings'][number];
	const HYPOTHESES = IMPACT_HYPOTHESES.map((h) => h.code);
	const TITLE: Record<ImpactHypothesis, string> = { add: 'If we add it', change: 'If we change it', remove: 'If we remove it' };
	const ROWS_SHOWN = 8;

	let openSections = $state<Record<string, boolean>>({});
	let busy = $state(false);

	const ran = $derived(HYPOTHESES.some((h) => impacts[h].status === 'ready'));
	const checked = $derived(dossier.coherence.available);

	/**
	 * One row per node that moves under any hypothesis, with what happens to it
	 * under each. A container (a core) is where things live, not something that
	 * moves, so it is left out.
	 */
	const rows = $derived.by(() => {
		const byNode = new Map<string, { label: string; section: string; verbs: Partial<Record<ImpactHypothesis, string>>; depth: number }>();
		for (const hypothesis of HYPOTHESES) {
			for (const f of impacts[hypothesis].findings as Finding[]) {
				if (f.kind === 'core') continue;
				const row = byNode.get(f.nodeId) ?? { label: f.label, section: f.section, verbs: {}, depth: f.depth };
				row.verbs[hypothesis] = f.verb;
				row.depth = Math.min(row.depth, f.depth);
				byNode.set(f.nodeId, row);
			}
		}
		return [...byNode.values()];
	});
	const sections = $derived(
		IMPACT_SECTIONS.map((s) => ({ ...s, rows: rows.filter((r) => r.section === s.code) })).filter((s) => s.rows.length > 0)
	);

	/** All three readings and the coherence check, in one batch. */
	async function compute() {
		busy = true;
		try {
			await applyEvolution(projectId, [
				...HYPOTHESES.map((hypothesis) => ({ op: 'run_impact', requestId: dossier.id, hypothesis, depth: 2 })),
				{ op: 'run_coherence', requestId: dossier.id }
			]);
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="text-xs text-ink-400">
			{#if ran}
				Computed {dossier.impact.ranAt ? `on ${dossier.impact.ranAt.slice(0, 10)}` : ''}, under the three hypotheses at once.
			{:else}
				Not computed yet.
			{/if}
		</p>
		{#if canEdit}
			<Button size="sm" variant={ran ? 'outline' : 'primary'} disabled={busy} onclick={compute}>
				<Icon name="rotate" size={12} />
				{ran ? 'Recompute' : 'Compute the impact'}
			</Button>
		{/if}
	</div>

	{#if ran}
		<!-- One sentence per hypothesis: what it costs. -->
		<ul class="space-y-2">
			{#each HYPOTHESES as hypothesis (hypothesis)}
				{@const reading = impacts[hypothesis]}
				<li class="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-card border border-line bg-surface px-4 py-3">
					<span class="w-32 shrink-0 text-sm font-semibold text-ink-900">{TITLE[hypothesis]}</span>
					<span class="min-w-0 flex-1 text-sm text-ink-700">
						{reading.status === 'ready' ? reading.summary : 'Not computed yet.'}
					</span>
				</li>
			{/each}
		</ul>

		<!-- One list of what moves, with the three hypotheses side by side. -->
		{#if rows.length > 0}
			<div class="overflow-x-auto rounded-card border border-line bg-surface">
				<table class="w-full text-xs">
					<thead>
						<tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-400">
							<th class="px-3 py-2 font-semibold">What moves</th>
							<th class="px-3 py-2 font-semibold">If we add it</th>
							<th class="px-3 py-2 font-semibold">If we change it</th>
							<th class="px-3 py-2 font-semibold">If we remove it</th>
						</tr>
					</thead>
					<tbody>
						{#each sections as section (section.code)}
							{@const open = openSections[section.code] ?? false}
							{@const shown = open ? section.rows : section.rows.slice(0, ROWS_SHOWN)}
							<tr class="bg-surface-sunken/60">
								<th colspan="4" class="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-700">
									{section.label} <span class="font-normal text-ink-400">{section.rows.length}</span>
								</th>
							</tr>
							{#each shown as row (section.code + row.label)}
								<tr class="border-t border-line/60">
									<td class="px-3 py-1.5 text-ink-900">
										{row.label}
										{#if row.depth > 1}<Chip tone="neutral" class="ml-1">knock-on</Chip>{/if}
									</td>
									{#each HYPOTHESES as hypothesis (hypothesis)}
										<td class="px-3 py-1.5 text-ink-700">{row.verbs[hypothesis] ?? 'untouched'}</td>
									{/each}
								</tr>
							{/each}
							{#if section.rows.length > ROWS_SHOWN}
								<tr>
									<td colspan="4" class="px-3 py-1.5">
										<button type="button" class="text-xs text-brand-600 hover:underline" onclick={() => (openSections = { ...openSections, [section.code]: !open })}>
											{open ? 'Show fewer' : `Show ${section.rows.length - ROWS_SHOWN} more`}
										</button>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

	<!-- Contradictions with the existing spec: the only thing that holds the request. -->
	<div class="rounded-field border border-line bg-surface-sunken/60 px-3 py-2">
		<p class="text-xs text-ink-700">
			{#if checked}
				Coherence of the whole project: <strong class="font-medium text-ink-900">{dossier.coherence.overall}/100</strong>{dossier.coherence.delta !== 0 ? ` (${dossier.coherence.delta > 0 ? '+' : ''}${dossier.coherence.delta} since the last check)` : ''}.
				{#if dossier.coherence.blockingUndecided > 0}
					<span class="text-warning-700">{dossier.coherence.blockingUndecided} blocking {dossier.coherence.blockingUndecided === 1 ? 'contradiction holds' : 'contradictions hold'} the request.</span>
				{:else if dossier.coherence.findings.length > 0}
					{dossier.coherence.findings.length} {dossier.coherence.findings.length === 1 ? 'finding' : 'findings'} to read, none blocking.
				{:else}
					No contradiction with the existing spec.
				{/if}
			{:else}
				The coherence check has not been run on this request; computing the impact runs it.
			{/if}
		</p>
		{#if dossier.coherence.findings.length > 0}
			<ul class="mt-2 space-y-1">
				{#each dossier.coherence.findings as finding (finding.id)}
					<li class="flex flex-wrap items-center gap-2 text-xs">
						<Chip tone={finding.severity === 'blocking' ? 'warning' : 'neutral'}>{finding.severity}</Chip>
						<span class="text-ink-900">{finding.title}</span>
						<button type="button" class="text-brand-600 hover:underline" onclick={() => onFixNow(finding.fixNowTarget)}>Fix now</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
