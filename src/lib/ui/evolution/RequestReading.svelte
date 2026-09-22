<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Chip, EditableText, Icon, MultiSelect, Select, confirmDialog, promptDialog } from '$ui/design-system';
	import {
		ALL_BLOCK_FIELDS,
		REQUEST_ORIGINS,
		STAGE_ORDER,
		blockFieldByPath,
		type ImpactHypothesis,
		type RequestStage
	} from '$domain/evolution';
	import type { DossierReading, HistoryPart, ImpactPart, ProposalRow, ReportPart } from '$lib/server/evolution-view.server';
	import { applyEvolution } from './reading-api';
	import ProposalCard from './ProposalCard.svelte';
	import ImpactReading from './ImpactReading.svelte';
	import NextStepBand from './NextStepBand.svelte';

	/**
	 * One request, read in three steps: the idea (a title, an origin, the
	 * features it touches), the proposals to sign (five questions per touched
	 * feature, nothing else), and the impact report (what moves in the spec and
	 * in the code, in plain words). Verify and Accept appear once code exists.
	 * Everything else folds behind "More".
	 */
	interface Props {
		projectId: string;
		dossier: DossierReading;
		proposals: readonly ProposalRow[];
		impacts: Record<ImpactHypothesis, ImpactPart['impact']>;
		report: ReportPart['report'] | null;
		history: HistoryPart['history'];
		leaves: readonly { id: string; name: string }[];
		members: readonly { id: string; name: string }[];
		actorId: string;
		canEdit: boolean;
		isAdmin: boolean;
		fullHref: string;
		onBack: () => void;
		onFixNow: (target: string) => void;
	}
	let {
		projectId,
		dossier,
		proposals,
		impacts,
		report,
		history,
		leaves,
		members,
		actorId,
		canEdit,
		isAdmin,
		fullHref,
		onBack,
		onFixNow
	}: Props = $props();

	let moreOpen = $state(false);
	let busy = $state(false);

	const stageIndex = (stage: RequestStage) => STAGE_ORDER.indexOf(stage);
	const codeExists = $derived(stageIndex(dossier.stage) >= stageIndex('implementation'));
	const steps = $derived([
		{ n: 1, label: 'Idea', anchor: 'idea' },
		{ n: 2, label: 'Proposals to sign', anchor: 'proposals' },
		{ n: 3, label: 'Impact report', anchor: 'impact' },
		...(codeExists ? [{ n: 4, label: 'Verify', anchor: 'verify' }, { n: 5, label: 'Accept', anchor: 'accept' }] : [])
	]);
	/** The page scrolls inside its own container, so a step jumps by hand. */
	function jump(e: MouseEvent, anchor: string) {
		const target = document.getElementById(anchor);
		if (!target) return;
		e.preventDefault();
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	/** Which touched features show their proposals; the first opens, the others fold. */
	let openLeaves = $state<Record<string, boolean>>({});
	const isOpen = (leafId: string, index: number) => openLeaves[leafId] ?? index === 0;
	const waitingOn = (leafId: string) => proposals.filter((p) => p.leafId === leafId).length;
	const filledOn = (leafId: string) => fieldsOf(leafId).filter((f) => f.filled).length;
	const current = $derived(
		dossier.stage === 'draft' || dossier.stage === 'specification'
			? dossier.leafIds.length === 0
				? 1
				: 2
			: dossier.stage === 'coherence'
				? 3
				: dossier.stage === 'implementation'
					? 4
					: 5
	);

	const originOptions = [{ code: '', label: 'Where does it come from?' }, ...REQUEST_ORIGINS];
	const leafOptions = $derived(leaves.map((l) => ({ code: l.id, label: l.name })));
	const inlineFields = ALL_BLOCK_FIELDS.filter((f) => f.editor === 'inline');
	const proposalFor = (path: string, leafId: string | null) =>
		proposals.find((p) => p.targetField === path && p.leafId === leafId) ?? null;
	const fieldsOf = (leafId: string) => dossier.fields.filter((f) => f.leafId === leafId);
	const undecided = $derived(report ? report.lines.filter((l) => l.decision === 'undecided') : []);

	async function run(op: Record<string, unknown>) {
		busy = true;
		try {
			return await applyEvolution(projectId, [{ requestId: dossier.id, ...op }]);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		const ok = await confirmDialog({
			title: 'Delete this request?',
			message: 'Only the dossier goes. Every value it wrote into the features stays exactly as it is.',
			confirmLabel: 'Delete',
			danger: true
		});
		if (!ok) return;
		if (await run({ op: 'delete_request' })) onBack();
	}

	async function foldBack(observationId: string) {
		const leafId = dossier.leafIds[0];
		if (!leafId) return;
		const text = await promptDialog({ title: 'The acceptance criterion this remark becomes', confirmLabel: 'Write it on the feature' });
		if (text === null) return;
		await run({ op: 'fold_back', observationId, leafId, text });
	}

	const VERDICTS = ['regression', 'missing', 'non_conform', 'out_of_scope', 'conform'] as const;
	const verdictLabel: Record<string, string> = {
		conform: 'Conform',
		non_conform: 'Non-conform',
		missing: 'Missing',
		out_of_scope: 'Out of scope',
		regression: 'Regression'
	};
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<!-- The idea -->
	<div class="space-y-3">
		<button type="button" class="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700" onclick={onBack}>
			<Icon name="arrow-left" size={12} />
			All evolutions
		</button>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				{#if canEdit}
					<EditableText
						value={dossier.title}
						placeholder="What is the change, in one line?"
						ariaLabel="Request title"
						class="text-2xl font-semibold text-ink-900"
						onCommit={(title) => run({ op: 'update_request', title })}
					/>
				{:else}
					<h1 class="text-2xl font-semibold text-ink-900">{dossier.title || 'Untitled request'}</h1>
				{/if}
				<div class="mt-2 flex flex-wrap items-center gap-2">
					{#if canEdit}
						<Select value={dossier.origin ?? ''} options={originOptions} onchange={(origin) => origin && run({ op: 'update_request', origin })} class="w-52" />
					{:else}
						<Chip tone="neutral">{REQUEST_ORIGINS.find((o) => o.code === dossier.origin)?.label ?? 'Origin not set'}</Chip>
					{/if}
					{#if dossier.specVersion > 0}
						<Chip tone="brand">Spec version {dossier.specVersion}{dossier.frozen ? ', frozen' : ''}</Chip>
					{/if}
					{#if dossier.status === 'closed'}<Chip tone="success">Closed</Chip>{/if}
				</div>
			</div>
			<ol class="flex flex-wrap items-center gap-1 text-xs" aria-label="Steps">
				{#each steps as step (step.n)}
					<li>
						<a
							href="#{step.anchor}"
							class="flex items-center gap-1 rounded-pill px-2.5 py-1 hover:bg-surface-sunken {step.n === current ? 'bg-brand-50 font-semibold text-brand-600' : step.n < current ? 'text-ink-700' : 'text-ink-400'}"
							onclick={(e) => jump(e, step.anchor)}
						>
							{#if step.n < current}<Icon name="check" size={11} />{:else}<span>{step.n}</span>{/if}
							{step.label}
						</a>
					</li>
				{/each}
			</ol>
		</div>

		<section id="idea" class="rounded-card border border-line bg-surface p-4" aria-label="Idea">
			<h2 class="text-sm font-semibold text-ink-900">Which existing features does this change touch?</h2>
			<p class="mt-0.5 text-xs text-ink-400">
				An evolution is made in features that exist. Anything new it needs shows up in the impact report, never as a feature you create here.
			</p>
			<div class="mt-3">
				{#if canEdit}
					<MultiSelect values={[...dossier.leafIds]} options={leafOptions} placeholder="Pick a feature" onchange={(leafIds) => run({ op: 'set_leaves', leafIds })} />
				{:else}
					<p class="flex flex-wrap gap-1">
						{#each dossier.leaves as leaf (leaf.id)}<Chip tone="neutral">{leaf.name}</Chip>{/each}
					</p>
				{/if}
			</div>
		</section>
	</div>

	<!-- The proposals to sign -->
	{#if dossier.leafIds.length > 0}
		<section id="proposals" class="space-y-3" aria-label="Proposals to sign">
			<header>
				<h2 class="text-base font-semibold text-ink-900">Proposals to sign</h2>
				<p class="text-xs text-ink-400">
					Five questions per touched feature. The assistant proposes a value with its sources; you accept, reword or refuse it, and accepting writes it on the feature.
					{#if proposals.length > 0}<strong class="font-medium text-ink-700">{proposals.length} waiting.</strong>{/if}
				</p>
			</header>
			{#each dossier.leaves as leaf, index (leaf.id)}
				{@const open = isOpen(leaf.id, index)}
				{@const waiting = waitingOn(leaf.id)}
				<div class="space-y-2">
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-field px-1 py-1 text-left text-sm font-semibold text-ink-700 hover:bg-surface-sunken"
						aria-expanded={open}
						onclick={() => (openLeaves = { ...openLeaves, [leaf.id]: !open })}
					>
						<Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} class="text-ink-400" />
						<Icon name="target" size={13} class="text-brand-600" />
						{leaf.name}
						<span class="ml-auto text-xs font-normal text-ink-400">
							{filledOn(leaf.id)} of {fieldsOf(leaf.id).length} answered{#if waiting > 0}, <span class="text-brand-600">{waiting} to sign</span>{/if}
						</span>
					</button>
					{#if open}
						{#each fieldsOf(leaf.id) as field (field.path + '@' + leaf.id)}
							{@const meta = blockFieldByPath(field.path) ?? inlineFields[0]}
							<ProposalCard {projectId} requestId={dossier.id} {field} {meta} proposal={proposalFor(field.path, leaf.id)} {canEdit} {members} {actorId} />
						{/each}
					{/if}
				</div>
			{/each}
		</section>
	{/if}

	<!-- The impact report -->
	<section id="impact" class="space-y-3" aria-label="Impact report">
		<header>
			<h2 class="text-base font-semibold text-ink-900">Impact report</h2>
			<p class="text-xs text-ink-400">What implementing this would move: in the Lyriks specification, and in the code.</p>
		</header>
		{#if dossier.leafIds.length === 0}
			<p class="rounded-field border border-dashed border-line px-3 py-4 text-center text-xs text-ink-400">Name the touched features first.</p>
		{:else}
			<ImpactReading {projectId} {dossier} {impacts} {canEdit} {onFixNow} />
		{/if}
		{#if !codeExists}
			<NextStepBand {projectId} {dossier} {canEdit} {isAdmin} />
		{/if}
	</section>

	<!-- Verify: the code against the frozen spec -->
	{#if codeExists && report}
		<section id="verify" class="space-y-3" aria-label="Verify">
			<header class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 class="text-base font-semibold text-ink-900">Verify</h2>
					<p class="text-xs text-ink-400">
						What was built against spec version {dossier.specVersion}, line by line, derived from the implementation index.
						{#if report.status === 'building'}No report yet.{:else}{undecided.length} to decide.{/if}
					</p>
				</div>
				{#if canEdit && report.status !== 'closed'}
					<Button size="sm" variant="outline" disabled={busy} onclick={() => run({ op: 'build_implementation_report' })}>
						<Icon name="rotate" size={12} />
						{report.status === 'building' ? 'Build the report' : 'Rebuild'}
					</Button>
				{/if}
			</header>
			{#each VERDICTS as verdict (verdict)}
				{@const lines = report.lines.filter((l) => l.verdict === verdict)}
				{#if lines.length > 0}
					<div class="rounded-card border border-line bg-surface p-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-ink-700">{verdictLabel[verdict]} <span class="font-normal text-ink-400">{lines.length}</span></h3>
							{#if canEdit && lines.some((l) => l.decision === 'undecided')}
								<div class="flex gap-1">
									<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'decide_line', verdict, decision: 'validated' })}>Validate all</Button>
									<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'decide_line', verdict, decision: 'invalidated' })}>Invalidate all</Button>
								</div>
							{/if}
						</div>
						<ul class="mt-2 space-y-1.5">
							{#each lines as line (line.id)}
								<li class="flex flex-wrap items-start justify-between gap-2 text-xs">
									<div class="min-w-0 flex-1">
										<p class="text-ink-900">{line.requirement}</p>
										<p class="text-ink-400">{line.filePath ? `${line.filePath}${line.lineRange ? `:${line.lineRange}` : ''}` : line.codeStatement}</p>
									</div>
									{#if line.decision !== 'undecided'}
										<Chip tone="neutral">{line.decision}</Chip>
									{:else if canEdit}
										<div class="flex gap-1">
											{#if verdict === 'out_of_scope'}
												<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'decide_line', lineId: line.id, decision: 'adopted' })}>Adopt</Button>
												<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'decide_line', lineId: line.id, decision: 'removed' })}>Remove</Button>
											{:else}
												<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'decide_line', lineId: line.id, decision: 'validated' })}>Validate</Button>
												<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'decide_line', lineId: line.id, decision: 'invalidated' })}>Invalidate</Button>
											{/if}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
			{#if dossier.stage === 'implementation'}
				<NextStepBand {projectId} {dossier} {canEdit} {isAdmin} />
			{/if}
		</section>
	{/if}

	<!-- Accept: the remarks, and what goes back into the spec -->
	{#if stageIndex(dossier.stage) >= stageIndex('acceptance')}
		<section id="accept" class="space-y-3" aria-label="Accept">
			<header>
				<h2 class="text-base font-semibold text-ink-900">Accept</h2>
				<p class="text-xs text-ink-400">
					The remarks logged while walking the product. A validated remark goes back into the spec before the request closes.
					{#if dossier.acceptanceDebt > 0}<strong class="font-medium text-ink-700">{dossier.acceptanceDebt} still to fold back.</strong>{/if}
				</p>
			</header>
			{#if dossier.observations.length === 0}
				<p class="rounded-field border border-dashed border-line px-3 py-4 text-center text-xs text-ink-400">No remark logged yet; the walkthrough lives in the full view.</p>
			{:else}
				<ul class="space-y-2">
					{#each dossier.observations as observation (observation.id)}
						<li class="rounded-card border border-line bg-surface p-3 text-xs">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-ink-900">{observation.body}</p>
								<Chip tone={observation.ruling === 'validated' ? 'success' : 'neutral'}>{observation.ruling}</Chip>
							</div>
							{#if canEdit}
								<div class="mt-2 flex flex-wrap gap-1">
									{#if observation.ruling === 'open'}
										<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'rule_observation', observationId: observation.id, ruling: 'validated' })}>Validate</Button>
										<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'rule_observation', observationId: observation.id, ruling: 'deferred' })}>Defer</Button>
									{:else if observation.ruling === 'validated' && !observation.foldedBackAt}
										<Button size="sm" variant="outline" disabled={busy} onclick={() => foldBack(observation.id)}>Fold back into the spec</Button>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if dossier.stage === 'acceptance'}
				<NextStepBand {projectId} {dossier} {canEdit} {isAdmin} />
			{:else if dossier.stage === 'delivered' && dossier.status === 'open' && canEdit}
				<Button disabled={busy} onclick={() => run({ op: 'close_request' })}>Close the request</Button>
			{/if}
		</section>
	{/if}

	<!-- Everything else -->
	<section class="border-t border-line pt-4">
		<button type="button" class="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700" onclick={() => (moreOpen = !moreOpen)}>
			<Icon name={moreOpen ? 'chevron-up' : 'chevron-down'} size={12} />
			More: scores, timeline, full view
		</button>
		{#if moreOpen}
			<div class="mt-3 grid gap-4 md:grid-cols-2">
				<div class="text-xs text-ink-700">
					<p>Maturity <strong class="font-medium text-ink-900">{dossier.maturity.score}%</strong> ({dossier.maturity.tier}). {dossier.maturity.statement}</p>
					<p class="mt-1">Readiness of the touched features: <strong class="font-medium text-ink-900">{dossier.readiness.average ?? 'unknown'}</strong> on the TRL scale.</p>
					<p class="mt-2">
						<a href={fullHref} class="text-brand-600 hover:underline">Open the full view</a>
						<span class="text-ink-400"> (every block, the walkthrough, the signatures).</span>
					</p>
					{#if canEdit && dossier.status !== 'deleted'}
						<p class="mt-2"><button type="button" class="text-danger-600 hover:underline" onclick={remove}>Delete this request</button></p>
					{/if}
				</div>
				<ol class="space-y-1 text-xs text-ink-700">
					{#each history as entry, i (i)}
						<li>
							<span class="text-ink-400">{entry.recordedAt.slice(0, 16).replace('T', ' ')}</span>
							· {entry.summary}
							<span class="text-ink-400">({entry.authorId}{entry.channel === 'ai_client' ? ', through the assistant' : ''})</span>
						</li>
					{:else}
						<li class="text-ink-400">Nothing recorded yet.</li>
					{/each}
				</ol>
			</div>
		{/if}
	</section>
</div>
