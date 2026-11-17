<script lang="ts">
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import { tick, untrack } from 'svelte';
	import { promptDialog, pushToast } from '$ui/design-system';
	import { IMPACT_SECTIONS, STAGE_ORDER, impactRows, type ImpactHypothesis } from '$domain/evolution';
	import type { DossierCounts, ImpactPart } from '$lib/server/evolution-view.server';
	import { applyEvolution } from './reading-api';
	import EvoSegmented from './EvoSegmented.svelte';
	import SimulationAnalysing from './SimulationAnalysing.svelte';
	import SimulationSummary from './SimulationSummary.svelte';
	import SimulationImpactCard, { type SimulationItem, type SimulationPoint } from './SimulationImpactCard.svelte';
	import SimulationCrossRow from './SimulationCrossRow.svelte';
	import SimulationProblemSheet from './SimulationProblemSheet.svelte';
	import EditorialNote from './EditorialNote.svelte';
	import HealthAfterCard from './HealthAfterCard.svelte';
	import { OptimisticActs } from './optimistic-acts.svelte';
	import { noteReadKey, simulationNote } from './editorial-note';
	import { scrollToBlock } from './evo-scroll';
	import { FOOT_BAR, PRIMARY_48, SECONDARY_44, SECTION_TITLE, numberPill, primary48 } from './evo-look';
	import {
		awaitsDecision,
		crossWords,
		executiveSummary,
		gradedItems,
		impactItems,
		impactZones,
		nextDecision,
		simulationTop,
		simulationAreas,
		stepOfStage,
		type SimulationGrade
	} from './impact-board';

	/**
	 * The Simulation step (the design's step 4): what implementing the request
	 * would do to the product as it stands, and to the other evolutions in
	 * progress, read by the platform on its own. Nobody validates the reading
	 * itself; a person decides what asks a decision, and leaving the step freezes
	 * a version.
	 *
	 * ONE reading, derived from what the request proposes (d17092da): every
	 * touched feature carries the verb of the draft that stands for it. Each thing
	 * that moves is graded the design's way from its docking: a major impact
	 * blocks or has something to decide, a minor one has nothing to attach it to
	 * yet, the rest is compatible.
	 */
	interface Props {
		projectId: string;
		dossier: DossierCounts;
		impacts: Record<ImpactHypothesis, ImpactPart['impact']>;
		/** The verb each touched feature carries, and what the request does overall. */
		proposes: { byLeaf: Record<string, ImpactHypothesis>; main: ImpactHypothesis };
		/** Whether the person may decide the findings: an editor, on an open request not frozen. */
		canEdit: boolean;
		onFixNow: (target: string) => void;
		/** The roster, so a person is named, never shown by id (ac-evo-form-names). */
		members?: readonly { id: string; name: string }[];
		/** Who reads the page, so their own decision reads "You validated". */
		actorId?: string;
		/** Crosses into the implementation, freezing the version: offered once the gate is met. */
		onStart?: () => void;
		/** Opens the Implementation step without crossing. */
		onNext?: () => void;
	}
	let { projectId, dossier, impacts, proposes, canEdit, onFixNow, members = [], actorId = '', onStart, onNext }: Props = $props();

	const HYPOTHESES: readonly ImpactHypothesis[] = ['add', 'change', 'remove'];
	const ran = $derived(HYPOTHESES.some((h) => impacts[h].status === 'ready'));

	/** An option just validated (a risk accepted) or taken back, read at once before the server has answered (ac-evo-form-edit-optimistic). */
	const decided = new OptimisticActs<{ risk: { by: string; at: string; reason: string } | null }>();
	const items = $derived(
		impactItems<SimulationPoint>(impactRows(impacts, proposes), dossier.docking.points).map((item) => {
			const sent = decided.of(item.nodeId);
			return item.point && sent ? { ...item, point: { ...item.point, risk: sent.risk } } : item;
		})
	);
	function decideOptimistically(item: SimulationItem, risk: { by: string; at: string; reason: string } | null, op: Record<string, unknown>): Promise<boolean> {
		const save = () => applyEvolution(projectId, [op], { what: risk ? `the option chosen for ${item.code}` : `reopening ${item.code}` });
		return decided.run(item.nodeId, { risk }, save, () => dossier.docking.points);
	}
	const graded = $derived(gradedItems(items));
	const all = $derived([...graded.major, ...graded.minor, ...graded.compatible]);
	const areas = $derived(simulationAreas(impactZones(items, IMPACT_SECTIONS)));
	const areaOf = (item: SimulationItem) => IMPACT_SECTIONS.find((s) => s.code === item.section)?.label ?? 'Elsewhere';
	/** The next best action: the first major impact still to decide, the only violet decision. */
	const nba = $derived(nextDecision(graded.major));
	const allDecided = $derived(graded.major.every((m) => !!m.point?.risk));

	const hereKey = $derived(dossier.key ?? dossier.title);
	const cross = $derived(dossier.crossEvolutions.map((c) => ({ ...c, key: c.key ?? c.title })));
	const words = $derived(new Map(cross.map((c) => [c.id, crossWords(hereKey, c)])));

	/** Past the Simulation already: the way on only opens the next step. */
	const crossed = $derived(STAGE_ORDER.indexOf(dossier.stage) > STAGE_ORDER.indexOf('coherence'));
	const gateOpen = $derived(dossier.stage === 'coherence' && dossier.gate.ok);
	/** The status the summary reads: nothing is left to decide and the way into the implementation is open. */
	const ready = $derived(crossed || (gateOpen && allDecided));
	/** The top reads the evolutions in progress too, never less than the details (ac-evo-sim-top-cross). */
	const top = $derived(simulationTop({ ready, decided: allDecided, cross }));
	/** Whether this reader may cross: the gate is met and they edit the request. */
	const startable = $derived(gateOpen && canEdit);
	/** What still holds the crossing, said beside the way on so the request never stalls silently. */
	const holding = $derived(dossier.stage === 'coherence' && !dossier.gate.ok ? dossier.gate.reason : null);

	const paragraphs = $derived(
		executiveSummary({
			key: hereKey,
			leaves: dossier.leaves,
			total: items.length,
			compatible: graded.compatible.length,
			minor: graded.minor.length,
			majors: graded.major.map((m) => ({ label: m.label, decided: !!m.point?.risk })),
			cross
		})
	);
	const decisionsMade = $derived(
		graded.major.length === 0
			? 'Nothing needs a decision.'
			: graded.major.length === 1
				? 'The decision is made.'
				: graded.major.length === 2
					? 'Both decisions are made.'
					: `All ${graded.major.length} decisions are made.`
	);

	let tab = $state<'sum' | 'det'>('sum');
	/** One card open at a time, the first major impact on arrival. */
	let open = $state<string | null>(untrack(() => graded.major[0]?.nodeId ?? graded.minor[0]?.nodeId ?? null));
	let crossOpen = $state<string | null>(null);
	let deciding = $state<Record<string, boolean>>({});
	let sheet = $state<string | null>(null);
	const sheetItem = $derived(sheet ? (all.find((i) => i.nodeId === sheet) ?? null) : null);
	const findingOf = (item: SimulationItem) => dossier.coherence.findings.find((f) => f.id === item.point?.findingId) ?? null;
	const domOf = (nodeId: string | null) => {
		const item = nodeId ? all.find((i) => i.nodeId === nodeId) : null;
		return item ? `sim-${item.code}` : null;
	};

	/** Opening a card collapses the one open before it, and keeps the clicked one in view. */
	function toggle(item: SimulationItem) {
		const previous = open;
		open = open === item.nodeId ? null : item.nodeId;
		if (open) scrollToBlock(`sim-${item.code}`, previous === item.nodeId ? null : domOf(previous));
	}
	async function showItem(nodeId: string, previous: string | null = null) {
		tab = 'det';
		open = nodeId;
		await tick();
		const id = domOf(nodeId);
		if (id) scrollToBlock(id, domOf(previous));
	}
	function toggleCross(id: string) {
		const previous = crossOpen;
		crossOpen = previous === id ? null : id;
		if (crossOpen) scrollToBlock(`xe-${id}`, previous ? `xe-${previous}` : null);
	}
	async function showCross(id: string, section: boolean) {
		tab = 'det';
		crossOpen = id;
		await tick();
		scrollToBlock(section ? 'xevo' : `xe-${id}`);
	}
	function seeDetails() {
		tab = 'det';
		scrollToBlock('imp-tabs');
	}
	/** The way on: the crossing that freezes the version once the gate is met, the next step otherwise. */
	function goOn() {
		if (startable && onStart) onStart();
		else onNext?.();
	}

	/** Where the person goes once a major impact is decided: the next one to decide, then the minor ones, then the evolutions in progress. */
	function nextAfter(item: SimulationItem): { label: string; go: () => void } | null {
		const at = graded.major.findIndex((m) => m.nodeId === item.nodeId);
		const following = [...graded.major.slice(at + 1), ...graded.major.slice(0, at)].find(awaitsDecision);
		if (following) return { label: `Next impact: ${following.label} →`, go: () => showItem(following.nodeId, item.nodeId) };
		const minor = graded.minor[0];
		if (minor) return { label: 'Next: review the minor impacts →', go: () => showItem(minor.nodeId, item.nodeId) };
		if (cross.length > 0) return { label: 'Next: in-progress evolutions →', go: () => scrollToBlock('xevo', domOf(item.nodeId)) };
		return onNext ? { label: 'Go to Implementation →', go: goOn } : null;
	}

	/** A finding accepted as a known risk needs a reason, kept on the request with the person's name. */
	async function acceptRisk(item: SimulationItem, letter: string) {
		const findingId = item.point?.findingId;
		if (!findingId) return;
		const reason = await promptDialog({
			title: 'Accept this as a known risk?',
			placeholder: 'Why it is acceptable (kept on the request, with your name)',
			confirmLabel: 'Accept the risk'
		});
		if (reason === null || reason.trim() === '') return;
		const risk = { by: actorId, at: new Date().toISOString(), reason };
		// The choice shows on the item itself, so it raises no message (criterion 8b431894).
		await decideOptimistically(item, risk, { op: 'decide_finding', requestId: dossier.id, findingId, decision: 'accept_risk', reason });
	}
	async function takeBack(item: SimulationItem) {
		const findingId = item.point?.findingId;
		if (!findingId) return;
		await decideOptimistically(item, null, { op: 'decide_finding', requestId: dossier.id, findingId, decision: 'reopen' });
	}

	// Said once, when the platform finishes reading the change while the page is open.
	let readBefore = untrack(() => ran);
	$effect(() => {
		if (ran && !readBefore) pushToast({ level: 'success', message: `Analysis complete: ${items.length} ${items.length === 1 ? 'item' : 'items'} of the existing system compared` });
		readBefore = ran;
	});
	// Said once, when the last decision opens the way into the implementation.
	let readyBefore = untrack(() => top.implementable);
	$effect(() => {
		if (top.implementable && !readyBefore && !crossed) pushToast({ level: 'success', message: 'All lights are green: the evolution can be implemented' });
		readyBefore = top.implementable;
	});

	const SECTIONS: readonly { grade: SimulationGrade; id: string; label: string; title: string; tone: string }[] = [
		{ grade: 'major', id: 'majeurs', label: 'Major impacts', title: 'Major impacts', tone: 'text-red-ink' },
		{ grade: 'minor', id: 'mineurs', label: 'Minor impacts', title: 'Minor impacts', tone: 'text-orange-ink' },
		{ grade: 'compatible', id: 'compatibles', label: 'Compatible items', title: 'Compatible items', tone: 'text-green-ink' }
	];
	/** The sections the details show, numbered "step.section" in the order they appear. */
	const shownSections = $derived([...SECTIONS.filter((s) => graded[s.grade].length > 0).map((s) => s.grade as string), ...(cross.length > 0 ? ['cross'] : [])]);
	const numberOf = (section: string) => `4.${shownSections.indexOf(section) + 1}`;

	/** What Lyriks read of the change, summed up first (ac-evo-form-step-note); a line opens its section in the details. */
	const note = $derived(
		simulationNote({
			key: hereKey,
			major: graded.major.length,
			minor: graded.minor.length,
			compatible: graded.compatible.length,
			conflicts: cross.filter((c) => c.verdict === 'conflict').length,
			overlaps: cross.filter((c) => c.verdict === 'overlap').length,
			notChecked: cross.filter((c) => c.verdict === 'spec_pending').length,
			majorDecided: graded.major.filter((m) => !!m.point?.risk).length,
			movedOn: crossed,
			numberOf: (section) => (shownSections.includes(section) ? numberOf(section) : null)
		})
	);
	async function showSection(target: string) {
		tab = 'det';
		await tick();
		scrollToBlock(target);
	}
