<script lang="ts">
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { pushToast } from '$ui/design-system';
	import { PLACE_PARAM, changesSummary, parsePlace, placeElementId } from '$domain/evolution';
	import type { DossierReading, ReportPart } from '$lib/server/evolution-view.server';
	import type { ClosingReading } from '$lib/server/evolution-closing.server';
	import {
		CATEGORIES,
		categoryOf,
		codeReadOnce,
		decisionOf,
		fixPrompt,
		isRequirement,
		lineLabels,
		ownLines,
		readLine,
		requirementParts,
		whereOf,
		type Category,
		type Choice
	} from './report-board';
	import { NEXT_BAND, NEXT_BAND_TEXT, PRIMARY_44, SECONDARY_44, SECONDARY_48, SECTION_TITLE, TEXTAREA, numberPill, primary48 } from './evo-look';
	import { scrollToBlock } from './evo-scroll';
	import { personName } from './people';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { patchKey, type Patches } from './dossier-overlay';
	import EvoSegmented from './EvoSegmented.svelte';
	import ImplementationWaitingCard from './ImplementationWaitingCard.svelte';
	import VerificationLine from './VerificationLine.svelte';
	import VerificationSummary from './VerificationSummary.svelte';
	import EditorialNote from './EditorialNote.svelte';
	import ClosingBlock from './ClosingBlock.svelte';
	import { noteReadKey, verificationNote } from './editorial-note';
	import { nextStepsOf, stepNow, type NextStepId } from './next-steps';
	import { mcpEndpointFor } from '$domain/foundation';

	/**
	 * Step 6, Verification, the way the design reads it, on the report the
	 * platform derives from the implementation index against the frozen version
	 * (ac-evo-impl-9): the executive summary first on every visit, then the
	 * lines in five sections, each with what the spec expects and what the code
	 * shows and the opinion a person gives on it (the decision the line takes),
	 * the instruction that goes back to the person's LLM, and the way the
	 * request finishes: acceptance testing, its approval, then closing it, which
	 * declares it live and makes the spec the reference.
	 *
	 * Every decision and every crossing reads at once while it saves
	 * (ac-evo-form-edit-optimistic); one the server refuses goes back, its reason
	 * said. Rerunning the impact analysis is a computation: its button says it
	 * runs until the server answers.
	 */
	type Report = NonNullable<ReportPart['report']>;
	type Line = Report['lines'][number];
	interface Props {
		projectId: string;
		dossier: DossierReading;
		report: Report | null;
		canEdit: boolean;
		highlighted: string | null;
		/** Opens Implementation, to follow the next round of code. */
		onDevelopment: () => void;
		/** Who reads, to approve in their name, and the names of the people waited on. */
		actorId?: string;
		members?: readonly { id: string; name: string }[];
		/** What the closed request leaves behind (the design's closing block); null while it is not closed. */
		closing?: ClosingReading | null;
		/** The reader's role lets them edit the request: a closed request still tells its ticket. */
		mayEdit?: boolean;
		onDecisionLog?: () => void;
	}
	let { projectId, dossier, report, canEdit, highlighted, onDevelopment, actorId = '', members = [], closing = null, mayEdit = false, onDecisionLog = () => {} }: Props = $props();
	const writes = useEvolutionWrites(untrack(() => projectId));
	/** Sends operations on the request, read at once through `patches`; true once saved. */
	const send = (patches: Patches, ops: Record<string, unknown>[], what: string) => writes.send(patches, ops.map((op) => ({ requestId: dossier.id, ...op })), what);

	const frozen = $derived(dossier.stage === 'implementation' || dossier.stage === 'acceptance' || dossier.stage === 'delivered');
	const own = $derived(ownLines(report?.lines ?? []));
	const labels = $derived(lineLabels(own));
	/** The verification reads once the code was read at least once, or a person decided on it. */
	const ready = $derived(codeReadOnce(dossier.stage, report?.lines ?? []));
	const undecidedAtImpact = $derived(dossier.docking.points.filter((p) => p.qualification !== 'fits' && !p.risk).length);
	const emptyMessage = $derived(
		!frozen
			? undecidedAtImpact > 0
				? `The impact analysis is still waiting for ${undecidedAtImpact} decision(s).`
				: 'The impact analysis has not handed the evolution to implementation yet.'
			: 'Implementation has not started yet. Launch it to see the verification.'
	);

	const key = $derived(dossier.key ?? 'EVO');
	const version = $derived(dossier.specVersion);
	/** Decisions are taken while the request stands at Build and its report is open. */
	const editable = $derived(canEdit && dossier.status === 'open' && dossier.stage === 'implementation' && report?.status !== 'closed');
	/** Live, or closed: what was kept is in the spec now. */
	const landed = $derived(dossier.status === 'closed' || !!dossier.deployment);
	/**
	 * The only refusal left at Build is the adoption that amended the spec: every
	 * line decided, none sent back, and still the report does not close.
	 */
	const rechallenge = $derived(
		dossier.stage === 'implementation' &&
			!dossier.gate.ok &&
			own.some((l) => l.decision === 'adopted') &&
			!own.some((l) => l.decision === 'invalidated' || (l.decision === 'undecided' && l.verdict !== 'conform'))
	);

	/** Choices made on the page that no decision records: an analysis, a suggestion, a change of spec. */
	let local = $state<Record<string, Choice>>({});
	let excluded = $state<Record<string, boolean>>({});
	let suggestions = $state<Record<string, string>>({});
	let instruction = $state('');
	let copied = $state(false);

	const readings = $derived(
		new Map(
			own.map((l) => [
				l.id,
				readLine(l, { local: local[l.id], excluded: excluded[l.id], suggestion: suggestions[l.id], landed, rechallenge, specVersion: version })
			])
		)
	);
	const reading = (l: Line) => readings.get(l.id)!;
	const asked = $derived(own.filter(isRequirement));
	const settled = $derived(asked.filter((l) => reading(l).resolved));
	const score = $derived(asked.length === 0 ? 0 : Math.round((settled.length * 100) / asked.length));
	const open = $derived(own.filter((l) => !reading(l).resolved || reading(l).specChange).length);
	const allGreen = $derived(own.length > 0 && open === 0);
	const sections = $derived.by(() => {
		let n = 0;
		return CATEGORIES.map((category) => {
			const items = own.filter((l) => reading(l).section === category.key);
			return { category, items, number: items.length > 0 ? `6.${++n}` : '' };
		});
	});
	const guideNumber = $derived(`6.${sections.filter((s) => s.items.length > 0).length + 1}`);
	const corrections = $derived(own.filter((l) => reading(l).inFix));
	const FOUND_GAPS: ReadonlySet<string> = new Set(['gap', 'omission', 'regression']);
	/** What Lyriks checked, summed up first (ac-evo-form-step-note); a line opens its section in the details. */
	const note = $derived(
		verificationNote({
			sections: sections.map((s) => ({ key: s.category.key, title: s.category.title, number: s.number, count: s.items.length, open: s.items.filter((l) => !reading(l).resolved).length })),
			corrections: corrections.length,
			guideNumber,
			// What the report found, settled or not: a step done stays in the note, checked (ac-evo-form-step-note).
			found: {
				gaps: own.filter((l) => FOUND_GAPS.has(reading(l).category.key)).length,
				additions: own.filter((l) => reading(l).category.key === 'addition').length
			},
			movedOn: dossier.stage === 'acceptance' || dossier.stage === 'delivered' || dossier.status === 'closed'
		})
	);
	const specChanges = $derived(own.filter((l) => reading(l).specChange));
	const reopenFor = $derived(specChanges.filter((l) => local[l.id] === 'modif'));
	const projectName = $derived((page.data as { projectName?: string }).projectName ?? projectId);
	const prompt = $derived(
		fixPrompt(
			{ key, title: dossier.title, projectId, projectName, requestId: dossier.id, specVersion: version },
			corrections.map((l) => ({ label: labels.get(l.id) ?? l.id, fix: reading(l).fix, where: whereOf(l) })),
			settled.map((l) => labels.get(l.id) ?? l.id),
			instruction
		)
	);

	/** The executive summary opens again on each visit; a link to one line opens the details on it. */
	const place = parsePlace(page.url.searchParams.get(PLACE_PARAM));
	let tab = $state<'sum' | 'det'>(place?.kind === 'line' ? 'det' : 'sum');
	let openLine = $state<string | null>(place?.kind === 'line' ? place.id : null);
	const domIdOf = (id: string) => placeElementId({ kind: 'line', id });
	// A place opened on one line (a link the AI handed) unfolds the details on it, this step already open or not (ac-evo-live-guide).
	$effect(() => {
		const line = highlighted ? own.find((l) => domIdOf(l.id) === highlighted) : undefined;
		if (!line) return;
		untrack(() => {
			tab = 'det';
			openLine = line.id;
		});
	});

	/** The score counts up as the verification opens, the way the design reveals it. */
	let countUp = $state(0);
	onMount(() => {
		const timer = setInterval(() => {
			countUp = Math.min(100, countUp + 4);
			if (countUp >= 100) clearInterval(timer);
		}, 28);
		return () => clearInterval(timer);
	});

	function toDetails(target: string) {
		tab = 'det';
		scrollToBlock(target);
	}
	/** One line open at a time: opening one folds the one before and keeps the new one in view. */
	function toggle(id: string) {
		const before = openLine;
		openLine = openLine === id ? null : id;
		if (openLine) scrollToBlock(domIdOf(id), before ? domIdOf(before) : null);
	}

	/** A decision on a line, read on the line at once; one the server refuses puts the line back as it stood. */
	const decide = (line: Line, decision: string) =>
		send({ [patchKey.reportLine(line.id)]: { kind: 'line', decision } }, [{ op: 'decide_line', lineId: line.id, decision }], `your opinion on ${labels.get(line.id) ?? 'the line'}`);
	async function pick(line: Line, choice: Choice) {
		const category = categoryOf(line.verdict).key;
		if (reading(line).choice === choice) return;
		const decision = decisionOf(category, choice);
		const before = local[line.id];
		const restore = () => (local = before === undefined ? Object.fromEntries(Object.entries(local).filter(([id]) => id !== line.id)) : { ...local, [line.id]: before });
		if (decision === null) {
			local = { ...local, [line.id]: choice };
			// Still to change, in the code or in the spec: a ruling that settled the line is taken back.
			if (category !== 'compliant' && line.decision !== 'undecided' && line.decision !== 'invalidated' && !(await decide(line, 'undecided'))) restore();
			return;
		}
		const { [line.id]: _dropped, ...rest } = local;
		local = rest;
		// A gap nobody decided already waits for the code: fixing it needs no record.
		const same = line.decision === decision || (decision === 'invalidated' && line.decision === 'undecided');
		if (!same && !(await decide(line, decision))) restore();
	}

	async function copyPrompt(thenFollow: boolean) {
		try {
			await navigator.clipboard.writeText(prompt);
			copied = true;
			pushToast({ level: 'success', message: thenFollow ? 'Fix prompt copied: Lyriks re-checks as the index syncs' : 'Fix prompt copied' });
			if (thenFollow) onDevelopment();
		} catch {
			pushToast({ level: 'error', message: 'The clipboard is not available here.' });
		}
	}

	async function reopenSpec() {
		const next = version + 1;
		// The request goes back to specification, its technical spec to validate again: the page reads it there at once.
		if (await send({ [patchKey.stage]: { kind: 'stage', stage: 'specification', step: 'technical_spec' } }, [{ op: 'rebrief' }], `the reopening of the specification for revision v${next}`))
			pushToast({ level: 'success', message: `Spec reopened: version ${next} is frozen after the impact analysis` });
	}
	/** Rerunning the impact analysis computes a new reading: the button says it runs until the server answers, nothing else waits on it. */
	let rerunning = $state(false);
	async function rerunImpact() {
		rerunning = true;
		try {
			if (await send({}, [{ op: 'run_coherence' }], 'the rerun of the impact analysis')) pushToast({ level: 'success', message: 'Impact analysis rerun on the amended spec' });
		} finally {
			rerunning = false;
		}
	}

	/* ───── How the request finishes: acceptance testing, its approval, then closing it ───── */
	const approval = $derived(dossier.path.find((s) => s.step === 'approval')?.validation ?? null);
	const awaited = $derived((approval?.expected ?? []).filter((id) => !approval?.given.includes(id) && !approval?.gone.includes(id)));
	const mine = $derived(approval?.given.includes(actorId) ?? false);
	/** My validation is the last one the approval waits for. */
	const mineCompletes = $derived(awaited.every((id) => id === actorId));
	const nameOf = (id: string) => personName(id, members);
	const approvedBy = $derived((approval?.given ?? []).map(nameOf).join(', '));
	const lifecycle = $derived.by((): { text: string; label: string; next: boolean } | null => {
		if (!canEdit || dossier.status !== 'open') return null;
		if (dossier.stage === 'implementation')
			return dossier.gate.ok ? { text: 'Every requirement is settled: the report can be closed.', label: 'Start acceptance testing →', next: true } : null;
		if (dossier.stage !== 'acceptance') return null;
		if (approval?.validated)
			return dossier.gate.ok ? { text: 'Approved: the evolution can be closed.', label: 'Approve the evolution →', next: true } : { text: dossier.gate.reason ?? '', label: 'Approve the evolution →', next: false };
		if (mine) return { text: `Waiting for ${awaited.map(nameOf).join(', ')} to approve.`, label: 'Approve the evolution →', next: false };
		return { text: 'Walk the change in acceptance testing, then approve it.', label: 'Approve the evolution →', next: true };
	});

	/** What happens next until the change is live, once nothing is left open (ac-evo-verd-next-steps). */
	const nextSteps = $derived(
		nextStepsOf({
			stage: dossier.stage,
			status: dossier.status,
			gateOk: dossier.gate.ok && allGreen,
			awaited: awaited.map(nameOf),
			approvedBy: (approval?.given ?? []).map(nameOf),
			code: dossier.code,
			closedAt: dossier.deployment?.declaredAt ?? null,
			landed: closing ? { changes: changesSummary(closing.changes), version: closing.version, specHref: closing.specHref, check: closing.landed } : null,
			heldEntries: dossier.heldEntries ?? 0,
			mcpUrl: mcpEndpointFor(page.url.origin)
		})
	);
	const now = $derived(stepNow(nextSteps));
	/** Where a deployment branch is named, only the merge declares the change live (ac-evo-branch-merge). */
	const canAct = $derived(canEdit && dossier.status === 'open' && (dossier.stage === 'delivered' ? !dossier.code : lifecycle?.next === true));
	const act = (step: NextStepId) => (step === 'live' ? closeEvolution() : moveOn());

	/**
	 * The way on from the report, read at once: into acceptance testing, then the
	 * approval, the reader's own and the crossing it completes sent as one save.
	 */
	async function moveOn() {
		if (dossier.stage === 'implementation') {
			if (await send({ [patchKey.stage]: { kind: 'stage', stage: 'acceptance' } }, [{ op: 'cross_stage' }], 'the move to acceptance testing'))
				pushToast({ level: 'success', message: 'Verification closed: the evolution moves to acceptance testing' });
			return;
		}
		const approving = !approval?.validated && !mine;
		const crossing = !approving || mineCompletes;
		const patches: Patches = {
			...(approving ? { [patchKey.step('approval')]: { kind: 'verdict', verdict: { act: 'validate' } } } : {}),
			...(crossing ? { [patchKey.stage]: { kind: 'stage', stage: 'delivered' } } : {})
		};
		const ops = [...(approving ? [{ op: 'validate_step', step: 'approval' }] : []), ...(crossing ? [{ op: 'cross_stage' }] : [])];
		if (!(await send(patches, ops, 'your approval'))) return;
		pushToast({ level: 'success', message: crossing ? 'Approved: the evolution can be closed' : 'Approval recorded: the others named on it are waited on' });
	}
	async function closeEvolution() {
		const at = new Date().toISOString();
		if (await send({ [patchKey.status]: { kind: 'status', status: 'closed', reason: '', by: actorId, at } }, [{ op: 'declare_deployment' }], `the closing of ${key}`))
			pushToast({ level: 'success', message: `Evolution ${key} closed` });
	}

	/** A long label wraps on a phone instead of running off the screen. */
	const WRAP = 'max-w-full py-2 whitespace-normal!';
	const STANDING: Record<string, string> = { implementation: 'ready for acceptance testing', acceptance: 'in acceptance testing', delivered: 'approved' };
	const verdict = $derived(
		allGreen ? `✓ 100% compliant · ${dossier.status === 'closed' ? 'live' : (STANDING[dossier.stage] ?? 'ready for acceptance testing')}` : `Implemented at ${score} % · ${open} open point(s)`
	);
	const deferred = $derived(asked.filter((l) => reading(l).deferred).length);
	const sentence = $derived(
		allGreen
			? `${deferred > 0 ? `All requirements are settled, ${deferred} deferred to a future evolution, and` : 'All requirements are compliant and'} no gap remains open.${now ? ` Next: ${now.title.toLowerCase()}, as explained below.` : ''}`
			: `${settled.length} of ${asked.length} requirements are ${deferred > 0 ? `settled, ${deferred} deferred to a future evolution` : 'compliant'}. ${open} point(s) remain to be addressed: fix them with your LLM, or say what should change in the spec.`
	);
