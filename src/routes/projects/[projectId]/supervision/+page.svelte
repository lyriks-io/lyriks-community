<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { SupervisionStore } from '$ui/supervision/draft-store.svelte';
	import { FinopsStore } from '$ui/finops/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import { isSupervisionTab, rosterFrom, type SupervisionTab } from '$domain/supervision';
	import { HelpTip } from '$ui/design-system';
	import { TAB_HELP } from '$ui/supervision/help';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import TabBar from '$ui/supervision/TabBar.svelte';
	import GovernanceChain from '$ui/supervision/sections/GovernanceChain.svelte';
	import TaskBoard from '$ui/supervision/sections/TaskBoard.svelte';
	import PolicyMonitor from '$ui/supervision/sections/PolicyMonitor.svelte';
	import DecisionLog from '$ui/supervision/sections/DecisionLog.svelte';
	import AiGateway from '$ui/supervision/sections/AiGateway.svelte';
	import type { SaveStatus } from '$ui/supervision/draft-store.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const notifier = toastNotifier;
	const store = untrack(
		() => new SupervisionStore(data.draft, data.session, notifier, data.revision, data.gatewayConfigured)
	);
	// The AI Cost Governor, embedded as the "AI Gateway" tab. Keeps its own draft +
	// LiteLLM endpoints untouched — Supervision just hosts it.
	const finops = untrack(
		() =>
			new FinopsStore(
				data.finopsDraft,
				data.signals,
				data.session,
				notifier,
				data.gatewayConfigured,
				data.finopsRevision
			)
	);

	// Deep-link a tab via ?tab=… (Control Center "Fix now" + the /finops redirect
	// land on ?tab=gateway). Applied once on mount so it doesn't fight user clicks.
	untrack(() => {
		const q = page.url.searchParams.get('tab');
		if (isSupervisionTab(q) && q !== store.activeTab) store.activeTab = q;
	});

	// Live-sync: re-hydrate both stores when a fresh server `load` lands.
	$effect(() => {
		store.gatewayConfigured = data.gatewayConfigured;
		store.hydrate(data.draft, data.revision);
	});

	// The AI Gateway roster is the REAL workspace members (lyriks-back collaborators);
	// with no back wired (air-gapped MAP) it falls back to the board's free-text names.
	$effect(() => {
		const collaborators = data.team?.collaborators ?? [];
		store.roster = collaborators.length
			? rosterFrom(collaborators)
			: rosterFrom(
					store.draft.assignments
						.filter((a) => a.assignee.trim())
						.map((a) => ({ name: a.assignee }))
				);
	});
	$effect(() => {
		finops.hydrate(data.finopsDraft, data.signals, data.gatewayConfigured, data.finopsRevision);
	});

	const projectName = $derived(data.productName);
	// One save indicator for the whole section — reflects whichever store is busy.
	const saveStatus = $derived<SaveStatus>(
		store.saveStatus === 'error' || finops.saveStatus === 'error'
			? 'error'
			: store.saveStatus === 'saving' || finops.saveStatus === 'saving'
				? 'saving'
				: 'saved'
	);

	const switchTab = (tab: SupervisionTab) => store.switchTab(tab);

	// Short, enterprise-framed one-liner shown beside each tab's ? help.
	const TAGLINE: Record<SupervisionTab, string> = {
		tasks: 'Keep parallel spec work owned and on pace.',
		policy: 'Declared rules plus live checks that flag budget breaches.',
		gateway: 'Per-member AI budgets, real spend, one spend/no-spend verdict.',
		traceability: 'An audit trail of every decision.'
	};
	const activeHelp = $derived(TAB_HELP[store.activeTab]);
</script>

<svelte:head>
	<title>{projectName} · Supervision · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5">
		<header class="mb-7">
			<p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">Supervision</p>
			<h1 class="mt-1 text-3xl font-bold tracking-tight text-ink-900">
				Govern the cost & quality of AI spend.
			</h1>
			<p class="mt-2 max-w-2xl text-sm text-ink-500">
				Turn the specification into policy: compile readiness, coherence and budget into rules that
				govern which models run, cap and attribute AI token spend per member, and trace every
				decision - the manager’s cockpit, next to the 360° spec and coherence.
				<span class="text-ink-400">New here? Tap any</span>
				<span class="mx-0.5 inline-grid size-[15px] -translate-y-px place-items-center rounded-full border border-line text-[9px] font-bold text-ink-400">?</span>
				<span class="text-ink-400">for what it does and why it matters.</span>
			</p>
		</header>

		<!-- The specification→rule→decision→usage chain, made visible. -->
		<GovernanceChain {finops} onOpenGateway={() => switchTab('gateway')} />

		<div class="mb-4">
			<TabBar
				active={store.activeTab}
				{store}
				gatewayVerdict={finops.verdict.headline}
				onSwitch={switchTab}
			/>
		</div>

		<!-- Contextual, didactic help for the active tab -->
		<div class="mb-6 flex items-center gap-2 border-l-2 border-brand-200 pl-3">
			<span class="text-[13px] font-semibold text-ink-800">{activeHelp.title}</span>
			<HelpTip {...activeHelp} />
			<span class="min-w-0 truncate text-[12px] text-ink-400">- {TAGLINE[store.activeTab]}</span>
		</div>

		<div class="space-y-6 pb-4">
			{#if store.activeTab === 'tasks'}
				<TaskBoard {store} featureWork={data.featureWork} />
			{:else if store.activeTab === 'policy'}
				<PolicyMonitor {store} spentRatio={finops.ratio} gatewayConfigured={data.gatewayConfigured} />
			{:else if store.activeTab === 'gateway'}
				<AiGateway
					{finops}
					{store}
					featureNames={data.featureNames}
					gatewayConfigured={data.gatewayConfigured}
				/>
			{:else}
				<DecisionLog {store} />
			{/if}
		</div>
	</div>
</div>

<SaveBar {saveStatus} coherence={store.coherence} />
