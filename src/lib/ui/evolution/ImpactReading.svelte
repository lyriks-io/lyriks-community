<script lang="ts">
	import { Button, Chip, Icon } from '$ui/design-system';
	import { IMPACT_HYPOTHESES, IMPACT_SECTIONS, shownImpactSentence, type ImpactHypothesis } from '$domain/evolution';
	import type { DossierCounts, ImpactPart } from '$lib/server/evolution-view.server';
	import { applyEvolution } from './reading-api';

	/**
	 * The impact report: what implementing the request would move, in the
	 * specification and in the code.
	 *
	 * ONE reading, derived from what the request proposes (d17092da). The three
	 * walks are still computed, because adding, changing and removing reach
	 * different things, but the reader is no longer asked to pick between them:
	 * a draft declares its kind, so every touched feature carries the verb of the
	 * draft that stands for it, and a node the walk merely reached carries what
	 * the request does overall. Three columns asked the reader to redo an
	 * arbitration the dossier had already made, and on a request that both adds
	 * and amends, which is the ordinary case, none of the three was true.
	 */
	interface Props {
		projectId: string;
		dossier: DossierCounts;
		impacts: Record<ImpactHypothesis, ImpactPart['impact']>;
		/** The verb each touched feature carries, and what the request does overall. */
		proposes: { byLeaf: Record<string, ImpactHypothesis>; main: ImpactHypothesis };
		canEdit: boolean;
		onFixNow: (target: string) => void;
	}
	let { projectId, dossier, impacts, proposes, canEdit, onFixNow }: Props = $props();

	type Finding = ImpactPart['impact']['findings'][number];
	const HYPOTHESES = IMPACT_HYPOTHESES.map((h) => h.code);
	/** What the request does, said once, in the words of what it proposes. */
	const DOES: Record<ImpactHypothesis, string> = {
		add: 'What adding it moves',
		change: 'What changing it moves',
		remove: 'What removing it moves'
	};
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
		const byNode = new Map<
			string,
			{ label: string; section: string; verb: string; depth: number; via?: string; note: string }
		>();
		// The walk a row is READ from: the one declared by the draft standing for the
		// feature the node was reached from, so a role reached from an amended
		// feature reads as a change even on a request that also adds something.
		// A node no such walk reached reads with what the request does overall.
		const own = (hypothesis: ImpactHypothesis, f: Finding) => {
			const from = (f as Finding & { from?: string }).from;
			return hypothesis === ((from && proposes.byLeaf[from]) || proposes.main);
		};
		const ownNodes = new Set<string>();
		for (const hypothesis of HYPOTHESES) {
			for (const f of impacts[hypothesis].findings as Finding[]) if (own(hypothesis, f)) ownNodes.add(f.nodeId);
		}
		for (const hypothesis of HYPOTHESES) {
			for (const f of impacts[hypothesis].findings as Finding[]) {
				if (f.kind === 'core') continue;
				const readHere = own(hypothesis, f) || (!ownNodes.has(f.nodeId) && hypothesis === proposes.main);
				if (!readHere || byNode.has(f.nodeId)) continue;
				const row = {
					label: f.label,
					section: f.section,
					verb: f.verb,
					depth: f.depth,
					via: (f as Finding & { via?: string }).via,
					note: f.note ?? ''
				};
				byNode.set(f.nodeId, row);
			}
		}
		return [...byNode.values()];
	});
	const sections = $derived(
		IMPACT_SECTIONS.map((s) => ({ ...s, rows: rows.filter((r) => r.section === s.code) })).filter((s) => s.rows.length > 0)
	);

	/**
	 * The walks the request ASKS for, and the coherence check, in one batch: one
	 * per kind of draft it carries. What taking the change back out would cost is
	 * a reading of its own, run when somebody asks for it (3ff4d488), never a
	 * standing column beside the one the request asked for.
	 */
	const asked = $derived([...new Set<ImpactHypothesis>([...Object.values(proposes.byLeaf), proposes.main])]);
	async function compute() {
		busy = true;
		try {
			await applyEvolution(projectId, [
				...asked.map((hypothesis) => ({ op: 'run_impact', requestId: dossier.id, hypothesis, depth: 2 })),
				{ op: 'run_coherence', requestId: dossier.id }
			]);
		} finally {
			busy = false;
		}
	}

	/** Whether the request itself removes: then the removal IS the reading, not a question on the side. */
	const removes = $derived(asked.includes('remove'));
	let backOutOpen = $state(false);
	const backOut = $derived(
		(impacts.remove.findings as Finding[])
			.filter((f) => f.kind !== 'core')
			.map((f) => ({ section: f.section, verb: f.verb }))
	);
	async function computeBackOut() {
		busy = true;
		try {
			await applyEvolution(projectId, [{ op: 'run_impact', requestId: dossier.id, hypothesis: 'remove', depth: 2 }]);
			backOutOpen = true;
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="text-xs text-ink-400">
			{#if ran}
				Computed {dossier.impact.ranAt ? `on ${dossier.impact.ranAt.slice(0, 10)}` : ''}, from what this request proposes.
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
		<!-- One sentence: what this change costs. -->
		{@const main = impacts[proposes.main]}
		{@const mixed = new Set(Object.values(proposes.byLeaf)).size > 1}
		<div class="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-card border border-line bg-surface px-4 py-3">
			<span class="w-44 shrink-0 text-sm font-semibold text-ink-900">{mixed ? 'What this change moves' : DOES[proposes.main]}</span>
			<span class="min-w-0 flex-1 text-sm text-ink-700">
				{main.status !== 'ready' ? 'Not computed yet.' : rows.length === 0 ? (dossier.impact.emptyBecause ?? 'Nothing moves.') : shownImpactSentence(rows)}
			</span>
		</div>

		<!-- One list of what moves, each row saying what happens to it. -->
		{#if rows.length > 0}
			<div class="overflow-x-auto rounded-card border border-line bg-surface">
				<table class="w-full text-xs">
					<thead>
						<tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-400">
							<th class="px-3 py-2 font-semibold">What moves</th>
							<th class="px-3 py-2 font-semibold">What happens to it</th>
						</tr>
					</thead>
					<tbody>
						{#each sections as section (section.code)}
							{@const open = openSections[section.code] ?? false}
							{@const shown = open ? section.rows : section.rows.slice(0, ROWS_SHOWN)}
							<tr class="bg-surface-sunken/60">
								<th colspan="2" class="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-700">
									{section.label} <span class="font-normal text-ink-400">{section.rows.length}</span>
								</th>
							</tr>
							{#each shown as row (section.code + row.label)}
								<tr class="border-t border-line/60">
									<td class="px-3 py-1.5 text-ink-900">
										{row.label}
										<!--
											Why this row is in the list, in one sentence: what joined it to
											the change. It used to be a "knock-on" chip, which said how many
											links the walk had followed and left the reader to work out what
											that meant for them.
										-->
										{#if row.note}
											<span class="mt-0.5 block text-[11px] font-normal text-ink-400">{row.note}</span>
										{:else if row.depth > 1}
											<span class="block text-[11px] text-ink-400">
												{row.via ? `rests on "${row.via}"` : 'rests on something the change edits'}
											</span>
										{/if}
									</td>
									<td class="px-3 py-1.5 text-ink-700">{row.verb}</td>
								</tr>
							{/each}
							{#if section.rows.length > ROWS_SHOWN}
								<tr>
									<td colspan="2" class="px-3 py-1.5">
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

		{#if !removes}
			<!-- Asked the day it is asked: the cost of taking the change back out. -->
			<div class="text-xs text-ink-700">
				{#if backOutOpen && impacts.remove.status === 'ready'}
					<p class="rounded-field border border-line bg-surface px-3 py-2">
						<span class="font-semibold text-ink-900">Taking it back out</span>
						<span class="text-ink-400"> (a reading of its own, not what this request does):</span>
						{backOut.length === 0 ? 'nothing else would move.' : shownImpactSentence(backOut)}
					</p>
				{:else}
					<button type="button" class="text-brand-600 hover:underline disabled:opacity-50" disabled={busy} onclick={computeBackOut}>
						What would it cost to take this change back out?
					</button>
				{/if}
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
