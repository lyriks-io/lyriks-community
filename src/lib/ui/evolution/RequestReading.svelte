<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { Button, Chip, EditableText, Icon, MultiSelect, Select, confirmDialog, promptDialog } from '$ui/design-system';
	import {
		ALL_BLOCK_FIELDS,
		REQUEST_ORIGINS,
		STAGE_ORDER,
		blockFieldByPath,
		PLACE_PARAM,
		parsePlace,
		placeElementId,
		type PagePlace,
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
		/** The verb each touched feature carries, and what the request does overall. */
		proposes: { byLeaf: Record<string, ImpactHypothesis>; main: ImpactHypothesis };
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
		proposes,
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
	/**
	 * The page opens on what is owed (589b8fb9): a question with no answer, one
	 * parked as an open question, or a value waiting for a signature. An answer
	 * already given is folded, never hidden: its row says how many and opens on
	 * demand. A touched feature with nothing owed stays folded too.
	 */
	let openLeaves = $state<Record<string, boolean>>({});
	let answeredOpen = $state<Record<string, boolean>>({});
	const isOwed = (field: { path: string; filled: boolean; openQuestion: boolean }, leafId: string) =>
		!field.filled || field.openQuestion || proposalFor(field.path, leafId) !== null;
	const owedOn = (leafId: string) => fieldsOf(leafId).filter((f) => isOwed(f, leafId)).length;
	const nothingOwed = $derived(dossier.leaves.every((l) => owedOn(l.id) === 0));
	const isOpen = (leafId: string, index: number) =>
		openLeaves[leafId] ?? (nothingOwed ? index === 0 : owedOn(leafId) > 0);
	const waitingOn = (leafId: string) => proposals.filter((p) => p.leafId === leafId).length;
	const filledOn = (leafId: string) => fieldsOf(leafId).filter((f) => f.filled).length;
	/** What the reader owes, counted once for the whole request. */
	const emptyCount = $derived(
		dossier.leaves.reduce(
			(n, l) => n + fieldsOf(l.id).filter((f) => (!f.filled || f.openQuestion) && proposalFor(f.path, l.id) === null).length,
			0
		)
	);
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
	/**
	 * The features that can be named here: the tree's leaves, plus what this
	 * request drafts. A draft is picked from this list like any existing feature
	 * (ac-evo-draft-3), so it is never printed as its raw id, and taking it out
	 * is not something this control can do: the act keeps the change among the
	 * features its own request touches.
	 */
	const leafOptions = $derived([
		...leaves.map((l) => ({ code: l.id, label: l.name })),
		...dossier.leaves
			.filter((l) => !leaves.some((existing) => existing.id === l.id))
			.map((l) => ({ code: l.id, label: l.name }))
	]);
	const CHANGE_LABEL: Record<string, string> = { add: 'new', amend: 'amended', remove: 'removed' };
	const inlineFields = ALL_BLOCK_FIELDS.filter((f) => f.editor === 'inline');
	const proposalFor = (path: string, leafId: string | null) =>
		proposals.find((p) => p.targetField === path && p.leafId === leafId) ?? null;
	const fieldsOf = (leafId: string) => dossier.fields.filter((f) => f.leafId === leafId);
	const undecided = $derived(report ? report.lines.filter((l) => l.decision === 'undecided') : []);

	/**
	 * Opening the page on a place: the address names a field, a proposal, the
	 * next gate, a report line or an observation, and the page unfolds what
	 * hides it, scrolls to it and marks it for a moment. A place that no longer
	 * exists is said, never silently ignored: the person came for something.
	 */
	let highlighted = $state<string | null>(null);
	let placeNotice = $state<string | null>(null);
	const fieldId = (leafId: string | null, path: string) => placeElementId({ kind: 'field', leafId, path });

	function resolvePlace(place: PagePlace): { elementId: string; leafId?: string } | { gone: string } {
		switch (place.kind) {
			case 'proposal': {
				const p = proposals.find((x) => x.id === place.id);
				if (!p) return { gone: 'This proposal no longer waits for a signature: it has been decided.' };
				return { elementId: fieldId(p.leafId, p.targetField), leafId: p.leafId ?? undefined };
			}
			case 'field':
				if (!dossier.fields.some((f) => f.leafId === place.leafId && f.path === place.path)) {
					return { gone: 'This field is no longer on the request: the feature it belongs to is no longer touched.' };
				}
				return { elementId: placeElementId(place), leafId: place.leafId ?? undefined };
			case 'line':
				if (!report?.lines.some((l) => l.id === place.id)) return { gone: 'This report line no longer exists: the report was rebuilt since.' };
				return { elementId: placeElementId(place) };
			case 'observation':
				if (!dossier.observations.some((o) => o.id === place.id)) return { gone: 'This remark is no longer on the request.' };
				return { elementId: placeElementId(place) };
			case 'next-step':
				return { elementId: placeElementId(place) };
		}
	}

	async function openPlace(key: string | null) {
		placeNotice = null;
		const place = parsePlace(key);
		if (!place) return;
		const target = resolvePlace(place);
		if ('gone' in target) {
			placeNotice = target.gone;
			return;
		}
		if (target.leafId) {
			openLeaves = { ...openLeaves, [target.leafId]: true };
			// A link may point at a field already answered, which is folded.
			if (place.kind === 'field') answeredOpen = { ...answeredOpen, [target.leafId]: true };
		}
		await tick();
		const element = document.getElementById(target.elementId);
		if (!element) {
			placeNotice = place.kind === 'next-step' ? 'This request has no gate left to cross.' : 'This place is not on the page any more.';
			return;
		}
		element.scrollIntoView({ behavior: 'smooth', block: 'center' });
		highlighted = target.elementId;
		setTimeout(() => {
			if (highlighted === target.elementId) highlighted = null;
		}, 2400);
	}
	afterNavigate(({ to }) => openPlace(to?.url.searchParams.get(PLACE_PARAM) ?? null));
	const mark = (id: string) => (highlighted === id ? 'ring-2 ring-brand-400 ring-offset-2' : '');
	const nextStepId = placeElementId({ kind: 'next-step' });

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
	{#if placeNotice}
		<p class="flex items-start gap-2 rounded-field border border-warning-200 bg-warning-50/60 px-3 py-2 text-xs text-ink-700" role="status">
			<Icon name="info" size={13} class="mt-0.5 shrink-0 text-warning-600" />
			{placeNotice}
		</p>
	{/if}
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
			<h2 class="text-sm font-semibold text-ink-900">Which features does this change touch?</h2>
			<p class="mt-0.5 text-xs text-ink-400">
				The features that exist and the ones this request drafts. A drafted feature is named here like any other, and nothing is written into the features before the specification is frozen.
			</p>
			<div class="mt-3">
				{#if canEdit}
					<MultiSelect values={[...dossier.leafIds]} options={leafOptions} placeholder="Pick a feature" onchange={(leafIds) => run({ op: 'set_leaves', leafIds })} />
				{:else}
					<p class="flex flex-wrap gap-1">
						{#each dossier.leaves as leaf (leaf.id)}<Chip tone={leaf.change ? 'brand' : 'neutral'}
								>{leaf.name}{#if leaf.change}
									<span class="ml-1 font-normal opacity-70">{CHANGE_LABEL[leaf.change]}</span>
								{/if}</Chip
							>{/each}
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
				</p>
				<!-- What is owed leads, before any card (fd61cb83). -->
				<p class="mt-1 text-sm text-ink-700">
					{#if emptyCount === 0 && proposals.length === 0}
						Nothing is owed: every question has an answer and no value waits for a signature.
					{:else}
						Owed:
						{#if emptyCount > 0}<strong class="font-medium text-ink-900">{emptyCount} {emptyCount === 1 ? 'question' : 'questions'} to answer</strong>{/if}{#if emptyCount > 0 && proposals.length > 0}{', '}{/if}{#if proposals.length > 0}<strong class="font-medium text-brand-700">{proposals.length} {proposals.length === 1 ? 'value' : 'values'} to sign</strong>{/if}.
					{/if}
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
						{#if leaf.change}<Chip tone="brand">{CHANGE_LABEL[leaf.change]}</Chip>{/if}
						<span class="ml-auto text-xs font-normal text-ink-400">
							{filledOn(leaf.id)} of {fieldsOf(leaf.id).length} answered{#if waiting > 0}, <span class="text-brand-600">{waiting} to sign</span>{/if}
						</span>
					</button>
					{#if open}
						{@const answered = fieldsOf(leaf.id).filter((f) => !isOwed(f, leaf.id))}
						{@const showAnswered = answeredOpen[leaf.id] ?? false}
						{#each fieldsOf(leaf.id) as field (field.path + '@' + leaf.id)}
							{@const meta = blockFieldByPath(field.path) ?? inlineFields[0]}
							{@const id = fieldId(leaf.id, field.path)}
							{#if isOwed(field, leaf.id) || showAnswered}
								<div {id} class="scroll-mt-6 rounded-card transition-shadow {mark(id)}">
									<ProposalCard {projectId} requestId={dossier.id} {field} {meta} proposal={proposalFor(field.path, leaf.id)} {canEdit} {members} {actorId} />
								</div>
							{/if}
						{/each}
						{#if answered.length > 0}
							<button
								type="button"
								class="flex items-center gap-1 px-1 text-xs text-ink-400 hover:text-ink-700"
								aria-expanded={showAnswered}
								onclick={() => (answeredOpen = { ...answeredOpen, [leaf.id]: !showAnswered })}
							>
								<Icon name={showAnswered ? 'chevron-up' : 'chevron-down'} size={12} />
								{showAnswered
									? `Fold the ${answered.length} already answered`
									: `${answered.length} already answered: ${answered.map((f) => (blockFieldByPath(f.path) ?? inlineFields[0]).label).join(', ')}`}
							</button>
						{/if}
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
			<ImpactReading {projectId} {dossier} {impacts} {proposes} {canEdit} {onFixNow} />
		{/if}
		{#if !codeExists}
			<div id={nextStepId} class="scroll-mt-6 rounded-card transition-shadow {mark(nextStepId)}">
				<NextStepBand {projectId} {dossier} {canEdit} {isAdmin} />
			</div>
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
								{@const lineId = placeElementId({ kind: 'line', id: line.id })}
								<li id={lineId} class="flex scroll-mt-6 flex-wrap items-start justify-between gap-2 rounded-field text-xs transition-shadow {mark(lineId)}">
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
				<div id={nextStepId} class="scroll-mt-6 rounded-card transition-shadow {mark(nextStepId)}">
					<NextStepBand {projectId} {dossier} {canEdit} {isAdmin} />
				</div>
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
						{@const observationId = placeElementId({ kind: 'observation', id: observation.id })}
						<li id={observationId} class="scroll-mt-6 rounded-card border border-line bg-surface p-3 text-xs transition-shadow {mark(observationId)}">
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
				<div id={nextStepId} class="scroll-mt-6 rounded-card transition-shadow {mark(nextStepId)}">
					<NextStepBand {projectId} {dossier} {canEdit} {isAdmin} />
				</div>
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
					<!-- A value the touched features already held is a reading of them, never a decision of this request (2a9716f2). -->
					{#if dossier.maturity.inherited + dossier.maturity.answeredHere > 0}
						<p class="mt-1">
							Of the {dossier.maturity.inherited + dossier.maturity.answeredHere} answers it counts,
							<strong class="font-medium text-ink-900">{dossier.maturity.answeredHere}</strong> {dossier.maturity.answeredHere === 1 ? 'was' : 'were'} given in this request and
							<strong class="font-medium text-ink-900">{dossier.maturity.inherited}</strong> {dossier.maturity.inherited === 1 ? 'is' : 'are'} what the touched features already said.
						</p>
					{/if}
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
