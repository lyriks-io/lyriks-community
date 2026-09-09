<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';
	import { MATURITY_DIMENSION_KEY, type Gap } from '$domain/coherence';
	import {
		coherenceScoreOf,
		guaranteeOf,
		inferKind,
		KIND_LABEL,
		PROVENANCE_META,
		provenanceOf
	} from '$domain/coherence/incoherence';
	import type { GapProvenance } from '$domain/coherence';
	import { capabilityById, resolveVisibleCapability } from '$ui/shell/capabilities';
	import type { CoherenceStore } from '../draft-store.svelte';

	interface Props {
		store: CoherenceStore;
		onOpenGap: (gap: Gap) => void;
	}
	let { store, onOpenGap }: Props = $props();

	/* ── stat tiles ──────────────────────────────────────────────────────── */
	const coherence = $derived(coherenceScoreOf(store.gaps));
	// Behavior coverage reads the aggregate maturity dimension's score; absent on
	// projects with no authored behavior → we show '—' rather than fabricate 0%.
	const behavDim = $derived(
		store.analysis.dimensions.find((d) => d.key === MATURITY_DIMENSION_KEY)
	);
	const behavCoverage = $derived(behavDim ? behavDim.score : null);

	/* ── gaps bucketed by coherence type ────────────────────────────────── */
	// One gap → at most one bucket, matched in this priority order so the tiles
	// partition the list cleanly. A gap matching none stays out of every bucket
	// (honest: buckets need not sum to the total).
	type BucketKey = 'misalignment' | 'structural' | 'semantic' | 'data' | 'behavioral';
	function bucketOf(gap: Gap): BucketKey | null {
		const guarantee = guaranteeOf(gap.id);
		const kind = inferKind(gap);
		if (guarantee === 'behavior' || gap.sourceStep === 'features') return 'behavioral';
		if (guarantee === 'semantic') return 'semantic';
		if (gap.sourceStep === 'data') return 'data';
		if (kind === 'dangling' || kind === 'orphan' || kind === 'step-without-action' || kind === 'duplicate')
			return 'structural';
		if (kind === 'misalignment' || guarantee === 'formal') return 'misalignment';
		return null;
	}

	const TYPE_TILES: { key: BucketKey; label: string; icon: IconName }[] = [
		{ key: 'misalignment', label: 'Misalignment', icon: 'shield' },
		{ key: 'structural', label: 'Structural coherence', icon: 'layers' },
		{ key: 'semantic', label: 'Semantic coherence', icon: 'sliders' },
		{ key: 'data', label: 'Data coherence', icon: 'database' },
		{ key: 'behavioral', label: 'Behavioral coherence', icon: 'cpu' }
	];

	const typeBuckets = $derived.by(() => {
		// No "points recoverable" figure: what fixing a bucket is worth depends on
		// every other open gap, so the tile says how urgent the bucket is instead.
		const acc = new Map<BucketKey, { count: number; blocking: number; high: number; gaps: Gap[] }>(
			TYPE_TILES.map((t) => [t.key, { count: 0, blocking: 0, high: 0, gaps: [] }])
		);
		for (const g of store.gaps) {
			const k = bucketOf(g);
			if (!k) continue;
			const e = acc.get(k)!;
			e.count += 1;
			if (g.blocking) e.blocking += 1;
			if (g.severity === 'high') e.high += 1;
			e.gaps.push(g);
		}
		return acc;
	});
	const urgency = (b: { blocking: number; high: number }): string =>
		[b.blocking > 0 ? `${b.blocking} blocking` : '', b.high > 0 ? `${b.high} high` : '']
			.filter(Boolean)
			.join(' · ') || 'none blocking';

	/* ── expand one type to see its issues ───────────────────────────────── */
	let openKey = $state<BucketKey | null>(null);
	const toggleOpen = (k: BucketKey) => (openKey = openKey === k ? null : k);
	const openTile = $derived(openKey ? TYPE_TILES.find((t) => t.key === openKey)! : null);
	const openGaps = $derived(openKey ? (typeBuckets.get(openKey)?.gaps ?? []) : []);

	/* Settle with a traced decision (persisted, append-only) */
	// The rationale lives only in this session: acknowledgedGapIds is a bare
	// string[], so persisting the reasoning (or writing a Supervision trace) would
	// need a schema change — out of scope. We never claim it is durably stored.
	// The reason and the author are kept on the coherence section (append-only);
	// the gap leaves the score everywhere and stays readable below, reopenable.
	let resolvingId = $state<string | null>(null);
	let rationaleDraft = $state('');
	let deciding = $state(false);
	const openResolve = (gap: Gap) => {
		resolvingId = resolvingId === gap.id ? null : gap.id;
		rationaleDraft = '';
	};
	const confirmResolve = async (gap: Gap, status: 'accepted_risk' | 'wont_fix') => {
		deciding = true;
		const ok = await store.decideGap(gap, status, rationaleDraft);
		deciding = false;
		if (ok) {
			resolvingId = null;
			rationaleDraft = '';
		}
	};
	let reopeningId = $state<string | null>(null);
	let reopenReason = $state('');
	const confirmReopen = async (gapId: string, title: string) => {
		deciding = true;
		const ok = await store.decideGap({ id: gapId, title }, 'reopened', reopenReason);
		deciding = false;
		if (ok) {
			reopeningId = null;
			reopenReason = '';
		}
	};
	const settled = $derived(store.analysis.settled ?? []);

	/* The card's words: where, who says so, what kind, what to do. */
	const whereOf = (gap: Gap): string => {
		const cap = capabilityById(gap.sourceStep);
		if (!cap) return gap.sourceStep;
		const visible = resolveVisibleCapability(cap.id);
		return visible && visible.id !== cap.id ? `${visible.title} › ${cap.title}` : cap.title;
	};
	const kindLabelOf = (gap: Gap) => gap.kindLabel ?? KIND_LABEL[inferKind(gap)];
	const actionOf = (gap: Gap) => gap.action ?? gap.detail;
	const PROVENANCE_CLS: Record<GapProvenance, string> = {
		declared: 'border-brand-200 bg-brand-50 text-brand-700',
		detected: 'border-line bg-surface-sunken text-ink-500',
		proven: 'border-success-200 bg-success-50 text-success-700',
		reviewed: 'border-info-200 bg-info-50 text-info-600',
		behavior: 'border-warning-200 bg-warning-50 text-warning-700'
	};
	const CHIP = 'inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide';

	const tileActiveCls = 'border-brand-300 bg-brand-50/60 ring-1 ring-brand-200';
	const tileIdleCls = 'border-line bg-surface-sunken/40 hover:bg-surface hover:border-line';
