<script lang="ts">
	import {
		Icon,
		MaturityBar,
		MATURITY_STAGES,
		MATURITY_STAGE_COUNT,
		stageFromScore,
		stageLabel
	} from '$ui/design-system';
	import { MATURITY_DIMENSION_KEY } from '$domain/coherence';
	import type { CoherenceStore } from '../draft-store.svelte';

	/**
	 * One feature's authored behavioral maturity, grouped by core feature and by
	 * roadmap release. Shape is fixed by the coherence page's PageData seam.
	 */
	interface FeatureMaturityRow {
		featureId: string;
		name: string;
		coreId: string | null;
		coreName: string;
		releaseId: string | null;
		releaseName: string;
		maturity: number; // 0-100
	}

	interface Props {
		store: CoherenceStore;
		featureMaturity: FeatureMaturityRow[];
	}
	let { store, featureMaturity }: Props = $props();

	/* ── headline maturity + stage ───────────────────────────────────────── */
	const behaviorMaturity = $derived(
		store.analysis.dimensions.find((dimension) => dimension.key === MATURITY_DIMENSION_KEY)?.score ?? 0
	);
	const projStage = $derived(stageFromScore(behaviorMaturity));
	const avgMaturity = $derived(behaviorMaturity);

	const matureCount = $derived(
		featureMaturity.filter((f) => stageFromScore(f.maturity) >= 4).length
	);
	const earlyCount = $derived(
		featureMaturity.filter((f) => stageFromScore(f.maturity) <= 2).length
	);

	/* ── grouping: by core feature or by release ─────────────────────────── */
	type View = 'core' | 'release';
	let view = $state<View>('core');

	interface Group {
		id: string;
		head: string;
		avg: number;
		feats: FeatureMaturityRow[];
	}
	const groups = $derived.by<Group[]>(() => {
		const by = new Map<string, FeatureMaturityRow[]>();
		for (const f of featureMaturity) {
			const key = view === 'release' ? f.releaseName : f.coreName;
			const list = by.get(key);
			if (list) list.push(f);
			else by.set(key, [f]);
		}
		return [...by.entries()].map(([head, feats]) => ({
			id: `${view}:${head}`,
			head,
			avg: Math.round(feats.reduce((a, f) => a + f.maturity, 0) / feats.length),
			feats
		}));
	});

	let openGroup = $state<string | null>(null);
	const toggleGroup = (id: string) => (openGroup = openGroup === id ? null : id);

</script>

{#snippet miniBar(pct: number)}
	<MaturityBar score={pct} class="w-full" />
{/snippet}

<div class="space-y-3">
	<!-- Violet (brand) maturity banner -->
	<div class="rounded-card border border-brand-200 bg-brand-50/50 p-3.5">
		<div class="mb-2 flex items-center gap-3">
			<div class="text-3xl font-extrabold leading-none text-brand-700">
				{stageLabel(projStage)}<span class="text-base font-bold text-ink-400"> · {projStage}/{MATURITY_STAGE_COUNT}</span>
			</div>
			<p class="text-[11px] leading-snug text-ink-500">
				How deeply the project's behavior is <span class="font-semibold text-ink-700">specified</span>,
				in {MATURITY_STAGE_COUNT} stages from Idea to Complete. Spec depth only, as the engine measures
				it; whether code exists is the implementation coverage's story. Distinct from spec
				completeness (see Coverage).
			</p>
		</div>
		<div class="flex gap-0.5">
			{#each MATURITY_STAGES as s (s.level)}
				<div
					class="h-3 flex-1 rounded-sm {s.level <= projStage ? 'bg-brand-500' : 'bg-surface-sunken'}"
					title={`${s.label} · ${s.means}`}
				></div>
			{/each}
		</div>
	</div>

	<!-- 4 tiles -->
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
		<div class="rounded-lg border border-line bg-surface-sunken/40 px-3 py-2.5">
			<p class="text-xl font-bold leading-none text-brand-700">{stageLabel(projStage)}</p>
			<p class="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Project maturity</p>
		</div>
		<div class="rounded-lg border border-line bg-surface-sunken/40 px-3 py-2.5">
			<p class="text-xl font-bold leading-none text-brand-700">{avgMaturity}%</p>
			<p class="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Average maturity</p>
		</div>
		<div class="rounded-lg border border-line bg-surface-sunken/40 px-3 py-2.5">
			<p class="text-xl font-bold leading-none text-success-600">{matureCount}</p>
			<p class="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Mature features <span class="text-ink-300">({stageLabel(4)}+)</span></p>
		</div>
		<div class="rounded-lg border border-line bg-surface-sunken/40 px-3 py-2.5">
			<p class="text-xl font-bold leading-none text-warning-600">{earlyCount}</p>
			<p class="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Early-stage features</p>
		</div>
	</div>

	<!-- By core feature / by release -->
	<div class="space-y-1.5">
		<div class="flex flex-wrap items-center gap-2">
			<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
				Maturity by {view === 'release' ? 'roadmap release' : 'core feature'}, then by sub-feature
			</p>
			<div class="ml-auto inline-flex items-center gap-1 rounded-lg border border-line bg-surface-sunken/60 p-0.5">
				{#each [{ k: 'core', label: 'By core feature' }, { k: 'release', label: 'By release' }] as opt (opt.k)}
					<button
						type="button"
						aria-pressed={view === opt.k}
						onclick={() => {
							view = opt.k as View;
							openGroup = null;
						}}
						class="rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors {view === opt.k
							? 'bg-surface text-ink-900 shadow-sm'
							: 'text-ink-500 hover:text-ink-800'}"
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>

		{#if featureMaturity.length === 0}
			<p class="rounded-lg bg-surface-sunken/50 px-3 py-4 text-center text-[11.5px] text-ink-400">
				Author behavior in <span class="font-semibold text-ink-500">Features</span> to populate maturity.
			</p>
		{:else if groups.length === 0}
			<p class="py-2 text-[11.5px] italic text-ink-400">
				{view === 'release' ? 'No release in the roadmap.' : 'No core feature.'}
			</p>
		{:else}
			{#each groups as g (g.id)}
				{@const isOpen = openGroup === g.id}
				<div class="overflow-hidden rounded-lg border border-line">
					<button
						type="button"
						aria-expanded={isOpen}
						onclick={() => toggleGroup(g.id)}
						class="flex w-full items-center gap-2 p-2 transition-colors hover:bg-surface-sunken/50"
					>
						<Icon
							name="chevron-right"
							size={12}
							class="shrink-0 text-ink-400 transition-transform {isOpen ? 'rotate-90' : ''}"
						/>
						<span class="w-44 min-w-0 shrink-0 truncate text-left text-xs font-semibold text-ink-700">
							{g.head}
						</span>
						<span class="flex-1">{@render miniBar(g.avg)}</span>
						<span class="w-16 shrink-0 text-right text-[10px] text-ink-500">
							{g.feats.length} feat.
						</span>
						<span class="shrink-0 rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[9px] font-bold text-brand-700">
							{stageLabel(stageFromScore(g.avg))}
						</span>
					</button>
					{#if isOpen}
						<div class="space-y-1 border-t border-line px-2 pb-2 pt-1.5">
							{#each g.feats as f (f.featureId)}
								<div class="flex items-center gap-2 pl-6">
									<span class="w-36 shrink-0 truncate text-[11px] text-ink-600">{f.name}</span>
									<span class="flex-1">{@render miniBar(f.maturity)}</span>
									<span class="w-16 shrink-0 text-right text-[9px] font-bold text-brand-700">
										{stageLabel(stageFromScore(f.maturity))}
									</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
