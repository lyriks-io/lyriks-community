<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';
	import type { FormalEngineStatus } from '$domain/coherence';
	import type { Tier as ProductTier } from '$domain/tier/tier';
	import type { CoherenceStore } from '../draft-store.svelte';

	interface Props {
		store: CoherenceStore;
		productTier: ProductTier;
	}
	let { store, productTier }: Props = $props();

	/* Surface guarantee tiers honestly so readiness is never mistaken for a
	   correctness proof. Formal (DPO) is Enterprise-only and becomes live only
	   when that entitlement is active and the Rust engine is reachable.

	   The checker reports WHY the formal layer is missing (`formalEngine`): an
	   unreachable engine and a clean project must not render the same. Analyses
	   produced without the engine overlay carry no status — fall back to the
	   entitlement, which is what used to be inferred. */
	const formalStatus = $derived(
		store.analysis.formalEngine ?? (productTier === 'enterprise' ? 'unreachable' : 'not-entitled')
	);
	const formalEntitled = $derived(formalStatus !== 'not-entitled');
	const formalActive = $derived(formalStatus === 'active');
	const hasSemantic = $derived(store.analysis.dimensions.some((d) => d.key === 'semantic'));
	const hasBehavior = $derived(store.analysis.dimensions.some((d) => d.key === 'behavior'));

	/* One line per status — a missing formal layer names its own reason, never a
	   bare "offline" the reader is left to interpret. */
	const FORMAL_BLURB: Record<FormalEngineStatus, string> = {
		'not-entitled':
			'Enterprise only - Community keeps local and behavior coherence without the formal engine.',
		unreachable:
			'Engine unreachable - NOTHING was formally checked. Coverage only, not a correctness proof.',
		'not-wired':
			'No DPO engine behind this install - NOTHING was formally checked. Coverage only, not a correctness proof.',
		'no-model':
			'Engine live, but this project has no published model yet - it checked an empty graph, which proves nothing.',
		pending:
			'Engine live, computing its first verdict over this model - nothing is proven until it lands; reload in a moment.',
		active: 'Machine-checked by the Rust DPO engine - violations become blocking gaps.'
	};
	const FORMAL_BADGE: Record<FormalEngineStatus, string> = {
		'not-entitled': 'Enterprise',
		unreachable: 'unreachable',
		'not-wired': 'no engine',
		'no-model': 'nothing published',
		pending: 'verdict in progress',
		active: 'live · blocking'
	};

	interface Tier {
		key: string;
		label: string;
		blurb: string;
		icon: IconName;
		active: boolean;
		activeCls: string;
		badge: string;
		badgeCls: string;
	}

	const tiers = $derived<Tier[]>([
		{
			key: 'formal',
			label: 'Formal (DPO)',
			blurb: FORMAL_BLURB[formalStatus],
			icon: 'shield',
			active: formalActive,
			activeCls: 'border-success-300 bg-success-50',
			badge: FORMAL_BADGE[formalStatus],
			badgeCls: formalActive
				? 'bg-success-100 text-success-600'
				: formalEntitled
					? 'bg-warning-50 text-warning-600'
					: 'bg-surface-sunken text-ink-400'
		},
		{
			key: 'semantic',
			label: 'Semantic (review)',
			blurb: 'Project-wide consistency roll-up from the LLM review - best-effort, non-blocking.',
			icon: 'sliders',
			active: hasSemantic,
			activeCls: 'border-info-300 bg-info-50',
			badge: hasSemantic ? 'live · advisory' : 'no verdicts',
			badgeCls: hasSemantic ? 'bg-info-100 text-info-600' : 'bg-surface-sunken text-ink-400'
		},
		{
			key: 'behavior',
			label: 'Behavior (unspa)',
			blurb: 'Live model-check from the unspa engine - invariant, scenario & spec issues, advisory.',
			icon: 'cpu',
			active: hasBehavior,
			activeCls: 'border-info-300 bg-info-50',
			badge: hasBehavior ? 'live · advisory' : 'no issues',
			badgeCls: hasBehavior ? 'bg-info-100 text-info-600' : 'bg-surface-sunken text-ink-400'
		},
		{
			key: 'coverage',
			label: 'Coverage',
			blurb: 'Per-capability breadth heuristics across steps 1-9 - best-effort, the ring you see.',
			icon: 'gauge',
			active: true,
			activeCls: 'border-brand-200 bg-brand-50/40',
			badge: 'always on',
			badgeCls: 'bg-brand-50 text-brand-600'
		}
	]);
</script>

<section class="rounded-card border border-line bg-surface p-4">
	<div class="mb-3 flex items-center gap-2">
		<Icon name="layers" size={14} />
		<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
			Guarantee tiers · what readiness actually promises
		</p>
	</div>
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		{#each tiers as tier (tier.key)}
			<div
				class="rounded-field border p-3 {tier.active
					? tier.activeCls
					: 'border-line bg-surface-sunken/40'}"
			>
				<div class="mb-1 flex items-center justify-between gap-2">
					<span class="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
						<Icon name={tier.icon} size={13} />
						{tier.label}
					</span>
					<span class="rounded-pill px-1.5 py-0.5 text-[9px] font-semibold {tier.badgeCls}">
						{tier.badge}
					</span>
				</div>
				<p class="text-[10.5px] leading-snug text-ink-500">{tier.blurb}</p>
			</div>
		{/each}
	</div>
</section>