</script>

{#snippet statTile(value: string, label: string, tone: 'success' | 'danger' | 'info')}
	<div class="rounded-lg border border-line bg-surface-sunken/40 px-3 py-2.5">
		<p
			class="text-xl font-bold leading-none {tone === 'success'
				? 'text-success-600'
				: tone === 'danger'
					? 'text-danger-600'
					: 'text-info-600'}"
		>
			{value}
		</p>
		<p class="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">{label}</p>
	</div>
{/snippet}

<div class="space-y-3">
	<!-- 4 headline tiles -->
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
		{@render statTile(String(coherence), 'Score out of 100', coherence >= 60 ? 'success' : 'danger')}
		{@render statTile(String(store.gaps.length), 'Issues to resolve', 'danger')}
		{@render statTile(String(store.blockingCount), 'Blockers', 'danger')}
		{@render statTile(behavCoverage === null ? '-' : `${behavCoverage}%`, 'Behavior coverage', 'info')}
	</div>

	<!-- KPI by type -->
	<div class="space-y-2">
		<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
			KPI by type · click to see the issues
		</p>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
			{#each TYPE_TILES as tile (tile.key)}
				{@const b = typeBuckets.get(tile.key)!}
				{@const good = b.count === 0}
				<button
					type="button"
					aria-pressed={openKey === tile.key}
					onclick={() => toggleOpen(tile.key)}
					class="rounded-lg border p-3 text-left transition-colors {openKey === tile.key
						? tileActiveCls
						: tileIdleCls}"
				>
					<span class="flex items-center justify-between gap-1">
						<span class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
							<Icon name={tile.icon} size={12} />
							{tile.label}
						</span>
						<Icon
							name="chevron-right"
							size={12}
							class="shrink-0 text-ink-300 transition-transform {openKey === tile.key ? 'rotate-90' : ''}"
						/>
					</span>
					<span
						class="mt-2 block text-2xl font-extrabold leading-none {good ? 'text-success-600' : 'text-danger-600'}"
					>
						{b.count}
					</span>
					<span class="mt-1 block text-[10px] font-medium {good ? 'text-success-600' : b.blocking > 0 ? 'text-danger-600' : 'text-warning-600'}">
						{good ? 'no issue' : urgency(b)}
					</span>
				</button>
			{/each}
		</div>

		{#if openTile}
			<div class="rounded-lg border border-line bg-surface p-2.5">
				<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
					{openTile.label}
				</p>
				{#if openGaps.length === 0}
					<p class="py-2 text-center text-[11px] italic text-success-600">No issue in this type.</p>
				{:else}
					<div class="space-y-1.5">
						{#each openGaps as gap (gap.id)}
							<div class="rounded-lg border border-line p-2.5">
								<div class="flex items-start gap-2">
									<span
										class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full {gap.blocking ? 'bg-danger-500' : gap.severity === 'high' ? 'bg-danger-400' : gap.severity === 'medium' ? 'bg-warning-500' : 'bg-ink-300'}"
									></span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-[10px] font-semibold text-ink-400">
											{whereOf(gap)}{#if gap.subject}<span class="mx-1 text-ink-300">›</span><span class="text-ink-600">{gap.subject}</span>{/if}
										</p>
										<div class="mt-0.5 flex flex-wrap items-center gap-1">
											<span class="{CHIP} {PROVENANCE_CLS[provenanceOf(gap)]}" title={PROVENANCE_META[provenanceOf(gap)].means}>{PROVENANCE_META[provenanceOf(gap)].label}</span>
											<span class="{CHIP} border-line bg-surface-sunken text-ink-500">{kindLabelOf(gap)}</span>
											{#if gap.blocking}<span class="{CHIP} border-danger-200 bg-danger-50 text-danger-600">Blocking</span>{/if}
										</div>
										<p class="mt-1 text-[12.5px] font-medium text-ink-800">{gap.title}</p>
										<p class="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-ink-700">
											<Icon name="arrow-right" size={11} class="mt-0.5 shrink-0 text-brand-500" />
											<span>{actionOf(gap)}</span>
										</p>
										{#if gap.detail && gap.detail !== actionOf(gap)}
											<details class="mt-0.5">
												<summary class="cursor-pointer select-none text-[10px] font-semibold text-ink-400 hover:text-ink-700">Why</summary>
												<p class="mt-0.5 text-[11px] leading-snug text-ink-500">{gap.detail}</p>
											</details>
										{/if}
									</div>
									<div class="flex shrink-0 items-center gap-1">
										<button
											type="button"
											onclick={() => onOpenGap(gap)}
											class="inline-flex items-center gap-1 rounded border border-info-200 bg-info-50 px-2 py-1 text-[10.5px] font-semibold text-info-600 hover:bg-info-100"
										>
											<Icon name="target" size={12} /> Locate
										</button>
										{#if !gap.blocking}
											<button
												type="button"
												onclick={() => openResolve(gap)}
												class="rounded border px-2 py-1 text-[10.5px] font-semibold {resolvingId === gap.id
													? 'border-brand-300 bg-brand-50 text-brand-600'
													: 'border-success-200 bg-success-50 text-success-600 hover:bg-success-100'}"
											>
												Settle
											</button>
										{/if}
									</div>
								</div>

								{#if resolvingId === gap.id}
									<!-- A traced decision: kept with the author and the reason, out of the score, reopenable. -->
									<div class="mt-2 space-y-1.5 border-t border-line pt-2">
										<label
											class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400"
											for="coh-fix-{gap.id}"
										>
											<Icon name="pencil" size={11} /> Decision (kept with your name)
										</label>
										<textarea
											id="coh-fix-{gap.id}"
											bind:value={rationaleDraft}
											rows="2"
											placeholder="Why this is acceptable"
											class="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-800 placeholder:text-ink-300 focus:border-brand-300 focus:outline-none"
										></textarea>
										<div class="flex items-center justify-between gap-2">
											<span class="text-[10px] text-ink-400">Takes the gap out of every score. Can be reopened.</span>
											<div class="flex items-center gap-1.5">
												<button
													type="button"
													onclick={() => (resolvingId = null)}
													class="rounded-md px-2 py-1 text-[11px] font-medium text-ink-500 hover:text-ink-800"
												>
													Cancel
												</button>
												<button
													type="button"
													disabled={deciding || !rationaleDraft.trim()}
													onclick={() => confirmResolve(gap, 'wont_fix')}
													class="rounded-md border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-surface-sunken disabled:opacity-40"
												>
													Won't fix
												</button>
												<button
													type="button"
													disabled={deciding || !rationaleDraft.trim()}
													onclick={() => confirmResolve(gap, 'accepted_risk')}
													class="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
												>
													<Icon name="check" size={12} /> Accept the risk
												</button>
											</div>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if settled.length > 0}
		<!-- Out of the score, never out of sight: who decided what, and why. -->
		<div class="rounded-lg border border-line bg-surface-sunken/40 px-3 py-2.5">
			<p class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				<Icon name="file-check" size={12} /> Settled by decision · {settled.length}
			</p>
			<ul class="space-y-1.5">
				{#each settled as s (s.gap.id)}
					<li class="text-[11px]">
						<span class="font-medium text-ink-700">{s.gap.title}</span>
						<span class="text-ink-400"> · {s.decision.status === 'wont_fix' ? "won't fix" : 'risk accepted'} by {s.decision.authorId}{s.decision.decidedAt ? ` on ${s.decision.decidedAt.slice(0, 10)}` : ''}{s.decision.reason ? `: ${s.decision.reason}` : ''}</span>
						{#if reopeningId === s.gap.id}
							<span class="mt-1 flex items-center gap-1.5">
								<input
									bind:value={reopenReason}
									placeholder="Why it is open again"
									class="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-800 placeholder:text-ink-300 focus:border-brand-300 focus:outline-none"
								/>
								<button type="button" disabled={deciding || !reopenReason.trim()} onclick={() => confirmReopen(s.gap.id, s.gap.title)} class="rounded-md bg-brand-600 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Reopen</button>
								<button type="button" onclick={() => (reopeningId = null)} class="text-[10.5px] font-medium text-ink-500 hover:text-ink-800">Cancel</button>
							</span>
						{:else}
							<button type="button" onclick={() => { reopeningId = s.gap.id; reopenReason = ''; }} class="ml-1 text-[10.5px] font-semibold text-brand-600 hover:text-brand-700">Reopen</button>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
