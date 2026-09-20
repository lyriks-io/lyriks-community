<script lang="ts">
	import { HelpTip, Icon, SearchInput, matchesQuery } from '$ui/design-system';
	import {
		COHERENCE_AXES,
		IMPACT_HYPOTHESES,
		IMPACT_NODE_KINDS,
		IMPACT_SECTIONS,
		FINDING_SEVERITIES,
		IMPACT_SEVERITIES,
		MAX_IMPACT_DEPTH,
		canComputePropagation,
		canFixNow,
		canOpenEntities,
		canOpenRules,
		canSwitchHypothesis,
		findingsForCurrentHypothesis,
		publishedFindings,
		reachLabel,
		reachMeaning,
		rulesToReplay,
		rulesToRewrite,
		type EvolutionRequest,
		type FindingSeverity,
		type ImpactFinding,
		type ImpactHypothesis,
		type ImpactSection
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * Stage 2, before a line of code: what the engine found against the existing
	 * spec, and what the change propagates to.
	 *
	 * The two halves are deliberately not merged. The coherence report says what
	 * CONTRADICTS the product today; the impact report says what MOVES if the
	 * change ships, read under one hypothesis at a time because removing does not
	 * break what adding breaks.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		onFixNow: (target: string) => void;
	}
	let { store, request, onFixNow }: Props = $props();

	let query = $state('');
	let openSection = $state<ImpactSection>('leaves');
	/** The impact the reader opened, shown whole in a dialog of its own. */
	let opened = $state<ImpactFinding | null>(null);

	/** How far out a node sits, said as what it implies rather than as a number. */
	const distanceOf = (depth: number) => `${reachLabel(depth)}. ${reachMeaning(depth)}`;

	/** What a level MEANS, said where it is shown rather than left to be guessed. */
	const severityHint = (code: string) =>
		IMPACT_SEVERITIES.find((s) => s.code === code)?.hint ?? '';
	const IMPACT_TONE: Record<string, string> = {
		none: 'text-ink-400',
		low: 'text-info-600',
		medium: 'text-warning-700',
		high: 'text-accent-600',
		blocking: 'text-danger-700'
	};

	const SEVERITY_TONE: Record<FindingSeverity, string> = {
		blocking: 'bg-danger-50 text-danger-700 border-danger-200',
		major: 'bg-warning-50 text-warning-700 border-warning-200',
		minor: 'bg-info-50 text-info-600 border-info-200'
	};

	const findings = $derived(
		publishedFindings(request).filter((f) =>
			matchesQuery(query, f.title, f.requestNodeId, f.existingNodeId, f.axis)
		)
	);
	/**
	 * The one line a reader needs before any list: how many findings block the
	 * freeze, and how many are there to know about. A review that opens on
	 * thirty rows gets abandoned; one that opens on "three block, ten inform"
	 * gets done.
	 */
	const blockingCount = $derived(
		publishedFindings(request).filter((f) => f.severity === 'blocking').length
	);
	const informativeCount = $derived(publishedFindings(request).length - blockingCount);
	const impacts = $derived(findingsForCurrentHypothesis(request));
	const axisLabel = (code: string) => COHERENCE_AXES.find((a) => a.code === code)?.label ?? code;
	const sectionLabel = (code: ImpactSection) =>
		IMPACT_SECTIONS.find((s) => s.code === code)?.label ?? code;

	const inSection = (section: ImpactSection) =>
		impacts.filter((f) => f.section === section).filter((f) => matchesQuery(query, f.nodeLabel, f.nodeId, ...f.groupPath));

	const kindLabel = (code: string) =>
		IMPACT_NODE_KINDS.find((k) => k.code === code)?.label ?? code;

	function pickHypothesis(hypothesis: ImpactHypothesis) {
		const allowed = canSwitchHypothesis(request);
		if (!allowed.ok) {
			store.notifier.notify('info', allowed.reason);
			return;
		}
		store.setHypothesis(request.id, hypothesis);
	}

	function pickDepth(depth: number) {
		const allowed = canComputePropagation(depth);
		if (!allowed.ok) {
			store.notifier.notify('error', allowed.reason);
			return;
		}
		store.setImpactDepth(request.id, depth);
	}

	function openImpactSection(section: ImpactSection) {
		// Entities and rules carry their own preconditions: an entity impact that
		// does not say whether a migration is implied is not readable, and rules
		// that have not been split into replays and rewrites hide the cost.
		const allowed =
			section === 'entities_and_fields'
				? canOpenEntities(request)
				: section === 'rules_and_scenarios'
					? canOpenRules(request)
					: { ok: true as const };
		if (!allowed.ok) {
			store.notifier.notify('info', allowed.reason);
			return;
		}
		openSection = section;
	}

	function fixNow(findingId: string) {
		const finding = request.coherenceFindings.find((f) => f.id === findingId);
		if (!finding) return;
		const allowed = canFixNow(finding);
		if (!allowed.ok) {
			store.notifier.notify('info', allowed.reason);
			return;
		}
		onFixNow(finding.fixNowTarget);
	}
