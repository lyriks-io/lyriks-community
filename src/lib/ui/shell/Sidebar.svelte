<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { Icon, ScoreRing, scoreToTone, toneLabel, toneText } from '$ui/design-system';
	import { NAV_CAPABILITIES, type Capability } from './capabilities';
	import { tierAllows, tierLabel, type Tier } from '$domain/tier/tier';

	interface Props {
		projectEyebrow: string;
		projectName: string;
		/** Whole-product Coherence score (correctness) — the Control Center's lead reading. */
		coherence: number;
		tier: Tier;
		/** Active development edition, shown as a badge at the foot in dev only. */
		devTier?: Tier | null;
		/** Opens the project Control Center. */
		onOpenControlCenter?: () => void;
	}
	let {
		projectEyebrow,
		projectName,
		coherence,
		tier,
		devTier = null,
		onOpenControlCenter
	}: Props = $props();

	const projectId = $derived(page.params.projectId);

	// Active capability = the 4th path segment of /projects/[id]/{capId}.
	const activeId = $derived(page.url.pathname.split('/')[3] ?? '');

	const coherenceTone = $derived(scoreToTone(coherence));

	function tierBadge(t: Tier): string {
		return t === 'enterprise' ? 'ENT' : '';
	}

	// ── Auto-hide rail (unchanged from the original chrome) ──
	let sidebarCollapsed = $state(false);
	let sidebarHoverOpen = $state(false);
	const sidebarOpen = $derived(!sidebarCollapsed || sidebarHoverOpen);
	const sidebarToggleLabel = $derived(
		sidebarCollapsed && sidebarHoverOpen
			? 'Pin menu open'
			: sidebarCollapsed
				? 'Open menu'
				: 'Collapse menu'
	);

	const SIDEBAR_REVEAL_PX = 16;
	const SIDEBAR_OPEN_DELAY_MS = 260;
	const SIDEBAR_RAIL_PX = 64;
	const SIDEBAR_PANEL_PX = 256;
	const SIDEBAR_SETTLE_BUFFER_PX = 48;
	let sidebarOpenTimer: ReturnType<typeof setTimeout> | null = null;

	function revealSidebar() {
		if (!sidebarCollapsed || sidebarHoverOpen || sidebarOpenTimer !== null) return;
		sidebarOpenTimer = setTimeout(() => {
			sidebarHoverOpen = true;
			sidebarOpenTimer = null;
		}, SIDEBAR_OPEN_DELAY_MS);
	}
	function settleSidebar() {
		if (sidebarOpenTimer !== null) {
			clearTimeout(sidebarOpenTimer);
			sidebarOpenTimer = null;
		}
		sidebarHoverOpen = false;
	}
	function handleEdgeProximity(event: PointerEvent) {
		if (!sidebarCollapsed) return;
		if (event.clientX <= SIDEBAR_REVEAL_PX) {
			revealSidebar();
		} else if (
			event.clientX >
			(sidebarHoverOpen ? SIDEBAR_PANEL_PX : SIDEBAR_RAIL_PX) + SIDEBAR_SETTLE_BUFFER_PX
		) {
			settleSidebar();
		}
	}
	function toggleSidebar() {
		settleSidebar();
		sidebarCollapsed = !sidebarCollapsed;
	}
	onDestroy(() => {
		if (sidebarOpenTimer !== null) clearTimeout(sidebarOpenTimer);
	});
</script>

<svelte:window onpointermove={handleEdgeProximity} />

<aside
	class="flex shrink-0 flex-col overflow-hidden bg-sidebar text-ink-on-dark transition-[width] duration-500 ease-[cubic-bezier(.19,1,.22,1)] {sidebarOpen
		? 'w-64'
		: 'w-16'}"
	onpointerenter={revealSidebar}
	onpointerleave={settleSidebar}
	onfocusin={revealSidebar}
	onfocusout={settleSidebar}
