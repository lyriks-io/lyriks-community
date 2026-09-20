<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import {
		REQUEST_ORIGINS,
		REQUEST_STAGES,
		STAGE_ORDER,
		acceptanceDebt,
		canCloseRequest,
		canCloseReport,
		canCrossToImplementation,
		nextStage,
		canLeaveCoherence,
		canOpenRequest,
		openWaiver,
		undecidedCount,
		type EvolutionRequest,
		type Guarded,
		type RequestOrigin,
		type RequestStage
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';
	import SpecificationPage from './SpecificationPage.svelte';
	import CoherenceAndImpact from './CoherenceAndImpact.svelte';
	import CodeImpact from './CodeImpact.svelte';
	import ImplementationReport from './ImplementationReport.svelte';
	import AcceptanceNotebook from './AcceptanceNotebook.svelte';
	import DecisionHistory from './DecisionHistory.svelte';
	import ScoresRail from './ScoresRail.svelte';
	import StageGateBar from './StageGateBar.svelte';

	/**
	 * One dossier, one page. The header identifies the request, the rail moves
	 * between the four stages, and the gate at the foot says what it would take to
	 * reach the next one.
	 *
	 * The stages are navigable in any order for READING; only the gate moves the
	 * request, which is what keeps the board and the dossier from ever disagreeing.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		/** Leaf features the request can attach to. */
		leaves: readonly { id: string; name: string }[];
		/** The project evidence register, for the citations a value rests on. */
		sources: readonly { id: string; title: string; url: string; note: string }[];
		/** What the sections a capability block points at hold today, by path. */
		held: Record<string, { summary: string; names: string[] }>;
		/** Per-feature code coverage, for the code briefing. */
		coverage: Record<string, import('$application/use-cases/load-implementation-coverage').FeatureImplementationCoverage>;
		canEdit: boolean;
		onBack: () => void;
		onOpenCanonical: (section: string, path: string) => void;
		onFixNow: (target: string) => void;
	}
	let {
		store,
		request,
		leaves,
		sources,
		held,
		coverage,
		canEdit,
		onBack,
		onOpenCanonical,
		onFixNow
	}: Props = $props();

	type StageTab =
		| 'specification'
		| 'coherence'
		| 'code'
		| 'implementation'
		| 'acceptance'
		| 'history';
	let tab = $state<StageTab>('specification');

	const stageLabel = (stage: RequestStage) =>
		REQUEST_STAGES.find((s) => s.code === stage)?.label ?? stage;
	const isDraft = $derived(request.stage === 'draft');
	const standing = $derived(openWaiver(request));
	const maturity = $derived(store.maturity);
	const coherence = $derived(store.coherenceOf(request));
	const readiness = $derived(store.readinessOf(request));

	/**
	 * A tab the request has not reached is always readable, and says what would
	 * open it instead of showing an empty page. The condition is the gate's own
	 * refusal, in the specification's words.
	 */
	const notReached = $derived.by<{ label: string; condition: string } | null>(() => {
		const tabStage = tab === 'code' || tab === 'history' ? null : tab;
		if (!tabStage || STAGE_ORDER.indexOf(tabStage) <= STAGE_ORDER.indexOf(request.stage)) return null;
		const conditionOf = (stage: RequestStage): string => {
			if (stage === 'coherence') return 'Opened by sending the request to Challenge from Specify.';
			if (stage === 'implementation') {
				const g = canCrossToImplementation(request, maturity.criticalEmptyCount);
				return g.ok
					? 'Opens when the request is crossed into Verify: nothing blocks it now.'
					: `Opens when no critical field is empty and no blocking finding is undecided. Today: ${g.reason}`;
			}
			if (stage === 'acceptance') {
				const g = canCloseReport(request);
				return g.ok
					? 'Opens when the request is sent to Accept: the report is settled.'
					: `Opens when the implementation report carries no undecided line and no undecided regression. Today: ${g.reason}`;
			}
			return '';
		};
		return { label: stageLabel(tabStage), condition: conditionOf(tabStage) };
	});

	/**
	 * The gate the REQUEST is standing at, which is not the same thing as the tab
	 * being read.
	 *
	 * The tabs are navigable in any order for reading, so a reader can be looking
	 * at the implementation report while the request has not left coherence. The
	 * bar used to describe the tab and then move the request, which meant the
	 * button said one stage and did another; on a request two tabs behind, it
	 * announced acceptance and crossed into implementation.
	 */
	const target = $derived(nextStage(request.stage));
	const gate = $derived.by<{ guard: Guarded; label: string } | null>(() => {
		if (target === 'coherence')
			return { guard: { ok: true }, label: 'Send this request to Challenge' };
		if (target === 'implementation')
			return {
				guard: canCrossToImplementation(request, maturity.criticalEmptyCount),
				label: `Cross into Verify and freeze the spec as version ${request.specVersion + 1}: no critical field empty, nothing blocking`
			};
		if (target === 'acceptance')
			return {
				// One rule, one place: the guard that settles the report is the one
				// that opens acceptance.
				guard: canCloseReport(request),
				label: 'Send this request to Accept'
			};
		if (target === 'delivered')
			return {
				guard:
					acceptanceDebt(request) > 0
						? {
								ok: false,
								reason: 'A validated observation has not been folded back into the spec yet.',
								detail:
									'Closing here would leave the specification describing something other than the product that was accepted.'
							}
						: { ok: true },
				label: 'Mark this request delivered'
			};
		return null;
	});

	const navGroups = $derived<SectionNavGroup[]>([
		{
			label: 'The four stages',
			items: [
				{
					id: 'specification',
					label: '1 · Specify',
					hint: 'Any order; amber is a question, not a fault',
					icon: 'file-check',
					count: maturity.criticalEmptyCount
				},
				{
					id: 'coherence',
					label: '2 · Challenge',
					hint: 'Coherence and impact, before a line of code',
					icon: 'target',
					count: request.coherenceFindings.filter((f) => f.published).length
				},
				{
					id: 'implementation',
					label: '3 · Verify',
					hint: 'Five verdicts on what was built',
					icon: 'cpu',
					count: undecidedCount(request)
				},
				{
					id: 'acceptance',
					label: '4 · Accept',
					hint: 'Walk the product',
					icon: 'eye',
					count: request.observations.length
				}
			]
		},
		{
			label: 'Before the code',
			items: [
				{
					id: 'code',
					label: 'Code impact',
					hint: 'Where it lands, before you write',
					icon: 'cpu',
					count: 0
				}
			]
		},
		{
			label: 'The record',
			items: [
				{
					id: 'history',
					label: 'Decision history',
					hint: 'Append-only timeline',
					icon: 'list',
					count: request.history.length
				}
			]
		}
	]);

	const closable = $derived(canCloseRequest(request));
	const openable = $derived(canOpenRequest(request));