</script>

<div class="flex flex-col gap-8 font-evo text-evo-ink">
	{#if !ran && dossier.stage === 'coherence'}
		<!-- Computed on its own at the Impact analysis (ac-evo-imp-7, ac-evo-coh-8), never by a click. -->
		<SimulationAnalysing requestKey={dossier.key} />
	{:else if !ran}
		<p class="text-[0.8125rem] text-ink-3 italic">Computed on its own once the request reaches the Impact analysis.</p>
	{:else}
		<div class="animate-lk-in flex flex-col gap-8">
			<EditorialNote {note} readKey={noteReadKey(dossier.id, 'impact', note)} onGo={(target) => void showSection(target)} />
			{#if dossier.coherence.health}
				<!-- What leaves, stays and comes on Project health with the change (ac-evo-coh-after). -->
				<HealthAfterCard health={dossier.coherence.health} />
			{/if}
			{#if onStart && startable && top.green}
				<div class="flex flex-wrap items-center justify-between gap-4 rounded-evo-card bg-green-tint px-6 py-5 text-ink shadow-[inset_6px_0_0_var(--color-green)]">
					<div class="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
						<span class="text-lg font-bold">All indicators are green</span>
						<span class="text-sm text-ink-2">{decisionsMade} The evolution can be developed, by you or by your LLM: Lyriks will verify the result.</span>
					</div>
					<!-- Leaving freezes the version; the implementation itself starts on its own step (ac-evo-sim-top-cross). -->
					<button type="button" class={PRIMARY_48} onclick={onStart}>Go to Implementation →</button>
				</div>
			{:else if dossier.stage === 'coherence' && allDecided && top.issues.length > 0}
				<!-- The decisions on the product are made, but evolutions in progress touch the same things: said at the top too (ac-evo-sim-top-cross). -->
				<div class="flex flex-wrap items-center justify-between gap-4 rounded-evo-card border border-transparent bg-orange-tint px-6 py-5 shadow-[inset_6px_0_0_var(--color-orange)]">
					<div class="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
						<span class="text-lg font-bold text-ink">{top.issues.length === 1 ? 'An evolution in progress touches the same things' : `${top.issues.length} evolutions in progress touch the same things`}</span>
						<span class="text-sm text-ink-2">{decisionsMade} It {top.issues.some((c) => c.verdict === 'conflict') ? 'conflicts or overlaps' : 'overlaps'} with {top.issues.map((c) => c.key).join(', ')}: agree with their owners before developing.</span>
					</div>
					<button type="button" class={SECONDARY_44} onclick={() => void showCross(top.issues[0].id, true)}>See them →</button>
				</div>
			{/if}

			<EvoSegmented
				id="imp-tabs"
				tabs
				label="Simulation views"
				segments={[
					{ id: 'sum', label: 'Executive summary' },
					{ id: 'det', label: 'In details' }
				]}
				active={tab}
				onSelect={(id) => (tab = id === 'det' ? 'det' : 'sum')}
			/>

			{#if tab === 'sum'}
				<SimulationSummary
					counts={{ major: graded.major.length, minor: graded.minor.length, compatible: graded.compatible.length }}
					ready={top.implementable}
					{paragraphs}
					{areas}
					majors={graded.major.map((m) => ({ code: m.code, label: m.label, area: areaOf(m), decided: !!m.point?.risk }))}
					minors={graded.minor.map((m) => ({ code: m.code, label: m.label, area: areaOf(m), decided: false }))}
					cross={cross.map((c) => ({ id: c.id, key: c.key, title: c.title, verdict: c.verdict, step: stepOfStage(c.stage), sub: words.get(c.id)?.sub ?? '' }))}
					onImpact={(code) => {
						const item = all.find((i) => i.code === code);
						if (item) void showItem(item.nodeId);
					}}
					onCross={(id, section) => void showCross(id, section)}
					onDetails={seeDetails}
				/>
			{:else}
				<div class="flex flex-col gap-5">
					{#each SECTIONS as section (section.grade)}
						{#if graded[section.grade].length > 0}
							<section id={section.id} aria-label={section.label} class="flex flex-col gap-4 rounded-evo-card border border-transparent bg-surface p-6">
								<div class="flex flex-wrap items-center gap-3">
									<span class={numberPill(false)}>{numberOf(section.grade)}</span>
									<h3 class="text-xl leading-[1.2] font-bold tracking-[-0.02em] {section.tone}">{section.title}</h3>
								</div>
								{#each graded[section.grade] as item (item.nodeId)}
									<SimulationImpactCard
										{item}
										open={open === item.nodeId}
										onToggle={() => toggle(item)}
										isNext={nba === item.code}
										deciding={!!deciding[item.nodeId]}
										onDecide={() => (deciding = { ...deciding, [item.nodeId]: true })}
										onAcceptRisk={(letter) => void acceptRisk(item, letter)}
										onTakeBack={() => void takeBack(item)}
										onFix={onFixNow}
										onSheet={() => (sheet = item.nodeId)}
										next={nextAfter(item)}
										{canEdit}
										{actorId}
										{members}
									/>
								{/each}
							</section>
						{/if}
					{/each}

					{#if cross.length > 0}
						<section id="xevo" aria-label="In-progress evolutions" class="flex flex-col gap-4 rounded-evo-card border border-transparent bg-surface p-6">
							<div class="flex flex-wrap items-center gap-3">
								<span class={numberPill(false)}>{numberOf('cross')}</span>
								<h3 class={SECTION_TITLE}>In-progress evolutions</h3>
							</div>
							<div class="overflow-hidden rounded-xl border border-line bg-toner-1">
								{#each cross as entry (entry.id)}
									{@const entryWords = words.get(entry.id)}
									{#if entryWords}
										<SimulationCrossRow cross={entry} words={entryWords} open={crossOpen === entry.id} onToggle={() => toggleCross(entry.id)} />
									{/if}
								{/each}
							</div>
						</section>
					{/if}

					{#if onNext}
						<PageFoot class={holding ? 'flex flex-wrap items-center justify-between gap-2.5' : FOOT_BAR}>
							{#if holding}<span class="text-sm text-ink-2">{holding}</span>{/if}
							<button type="button" class={primary48(crossed || (startable && allDecided))} onclick={goOn}>Go to Implementation →</button>
						</PageFoot>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if sheetItem}
	{@const finding = findingOf(sheetItem)}
	<SimulationProblemSheet item={sheetItem} finding={finding ? { severity: finding.severity, axis: finding.axis } : null} {members} onClose={() => (sheet = null)} />
{/if}
