<script lang="ts">
	import GovernorHero from '$ui/finops/GovernorHero.svelte';
	import SignalTiles from '$ui/finops/SignalTiles.svelte';
	import EnforcementChoice from '$ui/finops/EnforcementChoice.svelte';
	import AdvancedPanel from '$ui/finops/AdvancedPanel.svelte';
	import GatewayMembers from './GatewayMembers.svelte';
	import type { FinopsStore } from '$ui/finops/draft-store.svelte';
	import type { SupervisionStore } from '../draft-store.svelte';

	interface Props {
		/** The embedded AI Cost Governor — decides whether to spend & enforces at the proxy. */
		finops: FinopsStore;
		/** The supervision store — owns per-member keys & the AI-usage ledger. */
		store: SupervisionStore;
		/** Leaf feature names, the real scopes a guardrail can target. */
		featureNames: string[];
		/** True when a real LiteLLM proxy is wired server-side. */
		gatewayConfigured: boolean;
	}
	let { finops, store, featureNames, gatewayConfigured }: Props = $props();
</script>

<div class="space-y-6">
	<!-- 1 · Should we spend at all? The governor's one clear answer + action. -->
	<GovernorHero store={finops} />

	<!-- 2 · Why — the live signals it reads. -->
	<div>
		<p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
			The signals it reads
		</p>
		<SignalTiles store={finops} />
	</div>

	<!-- 3 · Who's spending — per-member keys, budgets, quotas & calls. -->
	<div>
		<p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
			AI usage by member
		</p>
		<GatewayMembers {store} {gatewayConfigured} />
	</div>

	<!-- 4 · How strict — advisory vs enforced. -->
	<EnforcementChoice store={finops} />

	<!-- 5 · Everything else, out of the way. -->
	<AdvancedPanel store={finops} {featureNames} />
</div>