</script>

{#if !ready}
	<ImplementationWaitingCard title="The verification will be ready at the end of implementation" text={emptyMessage}>
		{#snippet actions()}
			<button type="button" class={SECONDARY_48} onclick={onDevelopment}>Go to Implementation</button>
		{/snippet}
	</ImplementationWaitingCard>
{:else}
	<div class="flex flex-col gap-6">
		<EditorialNote {note} readKey={noteReadKey(dossier.id, 'final_report', note)} onGo={toDetails} />
		<EvoSegmented
			id="rep-tabs"
			tabs
			label="Verification views"
			segments={[
				{ id: 'sum', label: 'Executive summary' },
				{ id: 'det', label: 'In details' }
			]}
			active={tab}
			onSelect={(id) => (tab = id === 'det' ? 'det' : 'sum')}
		/>
		{#if tab === 'sum'}
			<VerificationSummary
				shown={Math.round((score * countUp) / 100)}
				{allGreen}
				{verdict}
				{sentence}
				tiles={sections.map((s) => ({ category: s.category, count: s.items.length }))}
				hasCorrections={corrections.length > 0}
				onSection={(c: Category) => toDetails(`sec-${c.key}`)}
				onGuide={() => toDetails('guider')}
				onDetails={() => toDetails('rep-tabs')}
				next={nextSteps}
				{canAct}
				onAct={act}
				mayHandOff={mayEdit}
			/>
		{:else}
			<div class="flex flex-col gap-6">
				{#each sections as s (s.category.key)}
					{#if s.items.length > 0}
						<section id="sec-{s.category.key}" class="flex scroll-mt-[140px] flex-col gap-4 rounded-evo-card border border-transparent bg-surface p-6" aria-label={s.category.title}>
							<div class="flex flex-wrap items-center gap-3">
								<span class={numberPill(false)}>{s.number}</span>
								<h3 class="m-0 text-xl leading-[1.2] font-bold tracking-[-0.02em] {s.category.text}">{s.category.title} · {s.items.length}</h3>
								<span class="text-sm text-ink-3">{s.category.description}</span>
							</div>
							{#each s.items as line (line.id)}
								<VerificationLine
										{projectId}
										{line}
										label={labels.get(line.id) ?? ''}
										reading={reading(line)}
										carriedBy={dossier.deferredCarriers?.[line.id]}
										domId={domIdOf(line.id)}
										open={openLine === line.id}
										{editable}
										marked={highlighted === domIdOf(line.id)}
										suggestion={suggestions[line.id] ?? ''}
										onToggle={() => toggle(line.id)}
										onPick={(choice) => pick(line, choice)}
										onToggleIncluded={() => (excluded = { ...excluded, [line.id]: !excluded[line.id] })}
										onSuggest={(text) => (suggestions = { ...suggestions, [line.id]: text })}
									/>
							{/each}
						</section>
					{/if}
				{/each}

				<!-- What goes back to the LLM, drafted from the lines in the correction. -->
				<section id="guider" class="flex scroll-mt-[140px] flex-col gap-4 rounded-evo-card border border-transparent bg-surface p-6" aria-label="LLM instructions">
					<div class="flex flex-wrap items-center gap-3"><span class={numberPill(false)}>{guideNumber}</span><h3 class={SECTION_TITLE}>LLM instructions</h3></div>
					<div class="flex flex-col gap-1">
						<span class="text-base font-bold text-evo-ink">{corrections.length > 0 ? `${corrections.length} correction(s) to send` : 'Nothing to fix for now'}</span>
						<span class="text-sm text-ink-2">Lyriks drafts the instruction from the selected gaps. Uncheck what you don’t want to fix, or add your own instruction.</span>
					</div>
					{#if corrections.length > 0}
						<div class="flex flex-col gap-3.5">
							<pre class="m-0 rounded-evo-btn bg-evo-ink px-5 py-[18px] font-evo-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap wrap-anywhere text-paper">{prompt}</pre>
							<label for="consigne" class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">Add an instruction for the LLM</label>
							<textarea
								id="consigne"
								rows="3"
								value={instruction}
								placeholder="E.g.: keep the rate cache, but document it."
								class="{TEXTAREA} px-3.5 py-3 text-sm"
								oninput={(e) => (instruction = e.currentTarget.value)}
							></textarea>
							<div class="flex flex-wrap justify-end gap-2.5">
								<button type="button" class={SECONDARY_44} onclick={() => copyPrompt(false)}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
								<button type="button" class="{PRIMARY_44} {WRAP}" onclick={() => copyPrompt(true)}>Copy for my LLM and follow the check</button>
							</div>
						</div>
					{:else}
						<span class="text-[0.8125rem] text-ink-3 italic">No pending corrections.</span>
					{/if}
				</section>

				{#if specChanges.length > 0}
					<!-- What asks the spec to change rather than the code: the reopening of the request, or the impact analysis run again. -->
					<section class="flex flex-col gap-4 rounded-evo-card border border-transparent bg-orange-tint p-6 shadow-[inset_6px_0_0_var(--color-orange)]" aria-label="Requested specification changes">
						<span class="font-evo-mono text-xs tracking-[0.08em] text-orange-ink">REQUESTED SPECIFICATION CHANGES · {specChanges.length}</span>
						{#each specChanges as l (l.id)}
							{@const parts = requirementParts(l.requirement)}
							<div class="flex flex-wrap items-baseline gap-3 border-b border-line py-2.5">
								<span class="w-9 font-evo-mono text-xs text-ink-3">{labels.get(l.id)}</span>
								<span class="flex-[1_1_260px] font-bold text-evo-ink">{parts.title}</span>
								<span class="flex-[1_1_260px] font-evo-mono text-xs text-ink-3">{parts.path}</span>
							</div>
						{/each}
						{#if reopenFor.length > 0}
							<p class="m-0 text-sm leading-[1.55] text-evo-ink-2">
								Spec {key} will move to <b>v{version + 1}</b>. The specification reopens for changes: the technical spec and the approval go back to validation, and Lyriks reruns
								the impact analysis before any code fix.
							</p>
						{:else}
							<p class="m-0 text-sm leading-[1.55] text-evo-ink-2">
								What the code added is written into spec {key} when the evolution is closed. Lyriks reruns the impact analysis on the amended spec before the verification
								closes.
							</p>
						{/if}
						{#if editable}
							<div class="flex justify-end">
								{#if reopenFor.length > 0}
									<button type="button" class="{PRIMARY_44} {WRAP}" onclick={reopenSpec}>Reopen the spec for revision v{version + 1}</button>
								{:else}
									<!-- A computation, not a routine act: it says it runs, here only, until the server answers. -->
									<button type="button" class={PRIMARY_44} disabled={rerunning} aria-busy={rerunning} onclick={rerunImpact}>
										{#if rerunning}<span class="animate-lk-spin size-3.5 flex-none rounded-full border-2 border-paper/40 border-t-paper" aria-hidden="true"></span>Rerunning the impact analysis…{:else}Rerun the impact analysis{/if}
									</button>
								{/if}
							</div>
						{/if}
					</section>
				{/if}

				{#if dossier.status === 'closed'}
					<div class={NEXT_BAND}>
						<span class="flex flex-[1_1_320px] flex-col gap-0.5">
							<span class={NEXT_BAND_TEXT}>Evolution {key} closed</span>
							<span class="text-[0.8125rem] text-ink-2">The report is archived and the spec updated as the reference for the existing system.</span>
						</span>
						<button type="button" class="{PRIMARY_44} disabled:opacity-100" disabled>Closed ✓</button>
					</div>
					{#if closing}
						<ClosingBlock {closing} canEdit={mayEdit} {actorId} {members} {onDecisionLog} />
					{/if}
				{:else if dossier.stage === 'delivered'}
					<!-- Approved: closing declares it live and makes the spec the reference (declare_deployment closes the request). -->
					<PageFoot>
						<div class={NEXT_BAND}>
							<span class="flex flex-[1_1_320px] flex-col gap-0.5">
								<span class={NEXT_BAND_TEXT}>The evolution complies with the spec</span>
								<span class="text-[0.8125rem] text-ink-2">{dossier.iteration} cycle(s){approvedBy ? `, approved by ${approvedBy}` : ''}.</span>
							</span>
							{#if dossier.code}
								<!-- With a deployment branch, the merge declares the change live: never closed by hand (ac-evo-branch-merge). -->
								<span class="text-[0.8125rem] text-ink-2">Merge {dossier.code.branch ?? dossier.code.expectedBranch} into {dossier.code.deploymentBranch}, then report the merge: the executive summary gives the commands.</span>
							{:else if canEdit}<button type="button" class={PRIMARY_44} onclick={closeEvolution}>Close the evolution</button>{/if}
						</div>
					</PageFoot>
				{:else if lifecycle}
					<!-- The design ends on the report: the crossings into acceptance testing and out of it sit at the page's foot. -->
					<PageFoot class="flex flex-wrap items-center justify-between gap-2.5">
						<span class="text-sm text-ink-2">{lifecycle.text}</span>
						<button type="button" class="{primary48(lifecycle.next)} {WRAP}" onclick={moveOn}>{lifecycle.label}</button>
					</PageFoot>
				{/if}
			</div>
		{/if}
	</div>
{/if}