</script>

<div class="space-y-4">
	<!-- Header: who the request is, and where it stands. -->
	<header class="rounded-card border border-line bg-surface p-4">
		<div class="flex flex-wrap items-start gap-3">
			<button
				type="button"
				onclick={onBack}
				class="mt-1 shrink-0 rounded p-1 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
				aria-label="Back to the board"
			>
				<Icon name="arrow-left" size={16} />
			</button>
			<div class="min-w-0 flex-1 space-y-2">
				<input
					value={request.title}
					oninput={(e) => store.editRequest(request.id, { title: e.currentTarget.value })}
					placeholder="What is being asked for"
					disabled={!canEdit}
					class="w-full border-0 bg-transparent p-0 text-xl font-bold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
				/>
				<div class="flex flex-wrap items-center gap-2">
					<label class="flex items-center gap-1.5 text-[11px] text-ink-500">
						<span class="font-semibold uppercase tracking-wide text-ink-400">Origin</span>
						<select
							value={request.origin ?? ''}
							onchange={(e) =>
								store.setOrigin(request.id, e.currentTarget.value as RequestOrigin)}
							disabled={!canEdit}
							title="What lets the portfolio be read later: how much of our work comes from customers, support, regulation"
							class="rounded-field border border-line bg-surface px-2 py-1 text-[11px] text-ink-700 outline-none focus:border-brand-400"
						>
							<option value="">Not set</option>
							{#each REQUEST_ORIGINS as o (o.code)}
								<option value={o.code}>{o.label}</option>
							{/each}
						</select>
					</label>
					<!-- What the change touches. Zero or more: naming them is the work the
					     impact report does, not a question asked at the door. -->
					<div class="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
						<span class="font-semibold uppercase tracking-wide text-ink-400">Touches</span>
						{#if request.leafIds.length === 0}
							<span class="text-ink-400">not identified yet</span>
						{:else}
							{#each request.leafIds as leafId (leafId)}
								<span
									class="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] font-medium text-ink-700"
								>
									{leaves.find((l) => l.id === leafId)?.name || leafId}
									{#if canEdit}
										<button
											type="button"
											onclick={() => store.toggleLeaf(request.id, leafId)}
											aria-label="Stop touching this feature"
											class="text-ink-400 hover:text-danger-500"
										>
											<Icon name="x" size={10} />
										</button>
									{/if}
								</span>
							{/each}
						{/if}
						{#if canEdit}
							<select
								value=""
								onchange={(e) => {
									if (e.currentTarget.value) store.toggleLeaf(request.id, e.currentTarget.value);
									e.currentTarget.value = '';
								}}
								title="Add a feature this change touches"
								class="max-w-48 rounded-field border border-line bg-surface px-2 py-1 text-[11px] text-ink-700 outline-none focus:border-brand-400"
							>
								<option value="">Add a feature…</option>
								{#each leaves.filter((l) => !request.leafIds.includes(l.id)) as leaf (leaf.id)}
									<option value={leaf.id}>{leaf.name || leaf.id}</option>
								{/each}
							</select>
						{/if}
					</div>
					<span
						class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500"
					>
						{stageLabel(request.stage)}
					</span>
					<span class="text-[10px] text-ink-400">iteration {request.iteration}</span>
					{#if !isDraft}
						<ScoresRail
							{store}
							{request}
							{maturity}
							{coherence}
							{readiness}
							openThreads={store.openThreads(request)}
							compact
						/>
					{/if}
					{#if standing}
						<span
							class="inline-flex items-center gap-1 rounded-pill bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700"
							title={standing.reason}
						>
							<Icon name="flag" size={10} /> waiver standing
						</span>
					{/if}
				</div>
			</div>
			<div class="flex shrink-0 flex-wrap items-center gap-2">
				{#if isDraft}
					<Button
						size="sm"
						disabled={!openable.ok}
						title={openable.ok ? 'Give this change its own identity' : openable.reason}
						onclick={() => store.open(request.id)}
					>
						Open the request
					</Button>
				{:else}
					<Button
						variant="outline"
						size="sm"
						disabled={!closable.ok}
						title={closable.ok ? 'Finish this request' : closable.reason}
						onclick={() => store.close(request.id)}
					>
						Close
					</Button>
				{/if}
				<button
					type="button"
					onclick={() => store.remove(request.id)}
					title="Remove the dossier. Every field it wrote into the sections stays exactly as it is."
					class="rounded p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
					aria-label="Delete request"
				>
					<Icon name="x" size={15} />
				</button>
			</div>
		</div>

		{#if isDraft && !openable.ok}
			<p class="mt-3 rounded-field border border-warning-200 bg-warning-50/50 px-3 py-2 text-[11.5px] text-warning-700">
				{openable.reason}
			</p>
		{/if}
	</header>

	{#if !isDraft}
		<SectionNav groups={navGroups} active={tab} onSelect={(id) => (tab = id as StageTab)}>
			<div class="space-y-4">
				{#if notReached}
					<!-- Readable, never empty: the tab says what would open it. -->
					<div class="flex items-start gap-2 rounded-card border border-line bg-surface-sunken/50 px-4 py-3">
						<Icon name="lock" size={14} class="mt-0.5 shrink-0 text-ink-400" />
						<div class="text-xs text-ink-600">
							<p class="font-semibold text-ink-800">
								{notReached.label} is not reached yet. The request is at {stageLabel(request.stage)}.
							</p>
							<p class="mt-0.5">{notReached.condition}</p>
						</div>
					</div>
				{/if}
				{#if tab === 'specification'}
					<SpecificationPage {store} {request} {canEdit} {sources} {held} {onOpenCanonical} />
				{:else if tab === 'coherence'}
					<CoherenceAndImpact {store} {request} {onFixNow} />
				{:else if tab === 'code'}
					<CodeImpact {store} {request} {coverage} {leaves} />
				{:else if tab === 'implementation'}
					<ImplementationReport {store} {request} />
				{:else if tab === 'acceptance'}
					<AcceptanceNotebook {store} {request} />
				{:else}
					<DecisionHistory {request} />
				{/if}

				{#if gate && tab !== 'history'}
					<StageGateBar
						{store}
						{request}
						gate={gate.guard}
						label={gate.label}
						onCross={() => {
							if (target === 'implementation') store.crossToImplementation(request.id);
							else store.advance(request.id);
						}}
					/>
				{/if}
			</div>
		</SectionNav>
	{/if}
</div>