</script>

<div class="space-y-4">
	<!-- What a reader is here to do. Two reports, and one decision at the foot. -->
	<div class="rounded-card border border-line bg-surface-sunken/40 px-4 py-3">
		<p class="text-sm font-semibold text-ink-900">Before a line of code, two questions</p>
		<p class="mt-1 text-[12px] leading-relaxed text-ink-600">
			Does this change contradict what the product already says, and what moves if it ships. Read
			the two reports, fix now what has to be fixed now, arbitrate the rest, and the gate at the
			foot of the page says what is left before implementation can open. Nothing here edits the
			change itself: it is where the change is challenged.
		</p>
	</div>

	<SearchInput
		bind:value={query}
		placeholder="Search a finding, node or impacted element…"
		size="md"
		class="max-w-md"
	/>

	<!-- The coherence report: five axes, walked over the whole project. -->
	<section class="rounded-card border border-line bg-surface">
		{#if request.coherenceReport.status === 'ready'}
			<!-- Before any list: what blocks the freeze, and what merely informs. -->
			<p
				class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-sm {blockingCount > 0
					? 'bg-danger-50/40 text-danger-700'
					: 'bg-success-50/40 text-success-700'}"
			>
				<Icon name={blockingCount > 0 ? 'lock' : 'check'} size={14} />
				<strong>
					{blockingCount} {blockingCount === 1 ? 'finding blocks' : 'findings block'} the freeze
				</strong>
				<span class="text-ink-500">
					· {informativeCount} {informativeCount === 1 ? 'is' : 'are'} informative, to arbitrate while the request keeps moving
				</span>
			</p>
		{/if}
		<header class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-ink-900">Coherence report</p>
				<p class="text-[11px] text-ink-500">
					Produced by the engine over the whole project, on all
					{COHERENCE_AXES.length} axes. A model asked whether a change is coherent produces something
					plausible; this has to be reproducible.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-3 text-xs">
				<span class="text-ink-500">
					Project <strong class="text-ink-800">{request.coherenceReport.projectScore}</strong>
				</span>
				{#if request.coherenceReport.requestDelta !== 0}
					<span
						class="rounded-pill px-2 py-0.5 font-semibold {request.coherenceReport.requestDelta < 0
							? 'bg-danger-50 text-danger-700'
							: 'bg-success-50 text-success-700'}"
						title="Points this request adds to or takes off the project score"
					>
						{request.coherenceReport.requestDelta > 0 ? '+' : ''}{request.coherenceReport.requestDelta}
					</span>
				{/if}
				<span
					class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500"
				>
					{request.coherenceReport.status.replace('_', ' ')}
				</span>
			</div>
		</header>

		{#if findings.length === 0}
			<p class="px-4 py-8 text-center text-sm text-ink-500">
				{request.coherenceReport.status === 'not_run'
					? 'The check has not been run on this request yet.'
					: 'No published finding matches.'}
			</p>
		{:else}
			<ul class="divide-y divide-line">
				{#each findings as finding (finding.id)}
					<li class="flex items-start gap-3 px-4 py-2.5">
						<span
							title={FINDING_SEVERITIES.find((f) => f.code === finding.severity)?.hint ?? ''}
							class="mt-0.5 shrink-0 rounded-pill border px-2 py-0.5 text-[10px] font-semibold {SEVERITY_TONE[
								finding.severity
							]}"
						>
							{finding.severity}
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-ink-800">{finding.title}</p>
							<!-- Both nodes, always: a contradiction is a relation between two. -->
							<p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
								<span class="font-mono">{finding.requestNodeId}</span>
								<Icon name="arrow-right" size={10} class="text-ink-300" />
								<span class="font-mono">{finding.existingNodeId}</span>
								<span class="text-ink-400">on the {axisLabel(finding.axis)} axis</span>
							</p>
						</div>
						<button
							type="button"
							onclick={() => fixNow(finding.id)}
							class="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-field border border-info-200 bg-info-50 px-2 py-1 text-[11px] font-semibold text-info-600 hover:bg-info-100"
						>
							<Icon name="target" size={12} /> Fix now
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- The impact report: one hypothesis at a time, at a depth the reader sets. -->
	<section class="rounded-card border border-line bg-surface">
		<header class="space-y-3 border-b border-line px-4 py-3">
			<div>
				<div class="flex items-center gap-1.5">
					<p class="text-sm font-semibold text-ink-900">Impact report</p>
					<HelpTip
						title="Impact report"
						what="What moves if this change ships. It starts from what the change touches and follows the links out from there, one hypothesis at a time."
						how={[
							'Pick a hypothesis. Adding, changing and removing break different things, so the three readings are never merged into one list.',
							'Reach is what a row asks OF YOU. Direct means the change is made in it and you will edit it. Knock-on means there is nothing to edit there, it merely rests on something that changes, so it has to be re-read, re-run or re-approved. Further out is neighbourhood, listed so you can decide whether to look.',
							'Rows are grouped the way the product is built: a core holds features, and a feature holds the actions people run inside it.',
							'The level on the right is the WORK the impact implies, from none to blocking, which is a stop rather than a cost.',
							'Open any row for the whole story, including whether a data migration is implied and whether a rule is replayed or rewritten.'
						]}
						value="It is the difference between reading the cost of a change here, on one screen, and discovering it in production three features away from where it was made."
					/>
				</div>
				<p class="text-[11px] text-ink-500">
					What moves if this change ships, followed out from what it touches. The three hypotheses
					are read separately and never merged: removing does not break what adding breaks.
				</p>
				<p class="mt-1 text-[11px] text-ink-600">
					<strong class="font-semibold">What to do with it:</strong> read every row marked direct,
					that is the work itself. Check the knock-ons, they are what breaks quietly. Nothing is
					edited from this page: it is what the estimate, the plan and the decision to cross the
					gate are made from.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<div class="flex items-center gap-1" role="group" aria-label="Hypothesis">
					{#each IMPACT_HYPOTHESES as h (h.code)}
						<button
							type="button"
							onclick={() => pickHypothesis(h.code)}
							aria-pressed={request.impactReport.hypothesis === h.code}
							class="rounded-pill border px-2.5 py-1 text-[11px] font-medium transition {request
								.impactReport.hypothesis === h.code
								? 'border-brand-300 bg-brand-50 text-brand-600'
								: 'border-line bg-surface text-ink-500 hover:border-line-strong'}"
						>
							{h.label}
						</button>
					{/each}
				</div>
				<label class="flex items-center gap-1.5 text-[11px] text-ink-500">
					<span class="font-semibold uppercase tracking-wide text-ink-400">How far</span>
					<select
						value={request.impactReport.depth}
						onchange={(e) => pickDepth(Number(e.currentTarget.value))}
						class="rounded-field border border-line bg-surface px-2 py-1 text-[11px] text-ink-700 outline-none focus:border-brand-400"
					>
						{#each Array.from({ length: MAX_IMPACT_DEPTH }, (_, i) => i + 1) as d (d)}
							<option value={d}>
								{d === 1
									? 'Direct only'
									: d === 2
										? 'Direct and knock-on'
										: `Up to ${d} steps out`}
							</option>
						{/each}
					</select>
				</label>
				<span
					class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500"
				>
					{request.impactReport.status.replace('_', ' ')}
				</span>
			</div>
		</header>

		<!-- The six kinds of impacted node, never mixed. -->
		<div class="flex flex-wrap gap-1 border-b border-line px-4 py-2">
			{#each IMPACT_SECTIONS as section (section.code)}
				{@const count = impacts.filter((f) => f.section === section.code).length}
				<button
					type="button"
					onclick={() => openImpactSection(section.code)}
					aria-pressed={openSection === section.code}
					title={section.hint}
					class="rounded-pill border px-2 py-0.5 text-[11px] font-medium transition {openSection ===
					section.code
						? 'border-brand-300 bg-brand-50 text-brand-600'
						: 'border-line bg-surface text-ink-500 hover:border-line-strong'} {count === 0
						? 'opacity-50'
						: ''}"
				>
					{section.label}
					<span class="ml-0.5 tabular-nums opacity-60">{count}</span>
				</button>
			{/each}
		</div>

		{#if openSection === 'rules_and_scenarios'}
			<!-- Replays and rewrites cost nothing alike, so they are never one number. -->
			<div class="flex flex-wrap gap-3 border-b border-line px-4 py-2 text-[11px]">
				<span class="rounded-pill bg-info-50 px-2 py-0.5 font-semibold text-info-600">
					{rulesToReplay(request).length} to replay
				</span>
				<span class="rounded-pill bg-warning-50 px-2 py-0.5 font-semibold text-warning-700">
					{rulesToRewrite(request).length} to rewrite
				</span>
				<span class="text-ink-500">
					A replay runs again as it stands; a rewrite needs a person.
				</span>
			</div>
		{/if}

		{#if inSection(openSection).length === 0}
			<p class="px-4 py-8 text-center text-sm text-ink-500">
				Nothing moves in {sectionLabel(openSection).toLowerCase()} under this hypothesis.
			</p>
		{:else}
			<!-- One flat list. Each row carries where it sits, so nothing has to be
			     reconstructed from headings above it. -->
			<div class="max-h-[55vh] overflow-y-auto overscroll-contain">
				{@render list(inSection(openSection))}
			</div>
		{/if}

		<!-- The scale, said in the open: a level is the work implied, not the
		     importance of what it lands on. -->
		<dl
			class="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 pt-2 text-[10px] leading-snug"
		>
			<div class="flex items-baseline gap-1">
				<dt class="font-semibold uppercase tracking-wide text-brand-600">Direct</dt>
				<dd class="text-ink-500">the change is made here, you edit it.</dd>
			</div>
			<div class="flex items-baseline gap-1">
				<dt class="font-semibold uppercase tracking-wide text-ink-500">Knock-on</dt>
				<dd class="text-ink-500">nothing to edit, but it rests on something that changes, so check it.</dd>
			</div>
			<div class="flex items-baseline gap-1">
				<dt class="font-semibold uppercase tracking-wide text-ink-500">N steps out</dt>
				<dd class="text-ink-500">neighbourhood, listed so you can decide whether to look.</dd>
			</div>
		</dl>
		<dl class="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 pt-1 text-[10px] leading-snug">
			{#each IMPACT_SEVERITIES as level (level.code)}
				<div class="flex items-baseline gap-1">
					<dt
						class="font-semibold uppercase tracking-wide {IMPACT_TONE[level.code] ?? 'text-ink-400'}"
					>
						{level.label}
					</dt>
					<dd class="text-ink-500">{level.hint.split('.')[0]}.</dd>
				</div>
			{/each}
		</dl>
	</section>
</div>

{#if opened}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="dialog"
		aria-modal="true"
		aria-label={opened.nodeLabel}
		tabindex="-1"
		class="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) opened = null;
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') opened = null;
		}}
	>
		<div
			class="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-pop"
		>
			<div class="flex items-start gap-2">
				<span
					class="mt-0.5 shrink-0 rounded-pill border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide {opened.nodeKind ===
					'action'
						? 'border-brand-200 bg-brand-50 text-brand-600'
						: 'border-line bg-surface-sunken text-ink-500'}"
				>
					{kindLabel(opened.nodeKind)}
				</span>
				<p class="min-w-0 flex-1 text-sm font-semibold leading-snug text-ink-900">
					{opened.nodeLabel}
				</p>
				<button
					type="button"
					onclick={() => (opened = null)}
					aria-label="Close"
					class="shrink-0 rounded-field p-1 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
				>
					<Icon name="x" size={14} />
				</button>
			</div>

			{#if opened.groupPath.length > 0}
				<p class="mt-1 text-[11px] leading-snug text-ink-500">{opened.groupPath.join(' › ')}</p>
			{/if}

			{#if opened.note}
				<p class="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{opened.note}</p>
			{/if}

			<dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11px]">
				<dt class="text-ink-400">How far</dt>
				<dd class="text-ink-700">{distanceOf(opened.depth)}</dd>
				<dt class="text-ink-400">Cost to follow</dt>
				<dd class="text-ink-700">{opened.severity}</dd>
				<dt class="text-ink-400">Read under</dt>
				<dd class="text-ink-700">
					the {IMPACT_HYPOTHESES.find((h) => h.code === opened?.hypothesis)?.label.toLowerCase()} hypothesis
				</dd>
				<dt class="text-ink-400">Listed in</dt>
				<dd class="text-ink-700">{sectionLabel(opened.section)}</dd>
				{#if opened.migrationImplied !== null}
					<dt class="text-ink-400">Migration</dt>
					<dd class="text-ink-700">
						{opened.migrationImplied
							? 'A data migration is implied, so this is not the cheap change it looks like.'
							: 'No data migration is implied.'}
					</dd>
				{/if}
				{#if opened.ruleWork}
					<dt class="text-ink-400">Rule work</dt>
					<dd class="text-ink-700">
						{opened.ruleWork === 'replay'
							? 'Replay: the text still holds, it only has to run again.'
							: 'Rewrite: the text no longer holds, and a person has to write it again.'}
					</dd>
				{/if}
				<dt class="text-ink-400">Node</dt>
				<dd class="break-all font-mono text-[10px] text-ink-500">{opened.nodeId}</dd>
			</dl>
		</div>
	</div>
{/if}

<!--
  One row, and one heading. A heading is a plain label until the thing it names
  is itself impacted, and then it carries the same reading as a row and opens the
  same way: a feature that moves is not less clickable for holding actions.
-->
{#snippet kindChip(kind: string)}
	<span
		class="w-[4.6rem] shrink-0 rounded-pill border px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide {kind ===
		'action'
			? 'border-brand-200 bg-brand-50 text-brand-600'
			: 'border-line bg-surface-sunken text-ink-500'}"
	>
		{kindLabel(kind)}
	</span>
{/snippet}

{#snippet reading(impact: ImpactFinding)}
	<span
		class="shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-medium {impact.depth <= 1
			? 'bg-brand-50 text-brand-600'
			: 'bg-surface-sunken text-ink-500'}"
		title={reachMeaning(impact.depth)}
	>
		{reachLabel(impact.depth)}
	</span>
	{#if impact.migrationImplied !== null}
		<span
			class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-semibold {impact.migrationImplied
				? 'bg-warning-50 text-warning-700'
				: 'bg-surface-sunken text-ink-500'}"
		>
			{impact.migrationImplied ? 'migration implied' : 'no migration'}
		</span>
	{/if}
	{#if impact.ruleWork}
		<span
			class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-semibold {impact.ruleWork ===
			'rewrite'
				? 'bg-warning-50 text-warning-700'
				: 'bg-info-50 text-info-600'}"
		>
			{impact.ruleWork}
		</span>
	{/if}
	<span
		class="shrink-0 text-[10px] font-semibold uppercase tracking-wide {IMPACT_TONE[
			impact.severity
		] ?? 'text-ink-400'}"
		title={severityHint(impact.severity)}
	>
		{impact.severity}
	</span>
{/snippet}

{#snippet list(rows: ImpactFinding[])}
	{#if rows.length > 0}
		<ul class="divide-y divide-line">
			{#each rows as impact (impact.id)}
				<li>
					<button
						type="button"
						onclick={() => (opened = impact)}
						title="Open this impact in full"
						class="flex w-full items-start gap-2.5 px-4 py-2 text-left hover:bg-surface-sunken/60"
					>
						<span class="mt-0.5">{@render kindChip(impact.nodeKind)}</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm text-ink-800">
								{impact.nodeLabel}
								{#if impact.groupPath.length > 0}
									<span class="text-[11px] font-normal text-ink-400">
										in {impact.groupPath.join(' › ')}
									</span>
								{/if}
							</span>
							{#if impact.note}
								<!-- What actually happens to it. Hiding this behind a click made the
								     list a wall of names nobody could act on. -->
								<span class="mt-0.5 block text-[11px] leading-snug text-ink-500">
									{impact.note.length > 150 ? `${impact.note.slice(0, 150).trimEnd()}…` : impact.note}
								</span>
							{/if}
						</span>
						<span class="mt-0.5 flex shrink-0 items-center gap-2.5">{@render reading(impact)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}