>
	<!-- project header -->
	<div
		class="flex items-center border-b border-sidebar-line py-4 transition-[padding] duration-500 {sidebarOpen
			? 'px-3'
			: 'px-0'}"
	>
		<span class="grid w-16 shrink-0 place-items-center">
			<a
				href="/"
				class="grid size-9 place-items-center rounded-xl bg-white/[0.06] text-ink-on-dark-muted ring-1 ring-inset ring-white/5 transition hover:bg-white/10 hover:text-white"
				aria-label="Back to projects"
				title="Back to projects"
			>
				<Icon name="grid" size={16} />
			</a>
		</span>
		<div
			class="flex w-40 shrink-0 items-center gap-2 transition-opacity duration-200 {sidebarOpen
				? 'opacity-100 delay-100'
				: 'opacity-0'}"
		>
			<div class="min-w-0 flex-1">
				<p class="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-warning-500">
					{projectEyebrow}
				</p>
				<p class="truncate text-sm font-semibold text-white">{projectName}</p>
			</div>
			<button
				type="button"
				onclick={toggleSidebar}
				aria-pressed={!sidebarCollapsed}
				class="grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset transition {sidebarCollapsed
					? 'bg-white/[0.06] text-ink-on-dark-muted ring-white/5 hover:bg-white/10 hover:text-white'
					: 'bg-white/15 text-white ring-white/20 hover:bg-white/20'}"
				aria-label={sidebarToggleLabel}
				title={sidebarToggleLabel}
			>
				<Icon name="pin" size={16} />
			</button>
		</div>
	</div>

	<!-- capabilities (free navigation) -->
	{#snippet navItem(cap: Capability)}
		{@const active = cap.id === activeId}
		{@const allowed = tierAllows(tier, cap.tier)}
		{@const badge = tierBadge(cap.tier)}
		<a
			href={allowed && projectId ? cap.route?.(projectId) : undefined}
			aria-current={active ? 'page' : undefined}
			aria-disabled={!allowed}
			title={allowed ? cap.title : `${cap.title} (Enterprise)`}
			class="group/cap flex items-center overflow-hidden rounded-xl transition-colors {active
				? sidebarOpen
					? 'bg-brand-gradient text-white shadow-lg shadow-magenta-500/20'
					: 'text-white'
				: allowed
					? 'text-ink-on-dark hover:bg-sidebar-soft'
					: 'cursor-not-allowed text-ink-on-dark-muted hover:bg-sidebar-soft/50'}"
		>
			<span class="grid h-11 w-16 shrink-0 place-items-center">
				<span
					class="grid size-9 place-items-center rounded-xl transition-all duration-300 {active
						? sidebarOpen
							? 'bg-white/15 text-white'
							: 'gradient-violet text-white shadow-lg shadow-magenta-500/30 ring-1 ring-inset ring-white/20'
						: 'bg-white/5 ring-1 ring-inset ring-white/5 group-hover/cap:bg-white/10'}"
				>
					<Icon name={cap.icon} size={16} />
				</span>
			</span>
			<span
				class="flex w-40 shrink-0 items-center gap-1.5 transition-opacity duration-200 {sidebarOpen
					? 'opacity-100 delay-75'
					: 'opacity-0'}"
			>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[13px] font-medium leading-tight">{cap.title}</span>
				</span>
				{#if !allowed && badge}
					<span
						class="shrink-0 rounded bg-white/10 px-1 py-0.5 text-[8px] font-bold tracking-wide text-ink-on-dark-muted"
						>{badge}</span
					>
				{/if}
			</span>
		</a>
	{/snippet}

	<!-- One flat list: the rail carries no Specify/Validate/Deliver headers, since
	     capabilities are entered in any order. -->
	<nav
		class="flex flex-1 flex-col gap-1.5 overflow-y-auto py-3 transition-[padding] duration-500 {sidebarOpen
			? 'px-3'
			: 'px-0'}"
	>
		{#each NAV_CAPABILITIES as cap (cap.id)}
			{@render navItem(cap)}
		{/each}
	</nav>

	<!-- Coherence (the Control Center's lead reading) opens the Control Center on its
	     Coherence tab. Collapsed, the card is just its ring under a tiny label (the
	     always-visible w-16 column); expanded, the status word + "Open Control Center"
	     appear in the clipped detail column, same reveal pattern as every nav row. -->
	{#snippet scoreCard(label: string, score: number, tone: typeof coherenceTone, action: string)}
		<span class="grid w-16 shrink-0 place-items-center gap-1">
			{#if !sidebarOpen}
				<span
					class="whitespace-nowrap text-[7px] font-bold uppercase leading-none tracking-[0.08em] text-ink-on-dark-muted"
				>
					{label}
				</span>
			{/if}
			<ScoreRing {score} size={sidebarOpen ? 42 : 34} {tone} />
		</span>
		<div
			class="flex w-40 shrink-0 flex-col justify-center transition-opacity duration-200 {sidebarOpen
				? 'opacity-100 delay-100'
				: 'opacity-0'}"
		>
			<p class="text-[11px] font-bold uppercase leading-none tracking-[0.16em] text-ink-on-dark-muted">
				{label}
			</p>
			<p class="mt-1 text-sm font-semibold leading-tight {toneText[tone]}">{toneLabel(tone)}</p>
		</div>
	{/snippet}

	<div class="border-t border-sidebar-line">
		<button
			type="button"
			onclick={onOpenControlCenter}
			class="group/cc flex w-full items-center gap-1 py-2.5 text-left transition hover:bg-sidebar-soft"
			aria-label="Open Control Center"
			title="Open Control Center (⌘/Ctrl-J)"
		>
			{@render scoreCard('Coherence', coherence, coherenceTone, 'Open Control Center')}
		</button>
	</div>

	{#if sidebarOpen && devTier}
		<div class="border-t border-sidebar-line px-4 py-2.5">
			<span
				class="inline-block rounded-pill border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-on-dark-muted"
				title="Active development edition"
			>
				Dev · {tierLabel(devTier)}
			</span>
		</div>
	{/if}
</aside>
