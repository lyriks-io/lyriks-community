<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { Gap } from '$domain/coherence';
	import { coherenceByDimension, inferKind } from '$domain/coherence/incoherence';
	import type { CoherenceStore } from '../draft-store.svelte';

	interface Props {
		store: CoherenceStore;
		onOpenGap: (gap: Gap) => void;
	}
	let { store, onOpenGap }: Props = $props();

	type Filter = 'all' | 'todo' | 'fill' | 'orphan';
	let filter = $state<Filter>('all');
	let openDim = $state<string | null>(null);

	const toggleFilter = (k: Filter) => (filter = filter === k ? 'all' : k);

	const dims = $derived(store.analysis.dimensions);
	const gaps = $derived(store.gaps);
	/** Authoritative per-dimension correctness (score/penalty), from the domain. */
	const dimCoherence = $derived(coherenceByDimension(dims, gaps));

	/**
	 * Attribute each gap to the dimension that owns its fix, mirroring the domain's
	 * `coherenceByDimension` attribution (first dimension to claim a sourceStep,
	 * with the same permissions→users alias) so the row lists match its badges.
	 */
	const GAP_SOURCE_ALIAS: Record<string, string> = { permissions: 'users' };
	const gapsByDim = $derived.by(() => {
		const keyForStep = new Map<string, string>();
		for (const d of dims) if (!keyForStep.has(d.sourceStep)) keyForStep.set(d.sourceStep, d.key);
		const acc = new Map<string, Gap[]>(dims.map((d) => [d.key, []]));
		for (const g of gaps) {
			const step = GAP_SOURCE_ALIAS[g.sourceStep] ?? g.sourceStep;
			const key = keyForStep.get(step);
			if (key) acc.get(key)!.push(g);
		}
		return acc;
	});

	const missingOf = (key: string) => (gapsByDim.get(key) ?? []).filter((g) => inferKind(g) === 'missing');
	const orphansOf = (key: string) => (gapsByDim.get(key) ?? []).filter((g) => inferKind(g) === 'orphan');

	/* ── filter tiles ─────────────────────────────────────────────────────── */
	const overall = $derived(dims.length ? Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length) : 0);
	const todoCount = $derived(dims.filter((d) => d.score < 100).length);
	const missingCount = $derived(gaps.filter((g) => inferKind(g) === 'missing').length);
	const orphanCount = $derived(gaps.filter((g) => inferKind(g) === 'orphan').length);

	type Tone = 'info' | 'brand' | 'warning' | 'danger';
	const TILE: Record<Tone, { soft: string; ring: string }> = {
		info: { soft: 'border-info-200 bg-info-50', ring: 'ring-info-400' },
		brand: { soft: 'border-brand-200 bg-brand-50', ring: 'ring-brand-400' },
		warning: { soft: 'border-warning-200 bg-warning-50', ring: 'ring-warning-400' },
		danger: { soft: 'border-danger-200 bg-danger-50', ring: 'ring-danger-400' }
	};
	const filterTiles = $derived<{ key: Filter; tone: Tone; value: string | number; label: string }[]>([
		{ key: 'all', tone: 'info', value: `${overall}%`, label: 'Overall coverage, view all' },
		{ key: 'todo', tone: 'brand', value: `${todoCount}/${dims.length}`, label: 'Entries to complete' },
		{ key: 'fill', tone: 'warning', value: missingCount, label: 'Missing info' },
		{ key: 'orphan', tone: 'danger', value: orphanCount, label: 'Orphan elements' }
	]);

	/* ── progress-bar colour by dimension breadth score ───────────────────── */
	// >=100 success, >=80 info, >=50 warning, else danger.
	const barBg: Record<'success' | 'info' | 'warning' | 'danger', string> = {
		success: 'bg-success-500',
		info: 'bg-info-500',
		warning: 'bg-warning-500',
		danger: 'bg-danger-500'
	};
	const pctText: Record<'success' | 'info' | 'warning' | 'danger', string> = {
		success: 'text-success-600',
		info: 'text-info-600',
		warning: 'text-warning-600',
		danger: 'text-danger-600'
	};
	const barKey = (s: number): 'success' | 'info' | 'warning' | 'danger' =>
		s >= 100 ? 'success' : s >= 80 ? 'info' : s >= 50 ? 'warning' : 'danger';

	/* ── which dimensions / groups the active filter shows ────────────────── */
	const showMissingGroup = $derived(filter === 'all' || filter === 'todo' || filter === 'fill');
	const showOrphanGroup = $derived(filter === 'all' || filter === 'todo' || filter === 'orphan');

	const visibleDims = $derived(
		dims.filter((d) => {
			if (filter === 'all') return true;
			if (filter === 'todo') return d.score < 100;
			if (filter === 'fill') return missingOf(d.key).length > 0;
			return orphansOf(d.key).length > 0;
		})
	);
</script>

<div class="space-y-3">
	<!-- filter tiles -->
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
		{#each filterTiles as t (t.key)}
			{@const isActive = filter === t.key}
			<button
				type="button"
				onclick={() => toggleFilter(t.key)}
				aria-pressed={isActive}
				class="rounded-lg border p-2.5 text-left transition {TILE[t.tone].soft} {isActive
					? `ring-2 ring-inset ${TILE[t.tone].ring}`
					: 'hover:brightness-[0.98]'}"
			>
				<div class="text-[20px] font-extrabold leading-none text-ink-800">{t.value}</div>
				<div class="mt-1 text-[10px] leading-snug text-ink-500">
					{t.label}{isActive ? ' · filtered' : ''}
				</div>
			</button>
		{/each}
	</div>
	<p class="text-[10.5px] text-ink-400">
		Click a tile to filter, an entry to see its detail. Each gap deep-links to the page where it is fixed.
	</p>

	<!-- dimension rows -->
	<div class="space-y-2">
		{#if visibleDims.length === 0}
			<p class="py-4 text-center text-[12px] italic text-ink-400">Nothing in this filter.</p>
		{/if}
		{#each visibleDims as d (d.key)}
			{@const missing = missingOf(d.key)}
			{@const orphans = orphansOf(d.key)}
			{@const coh = dimCoherence.get(d.key)}
			{@const complete = d.score >= 100 && (coh?.gapCount ?? 0) === 0}
			{@const expandable = missing.length + orphans.length > 0}
			{@const opened = openDim === d.key}
			<div class="overflow-hidden rounded-xl border bg-surface {complete ? 'border-success-300' : 'border-line'}">
				<div class="p-2.5">
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => expandable && (openDim = opened ? null : d.key)}
							class="min-w-0 flex-1 text-left {expandable ? '' : 'cursor-default'}"
						>
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-[13px] font-bold text-ink-800">{d.label}</span>
								{#if complete}
									<span
										class="inline-flex items-center gap-1 rounded border border-success-300 bg-success-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-success-600"
									>
										<Icon name="check" size={10} /> Complete
									</span>
								{/if}
								{#if missing.length > 0}
									<span
										class="rounded border border-warning-300 bg-warning-50 px-1.5 py-0.5 text-[9px] font-bold text-warning-600"
									>
										{missing.length} missing info
									</span>
								{/if}
								{#if orphans.length > 0}
									<span
										class="rounded border border-danger-300 bg-danger-50 px-1.5 py-0.5 text-[9px] font-bold text-danger-600"
									>
										{orphans.length} orphan{orphans.length > 1 ? 's' : ''}
									</span>
								{/if}
							</div>
						</button>
						{#if expandable}
							<button
								type="button"
								onclick={() => (openDim = opened ? null : d.key)}
								aria-label="Detail"
								class="flex size-6 shrink-0 items-center justify-center rounded bg-surface-sunken text-ink-500 hover:bg-ink-100"
							>
								<Icon name="arrow-right" size={12} class="transition {opened ? 'rotate-90' : ''}" />
							</button>
						{/if}
					</div>
					<div class="mt-2 flex items-center gap-2">
						<div class="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
							<div
								class="h-full rounded-full transition-all {barBg[barKey(d.score)]}"
								style="width:{Math.max(0, Math.min(100, d.score))}%"
							></div>
						</div>
						<span class="w-11 shrink-0 text-right text-[11px] font-bold {pctText[barKey(d.score)]}">
							{d.score}%
						</span>
					</div>
				</div>

				{#if opened}
					<div class="space-y-2.5 border-t border-line px-3 pb-3 pt-1">
						{#if showMissingGroup && missing.length > 0}
							<div class="space-y-1">
								<div class="pt-1.5 text-[9.5px] font-bold uppercase tracking-widest text-warning-600">
									Missing info · {missing.length}
								</div>
								{#each missing as g, i (g.id)}
									<div class="flex items-center gap-2">
										<span
											class="flex size-4 shrink-0 items-center justify-center rounded-full bg-warning-50 text-[9px] font-bold text-warning-600"
										>
											{i + 1}
										</span>
										<div class="min-w-0 flex-1">
											<div class="truncate text-[12px] text-ink-700">{g.title}</div>
											{#if g.detail}<div class="truncate text-[10px] text-ink-400">{g.detail}</div>{/if}
										</div>
										<button
											type="button"
											onclick={() => onOpenGap(g)}
											class="inline-flex shrink-0 items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-600 hover:bg-surface-sunken"
										>
											<Icon name="arrow-right" size={11} /> Go to page
										</button>
									</div>
								{/each}
							</div>
						{/if}

						{#if showOrphanGroup && orphans.length > 0}
							<div class="space-y-1">
								<div class="pt-1.5 text-[9.5px] font-bold uppercase tracking-widest text-danger-600">
									Orphans, connected to nothing · {orphans.length}
								</div>
								{#each orphans as g (g.id)}
									<div class="flex items-center gap-2">
										<span class="size-1.5 shrink-0 rounded-full bg-danger-500"></span>
										<div class="min-w-0 flex-1">
											<div class="truncate text-[12px] text-ink-700">{g.title}</div>
											{#if g.detail}<div class="text-[10px] text-ink-400">{g.detail}</div>{/if}
										</div>
										<button
											type="button"
											onclick={() => onOpenGap(g)}
											class="inline-flex shrink-0 items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-600 hover:bg-surface-sunken"
										>
											<Icon name="arrow-right" size={11} /> Go to page
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
