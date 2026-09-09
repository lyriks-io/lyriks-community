<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { invalidate } from '$app/navigation';
	import {
		Icon,
		MaturityBar,
		MATURITY_STAGES,
		stageFromScore,
		stageLabel,
		stageMeans
	} from '$ui/design-system';
	import { capabilityById, NAV_CAPABILITIES, resolveVisibleCapability } from '$ui/shell/capabilities';
	import {
		KIND_LABEL,
		PROVENANCE_META,
		type ProductCoherence,
		type Incoherence,
		type IncoherenceKind,
		type SettledIncoherence
	} from '$domain/coherence/incoherence';
	import { coverageScoreOf, type FormalEngineStatus, type GapProvenance } from '$domain/coherence';
	import { FOCUS_META, focusList, type CoherenceFocus, type ScorePoint, type VisitDelta } from '$domain/coherence';
	import { UNPLANNED_RELEASE_ID, type MaturityBreakdownRow } from '$domain/features/trl-breakdown';
	import { projectSyncKey } from '$lib/shared/section-sync';
	import { clientId } from '$ui/shell/live-sync.client';

	interface Props {
		coherence: ProductCoherence;
		/** Maturity re-read along the feature and roadmap axes. */
		trlBreakdown?: {
			features: MaturityBreakdownRow[];
			cores: MaturityBreakdownRow[];
			releases: MaturityBreakdownRow[];
		};
		/** Project name for the header (the Control Center is per-project). */
		projectName?: string;
		/** The scores over time, oldest first; empty until the first analysis was recorded. */
		scoreHistory?: ScorePoint[];
		/** What changed since this person last opened the panel here; null on a first visit. */
		sinceLastVisit?: VisitDelta | null;
		open?: boolean;
	}
	let {
		coherence,
		trlBreakdown = { features: [], cores: [], releases: [] },
		projectName = 'This product',
		scoreHistory = [],
		sinceLastVisit = null,
		open = $bindable(false)
	}: Props = $props();

	const projectId = $derived(page.params.projectId ?? '');

	// Close on Escape, like the prototype drawer.
	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// ── The three canonical project-health readings ──
	// Coverage  = breadth: how filled the structural dimensions are (presence).
	// Coherence = correctness: 100 minus the gain locked in unfixed incoherences.
	// Readiness = the composite implementation gate (40% coverage + 60% maturity),
	//             read as a maturity stage. There is deliberately NO whole-project
	//             maturity headline: per-core/feature/release stages live in its detail panel.
	const coverage = $derived(coverageScoreOf(coherence.dimensions, coherence.readinessScore));
	const readinessStage = $derived(stageFromScore(coherence.readinessScore));
	const blockingCount = $derived(coherence.incoherences.filter((i) => i.blocking).length);
	const highSeverityCount = $derived(coherence.incoherences.filter((i) => i.severity === 'high').length);

	// Coherence LEADS: it is the sidebar ring and the panel's default tab; breadth
	// (Coverage) and the implementation gate (Readiness) read as its supporting axes.
	type KpiKey = 'coverage' | 'coherence' | 'readiness';
	const kpis = $derived([
		{
			key: 'coherence' as KpiKey,
			label: 'Coherence',
			tag: 'Correctness',
			value: coherence.coherenceScore,
			stroke: '#10b981',
			display: undefined as string | undefined,
			hint: coherence.incoherences.length
				? `${coherence.incoherences.length} incoherence${coherence.incoherences.length > 1 ? 's' : ''} to resolve.`
				: 'No contradiction detected.'
		},
		{
			key: 'coverage' as KpiKey,
			label: 'Coverage',
			tag: 'Presence & completeness',
			value: coverage,
			stroke: '#3b82f6',
			display: undefined as string | undefined,
			hint: 'Are the expected elements present and linked?'
		},
		{
			key: 'readiness' as KpiKey,
			label: 'Build readiness',
			tag: 'Implementation gate',
			value: coherence.readinessScore,
			stroke: '#8b5cf6',
			display: stageLabel(readinessStage),
			hint: `${stageMeans(readinessStage)} (mature enough to build?)`
		}
	]);
	let selKpi = $state<KpiKey>('coherence');
	const sk = $derived(kpis.find((k) => k.key === selKpi) ?? kpis[0]);

	// ── Live movement: when a score changes while the panel is open, say by how much ──
	// The rings already animate; the chip names the delta so a fix made in front of
	// someone reads as "+8", not as a ring that quietly moved.
	// Plain memory, not reactive state: the effect below must not re-run on its
	// own bookkeeping, only when a score changes.
	let lastScores: Record<KpiKey, number> | null = null;
	let flash = $state<{ key: KpiKey; delta: number } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const now: Record<KpiKey, number> = {
			coherence: coherence.coherenceScore,
			coverage,
			readiness: coherence.readinessScore
		};
		const prev = lastScores;
		lastScores = now;
		if (!prev || !open) return;
		const moved = (['coherence', 'readiness', 'coverage'] as KpiKey[]).find((k) => now[k] !== prev[k]);
		if (!moved) return;
		flash = { key: moved, delta: now[moved] - prev[moved] };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 4000);
	});

	// ── The sparkline behind each ring: the last 30 recorded points of that score ──
	const sparkPoints = $derived.by(() => {
		const pts = scoreHistory.slice(-30);
		const pick = (p: ScorePoint) =>
			selKpi === 'coherence' ? p.coherence : selKpi === 'coverage' ? p.coverage : p.readiness;
		return pts.map((p) => ({ at: p.at, v: pick(p) }));
	});

	// ── The Coverage tab's capability list ──
	// EVERY scoreable dimension (behavior maturity and the formal DPO verdict
	// included), resolved to the VISIBLE left-nav capability that owns the fix, so
	// the card label always matches the sidebar entry the user would click (e.g.
	// Product > Foundation, Rules + behavior > Features, Data + Architecture > Data
	// & Architecture). Merged rows take the worst score (weakest link) and pool the
	// incoherences of every dimension they absorb, matched on the dimension's own
	// capability id OR on the issue's capability resolving to the same visible
	// entry, so a gap tagged to a hidden alias with no dimension of its own
	// (permissions > Users) still lands on the row that fixes it. Listed in SIDEBAR
	// order to mirror the left nav; dimensions with no sidebar home (Formal) close
	// the list.
	const SIDEBAR_RANK = new Map(NAV_CAPABILITIES.map((c, i) => [c.id, i]));
	const capabilityRows = $derived.by(() => {
		const merged = new Map<
			string,
			{ key: string; name: string; score: number; href: string | undefined; capIds: Set<string> }
		>();
		for (const d of coherence.dimensions) {
			const rawCap = capabilityById(d.sourceStep);
			const visible = resolveVisibleCapability(d.sourceStep) ?? rawCap;
			const groupKey = visible?.id ?? d.key;
			const existing = merged.get(groupKey);
			if (existing) {
				existing.score = Math.min(existing.score, d.score);
				if (rawCap) existing.capIds.add(rawCap.id);
			} else {
				merged.set(groupKey, {
					key: groupKey,
					name: visible?.title ?? d.label,
					score: d.score,
					href: visible && projectId ? visible.route?.(projectId) : undefined,
					capIds: new Set(rawCap ? [rawCap.id] : [])
				});
			}
		}
		return [...merged.values()]
			.map(({ capIds, ...row }) => ({
				...row,
				issues: coherence.incoherences.filter(
					(i) =>
						capIds.has(i.capabilityId) ||
						resolveVisibleCapability(i.capabilityId)?.id === row.key
				)
			}))
			.sort((a, b) => (SIDEBAR_RANK.get(a.key) ?? Infinity) - (SIDEBAR_RANK.get(b.key) ?? Infinity));
	});

	// Maturity axis switcher: the SAME maturity scores read along three groupings,
	// per core feature (the tree's structure, leading), per leaf feature, and per
	// release (the roadmap's delivery axis), all re-aggregated from the per-leaf
	// scores behind the maturity dimension.
	type TrlAxis = 'core' | 'feature' | 'release';
	const TRL_AXES: { key: TrlAxis; label: string; heading: string }[] = [
		{ key: 'core', label: 'Core', heading: 'Maturity per core feature' },
		{ key: 'feature', label: 'Feature', heading: 'Maturity per feature' },
		{ key: 'release', label: 'Release', heading: 'Maturity per release' }
	];
	let trlAxis = $state<TrlAxis>('core');
	const trlAxisMeta = $derived(TRL_AXES.find((a) => a.key === trlAxis) ?? TRL_AXES[0]);
	const featuresHref = $derived(
		projectId ? capabilityById('features')?.route?.(projectId) : undefined
	);
	const featureHref = (featureId: string): string | undefined =>
		featuresHref ? `${featuresHref}?feature=${encodeURIComponent(featureId)}` : undefined;

	// ── Coherence tab: the diagnosis ──
	// The headline tiles are lenses, not trophies: pressing Blocking, High
	// severity or New keeps only that set in the list (and in the "do this
	// first" card); pressing again, or "Show all", brings everything back. A
	// focus whose set empties (the last blocking gap was just fixed) releases
	// itself, so the panel never shows an empty list behind a pressed tile.
	let focus = $state<CoherenceFocus>('all');
	const newIds = $derived(new Set(sinceLastVisit?.newIds ?? []));
	const focusCounts = $derived({
		blocking: blockingCount,
		high: highSeverityCount,
		new: newIds.size
	});
	const focused = $derived(focusList(coherence.incoherences, focus, newIds));
	$effect(() => {
		if (focus !== 'all' && focusCounts[focus] === 0) focus = 'all';
	});
	$effect(() => {
		void projectId;
		focus = 'all';
	});
	// The list is already in "do this first" order (blocking, then severity, then
	// the strongest guarantee), so the first incoherence IS the next best fix;
	// under a focus, the first of that set.
	const firstFix = $derived(focused[0]);

	// Two lenses on the same cards. BY PLACE (default) groups them under the
	// sidebar entry that fixes them, so the header carries the subject and the
	// card only has to say what is wrong. BY TYPE keeps the incoherence classes.
	type Lens = 'place' | 'type';
	let lens = $state<Lens>('place');
	interface Group {
		key: string;
		name: string;
		items: Incoherence[];
	}
	const placeGroups = $derived.by((): Group[] => {
		const placed = new Set<string>();
		const groups: Group[] = [];
		for (const row of capabilityRows) {
			if (row.issues.length === 0) continue;
			groups.push({ key: row.key, name: row.name, items: row.issues });
			for (const i of row.issues) placed.add(i.id);
		}
		const elsewhere = coherence.incoherences.filter((i) => !placed.has(i.id));
		if (elsewhere.length > 0) groups.push({ key: 'elsewhere', name: 'Elsewhere', items: elsewhere });
		return groups;
	});
	const typeGroups = $derived.by((): Group[] =>
		(Object.keys(KIND_LABEL) as IncoherenceKind[])
			.map((kind) => ({
				key: kind,
				name: KIND_LABEL[kind],
				items: coherence.incoherences.filter((i) => i.kind === kind)
			}))
			.filter((g) => g.items.length > 0)
	);
	const groups = $derived(lens === 'place' ? placeGroups : typeGroups);
	// What a group header carries, so the tiles above are found again in the
	// list without pressing them: how many of its items block, how many weigh high.
	const tallyOf = (items: Incoherence[]) => ({
		blocking: items.filter((i) => i.blocking).length,
		high: items.filter((i) => i.severity === 'high').length
	});

	// ── What the machine verified: the check tally and the formal layer's status ──
	const FORMAL_LABEL: Record<FormalEngineStatus, string> = {
		active: 'Formal engine live',
		'not-entitled': 'Formal engine: Enterprise',
		unreachable: 'Formal engine unreachable',
		'not-wired': 'No formal engine',
		'no-model': 'Formal engine: nothing published',
		pending: 'Formal engine: verdict in progress'
	};

	// ── Presentation helpers ──
	function verdict(v: number): { label: string; cls: string } {
		if (v >= 80) return { label: 'Strong', cls: 'text-success-400' };
		if (v >= 60) return { label: 'Watch', cls: 'text-warning-400' };
		return { label: 'Critical', cls: 'text-danger-400' };
	}
	const headerVerdict = $derived(verdict(coherence.coherenceScore));
	function barColor(s: number): string {
		return s >= 80 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ec4899';
	}
	// Severity is a word in the same tone as the tile that counts it, never a
	// dot the reader has to hover: High reads amber like the "High severity" tile.
	const SEVERITY_CHIP: Record<Incoherence['severity'], { label: string; cls: string }> = {
		high: { label: 'High', cls: 'bg-warning-500/20 text-warning-300' },
		medium: { label: 'Medium', cls: 'bg-white/10 text-ink-on-dark-muted' },
		low: { label: 'Low', cls: 'bg-white/5 text-white/40' }
	};
	// Who says so, as a colour: a proof reads green, a declaration reads brand, a
	// detection stays neutral. The tooltip carries what the word means.
	const PROVENANCE_CLS: Record<GapProvenance, string> = {
		declared: 'bg-brand-500/25 text-brand-300',
		detected: 'bg-white/10 text-ink-on-dark-muted',
		proven: 'bg-success-500/25 text-success-300',
		reviewed: 'bg-info-500/25 text-info-300',
		behavior: 'bg-warning-500/20 text-warning-300'
	};
	const CHIP = 'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide';

	// Soft tile background per accent tone (dark panel).
	const TILE: Record<string, string> = {
		info: 'border-info-500/25 bg-info-500/10',
		brand: 'border-brand-500/25 bg-brand-500/10',
		success: 'border-success-500/25 bg-success-500/10',
		warning: 'border-warning-500/25 bg-warning-500/10',
		danger: 'border-danger-500/25 bg-danger-500/10'
	};

	// Expansion state (one open row per section).
	let openEntry = $state<string | null>(null);
	let openGroup = $state<string | null>(null);
	let settledOpen = $state(false);

	// ── Settling a gap: a traced decision, made here ──
	// The reason is mandatory, the author is stamped server-side, and the decision
	// is appended (never deleted). The layout re-runs on the change event the route
	// publishes, so the ring, the tally and the list all move together.
	let settlingId = $state<string | null>(null);
	let reasonDraft = $state('');
	let decisionBusy = $state(false);
	let decisionError = $state('');
	async function decide(
		inc: Incoherence,
		status: 'accepted_risk' | 'wont_fix' | 'reopened',
		reason: string
	): Promise<void> {
		if (!projectId || decisionBusy) return;
		decisionBusy = true;
		decisionError = '';
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/coherence/decisions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
				body: JSON.stringify({ gapId: inc.id, gapTitle: inc.title, status, reason })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				decisionError = body.message ?? `The decision was refused (${res.status}).`;
				return;
			}
			settlingId = null;
			reasonDraft = '';
			await invalidate(projectSyncKey(projectId));
		} catch (err) {
			decisionError = err instanceof Error ? err.message : 'The decision could not be saved.';
		} finally {
			decisionBusy = false;
		}
	}
	let reopeningId = $state<string | null>(null);
	let reopenReason = $state('');

	// ── Mark what was seen, so the next visit can say what is new ──
	// Fired once per opening; the delta shown now was computed server-side from
	// the previous mark, so marking here never erases what the reader is looking at.
	let seenMarkedFor: string | null = null;
	$effect(() => {
		if (!open || !browser || !projectId || seenMarkedFor === projectId) return;
		seenMarkedFor = projectId;
		void fetch(`/api/projects/${encodeURIComponent(projectId)}/coherence/seen`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ gapIds: coherence.incoherences.map((i) => i.id) })
		}).catch(() => {});
	});
	$effect(() => {
		if (!open) seenMarkedFor = null;
	});

	// ── The build gate: the same report the agents read through finish_project ──
	// Loaded when the Readiness tab is opened, never on page load: it runs the
	// whole-project completion assessment, which is heavier than the chrome.
	interface GateReport {
		status: 'unverified' | 'blocked' | 'ready' | 'completed';
		score: number;
		canFinish: boolean;
		auditFresh: boolean;
		checks: { key: string; label: string; passed: boolean; detail: string }[];
		issues: { code: string; severity: 'blocking' | 'warning'; message: string; path: string }[];
	}
	let gate = $state<GateReport | null>(null);
	let gateLoading = $state(false);
	let gateError = $state('');
	async function loadGate(): Promise<void> {
		if (!projectId || gateLoading) return;
		gateLoading = true;
		gateError = '';
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/completion`);
			if (!res.ok) {
				gateError = `The build gate did not answer (${res.status}).`;
				return;
			}
			gate = (await res.json()) as GateReport;
		} catch (err) {
			gateError = err instanceof Error ? err.message : 'The build gate did not answer.';
		} finally {
			gateLoading = false;
		}
	}
	$effect(() => {
		if (open && selKpi === 'readiness') untrack(() => { if (!gate && !gateLoading && !gateError) void loadGate(); });
	});
	// A fresh analysis (the layout re-ran) makes the last gate reading stale.
	$effect(() => {
		void coherence;
		untrack(() => {
			gate = null;
			gateError = '';
		});
	});
	const GATE_LABEL: Record<GateReport['status'], { label: string; cls: string }> = {
		completed: { label: 'Completed', cls: 'text-success-300' },
		ready: { label: 'Ready to build', cls: 'text-success-300' },
		blocked: { label: 'Blocked', cls: 'text-danger-300' },
		unverified: { label: 'Not audited yet', cls: 'text-warning-300' }
	};

	// ── Drag-to-resize the rail from its left edge ──
	// Width is user-owned: a pointer drag on the left handle sets it, keyboard
	// arrows nudge it, double-click resets, and the choice is remembered per browser.
	const MIN_WIDTH = 320;
	const DEFAULT_WIDTH = 420;
	const WIDTH_KEY = 'lyriks.control-center.width';

	// Cap to the viewport so the rail never swallows the workspace; SSR-safe fallback.
	function maxWidthFor(): number {
		return browser ? Math.min(760, Math.round(window.innerWidth * 0.9)) : 760;
	}
	function clampWidth(px: number): number {
		return Math.max(MIN_WIDTH, Math.min(maxWidthFor(), Math.round(px)));
	}
	function loadWidth(): number {
		if (!browser) return DEFAULT_WIDTH;
		const saved = Number(localStorage.getItem(WIDTH_KEY));
		return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : DEFAULT_WIDTH;
	}

	let width = $state(loadWidth());
	let dragging = $state(false);
	let dragStartX = 0;
	let dragStartWidth = 0;

	function persistWidth() {
		if (browser) localStorage.setItem(WIDTH_KEY, String(width));
	}
	function onResizeDown(e: PointerEvent) {
		dragging = true;
		dragStartX = e.clientX;
		dragStartWidth = width;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}
	function onResizeMove(e: PointerEvent) {
		if (!dragging) return;
		// The rail hugs the right edge, so dragging the handle left grows it.
		width = clampWidth(dragStartWidth + (dragStartX - e.clientX));
	}
	function onResizeUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		persistWidth();
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* pointer already released */
		}
	}
	function onResizeKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 32 : 16;
		if (e.key === 'ArrowLeft') width = clampWidth(width + step);
		else if (e.key === 'ArrowRight') width = clampWidth(width - step);
		else if (e.key === 'Home') width = clampWidth(maxWidthFor());
		else if (e.key === 'End') width = MIN_WIDTH;
		else return;
		e.preventDefault();
		persistWidth();
	}
	function resetWidth() {
		width = DEFAULT_WIDTH;
		persistWidth();
	}

	const shortDate = (iso: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : 'earlier');
</script>

{#snippet kpiRing(value: number, stroke: string, size: number, text?: string)}
	{@const clamped = Math.max(0, Math.min(100, value))}
	{@const r = (size - 6) / 2}
	{@const c = 2 * Math.PI * r}
	<span class="relative inline-grid place-items-center" style="width:{size}px;height:{size}px">
		<svg width={size} height={size} viewBox="0 0 {size} {size}" class="-rotate-90">
			<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3" />
			<circle
				cx={size / 2}
				cy={size / 2}
				{r}
				fill="none"
				{stroke}
				stroke-width="3"
				stroke-linecap="round"
				stroke-dasharray={c}
				stroke-dashoffset={c * (1 - clamped / 100)}
				style="transition: stroke-dashoffset 600ms ease"
			/>
		</svg>
		<span class="absolute {text ? 'text-[10px]' : 'text-[13px]'} font-black tabular-nums text-white">{text ?? Math.round(value)}</span>
	</span>
{/snippet}

{#snippet sparkline(points: { at: string; v: number }[], stroke: string)}
	{@const w = 132}
	{@const h = 30}
	{@const n = points.length}
	{@const step = n > 1 ? (w - 6) / (n - 1) : 0}
	{@const y = (v: number) => 3 + (h - 6) * (1 - Math.max(0, Math.min(100, v)) / 100)}
	{@const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(3 + i * step).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}
	<svg width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true" class="shrink-0">
		<line x1="3" y1={h - 3} x2={w - 3} y2={h - 3} stroke="rgba(255,255,255,0.12)" stroke-width="1" />
		{#if n > 1}
			<path {d} fill="none" {stroke} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
		{/if}
		{#if n > 0}
			<circle cx={3 + (n - 1) * step} cy={y(points[n - 1].v)} r="2.5" fill={stroke} />
		{/if}
	</svg>
{/snippet}

{#snippet tile(num: string | number, label: string, tone: string)}
	<div class="rounded-lg border p-2.5 {TILE[tone] ?? 'border-white/10 bg-white/5'}">
		<div class="text-[18px] font-extrabold leading-none text-white">{num}</div>
		<div class="mt-1 text-[10px] leading-snug text-ink-on-dark-muted">{label}</div>
	</div>
{/snippet}

<!-- A headline count that is also a lens on the list: pressed, it keeps only
     what it counts; pressed again it releases. Zero reads as done, not as a button. -->
{#snippet focusTile(key: Exclude<CoherenceFocus, 'all'>, count: number, tone: string, label: string, means: string)}
	{@const active = focus === key}
	{@const none = count === 0}
	<button
		type="button"
		disabled={none}
		aria-pressed={active}
		onclick={() => (focus = active ? 'all' : key)}
		title={none ? 'Nothing to show here.' : active ? 'Showing only these. Press again to show all.' : 'Press to show only these.'}
		class="rounded-lg border p-2.5 text-left transition {none
			? 'border-success-500/25 bg-success-500/5'
			: active
				? `${TILE[tone]} ring-2 ring-white/60`
				: `${TILE[tone]} hover:bg-white/10`}"
	>
		<div class="flex items-center gap-1">
			<span class="text-[18px] font-extrabold leading-none {none ? 'text-success-300' : 'text-white'}">{count}</span>
			{#if active}
				<span class="ml-auto inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-white/70"><Icon name="x" size={10} /> clear</span>
			{/if}
		</div>
		<div class="mt-1 text-[10px] font-semibold leading-snug text-white">{label}</div>
		<div class="text-[9px] leading-snug text-white/50">{means}</div>
	</button>
{/snippet}

{#snippet bar(pct: number, color: string)}
	<div class="h-1.5 overflow-hidden rounded-full bg-white/10">
		<div class="h-full rounded-full" style="width:{Math.max(2, Math.min(100, pct))}%;background:{color}"></div>
	</div>
{/snippet}

{#snippet trlListRow(name: string, detail: string, score: number | null, href: string | undefined)}
	{@const stage = score === null ? null : stageFromScore(score)}
	<div class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
		<div class="min-w-0 flex-1">
			{#if href}
				<a
					{href}
					onclick={() => (open = false)}
					class="block truncate text-[11.5px] font-semibold text-white transition hover:text-brand-300"
					title="Go to {name}"
				>{name}</a>
			{:else}
				<div class="truncate text-[11.5px] font-semibold text-white">{name}</div>
			{/if}
			{#if detail}
				<div class="truncate text-[9.5px] text-white/40" title={detail}>{detail}</div>
			{/if}
		</div>
		{#if score === null || stage === null}
			<div class="flex-1"><MaturityBar trl={0} dark class="w-full" /></div>
			<span class="shrink-0 text-[10px] italic text-white/40">no features</span>
		{:else}
			<div class="flex-1"><MaturityBar {score} dark class="w-full" /></div>
			<span class="shrink-0 rounded border border-brand-500/25 bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold text-brand-300" title={stageMeans(stage)}>{stageLabel(stage)}</span>
		{/if}
	</div>
{/snippet}

{#snippet trlEmpty(message: string)}
	<div class="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center">
		<p class="text-[11px] text-ink-on-dark-muted">{message}</p>
		{#if featuresHref}
			<a
				href={featuresHref}
				onclick={() => (open = false)}
				class="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300 transition hover:text-brand-200"
			>
				Open Features <Icon name="arrow-right" size={12} />
			</a>
		{/if}
	</div>
{/snippet}

<!-- One card shape everywhere: WHERE (capability and subject), HOW URGENT
     (blocking, severity), WHO SAYS SO and WHAT KIND (the chips), WHAT is wrong
     (the title), WHAT TO DO (the action line), WHY (folded), and a link that
     names its destination. -->
{#snippet issueCard(inc: Incoherence, settled?: SettledIncoherence)}
	<div class="rounded-lg border {settled ? 'border-white/5 bg-white/[0.03]' : newIds.has(inc.id) ? 'border-brand-400/40 bg-white/5' : 'border-white/10 bg-white/5'} p-2.5">
		<div class="flex items-center gap-2">
			<span class="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/55" title={inc.subject ? `${inc.capabilityTitle} › ${inc.subject}` : inc.capabilityTitle}>
				{inc.capabilityTitle}{#if inc.subject}<span class="mx-1 text-white/35">›</span><span class="text-white/80">{inc.subject}</span>{/if}
			</span>
			{#if newIds.has(inc.id) && !settled}
				<span class="{CHIP} bg-brand-500/30 text-brand-200">New</span>
			{/if}
		</div>
		<div class="mt-1 flex flex-wrap items-center gap-1.5">
			{#if inc.blocking}
				<span class="{CHIP} bg-danger-500/20 text-danger-300" title="Blocking: these {FOCUS_META.blocking.means}">Blocking</span>
			{/if}
			<span class="{CHIP} {SEVERITY_CHIP[inc.severity].cls}" title="{SEVERITY_CHIP[inc.severity].label} severity">{SEVERITY_CHIP[inc.severity].label}</span>
			<span class="{CHIP} {PROVENANCE_CLS[inc.provenance]}" title={PROVENANCE_META[inc.provenance].means}>{PROVENANCE_META[inc.provenance].label}</span>
			<span class="{CHIP} bg-white/10 text-ink-on-dark-muted">{inc.kindLabel}</span>
		</div>
		<p class="mt-1.5 text-[12.5px] font-medium leading-tight {settled ? 'text-white/70' : 'text-white'}">{inc.title}</p>
		{#if !settled}
			<p class="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-ink-on-dark">
				<Icon name="arrow-right" size={11} class="mt-0.5 shrink-0 text-brand-300" />
				<span>{inc.nextBestAction}</span>
			</p>
		{/if}
		{#if inc.detail && inc.detail !== inc.nextBestAction}
			<details class="mt-1">
				<summary class="cursor-pointer select-none text-[10.5px] font-semibold text-white/50 transition hover:text-white">Why</summary>
				<p class="mt-1 text-[11px] leading-snug text-ink-on-dark-muted">{inc.detail}</p>
			</details>
		{/if}
		{#if settled}
			<p class="mt-2 text-[10.5px] leading-snug text-ink-on-dark-muted">
				<span class="font-semibold text-white/70">{settled.decision.status === 'wont_fix' ? "Won't fix" : 'Risk accepted'}</span>
				by {settled.decision.authorId} on {shortDate(settled.decision.decidedAt)}{settled.decision.reason ? `: ${settled.decision.reason}` : ''}
			</p>
			{#if reopeningId === inc.id}
				<div class="mt-2 space-y-1.5">
					<textarea
						bind:value={reopenReason}
						rows="2"
						placeholder="Why it is open again"
						class="w-full rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:border-brand-400 focus:outline-none"
					></textarea>
					<div class="flex items-center gap-2">
						<button type="button" disabled={decisionBusy || !reopenReason.trim()} onclick={() => decide(inc, 'reopened', reopenReason)} class="rounded-md bg-brand-500 px-2 py-1 text-[10.5px] font-semibold text-white transition hover:bg-brand-400 disabled:opacity-40">Reopen</button>
						<button type="button" onclick={() => (reopeningId = null)} class="text-[10.5px] font-semibold text-white/50 hover:text-white">Cancel</button>
					</div>
				</div>
			{:else}
				<button type="button" onclick={() => { reopeningId = inc.id; reopenReason = ''; }} class="mt-1.5 text-[10.5px] font-semibold text-white/50 transition hover:text-white">Reopen</button>
			{/if}
		{:else}
			<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
				<a
					href={inc.fixRoute}
					onclick={() => (open = false)}
					class="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300 transition hover:text-brand-200"
				>
					Fix in {inc.capabilityTitle} <Icon name="arrow-right" size={12} />
				</a>
				{#if !inc.blocking}
					<button
						type="button"
						onclick={() => { settlingId = settlingId === inc.id ? null : inc.id; reasonDraft = ''; decisionError = ''; }}
						class="text-[10.5px] font-semibold text-white/50 transition hover:text-white"
						title="Accept the risk or decide not to fix it, with a reason that is kept"
					>{settlingId === inc.id ? 'Cancel' : 'Settle'}</button>
				{/if}
			</div>
			{#if settlingId === inc.id}
				<div class="mt-2 space-y-1.5 rounded-md border border-white/10 bg-black/20 p-2">
					<p class="text-[10px] text-ink-on-dark-muted">A decision is kept with your name and the reason. It takes the gap out of the score, and it can be reopened.</p>
					<textarea
						bind:value={reasonDraft}
						rows="2"
						placeholder="Why this is acceptable"
						class="w-full rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:border-brand-400 focus:outline-none"
					></textarea>
					{#if decisionError}
						<p class="text-[10.5px] text-danger-300">{decisionError}</p>
					{/if}
					<div class="flex items-center gap-2">
						<button type="button" disabled={decisionBusy || !reasonDraft.trim()} onclick={() => decide(inc, 'accepted_risk', reasonDraft)} class="rounded-md bg-brand-500 px-2 py-1 text-[10.5px] font-semibold text-white transition hover:bg-brand-400 disabled:opacity-40">Accept the risk</button>
						<button type="button" disabled={decisionBusy || !reasonDraft.trim()} onclick={() => decide(inc, 'wont_fix', reasonDraft)} class="rounded-md border border-white/15 px-2 py-1 text-[10.5px] font-semibold text-white transition hover:bg-white/10 disabled:opacity-40">Won't fix</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
{/snippet}

{#if open}
	<aside
		class="relative z-40 flex max-w-[92vw] shrink-0 flex-col overflow-hidden border-l-2 border-brand-500/40 bg-sidebar text-ink-on-dark {dragging
			? 'select-none'
			: ''}"
		style="width:{width}px"
		aria-label="Control Center"
	>
		<!-- Left-edge drag handle: resize the rail with the mouse; arrows nudge, double-click resets.
		     A <button> keeps it keyboard-operable and interactive (no a11y noise); it's kept inside
		     the panel (the aside clips overflow) so the full strip stays grabbable. -->
		<button
			type="button"
			class="group/resize absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize touch-none p-0"
			aria-label="Resize Control Center (arrow keys to adjust, double-click to reset)"
			onpointerdown={onResizeDown}
			onpointermove={onResizeMove}
			onpointerup={onResizeUp}
			onkeydown={onResizeKey}
			ondblclick={resetWidth}
		>
			<span
				class="absolute inset-y-0 left-0 w-0.5 transition-colors {dragging
					? 'bg-brand-300'
					: 'bg-transparent group-hover/resize:bg-brand-400'}"
			></span>
		</button>

		<!-- Header: the coherence verdict (the lead reading) tints the badge, project name centre-stage -->
		<div class="sticky top-0 z-10 flex items-center gap-3 border-b border-sidebar-line bg-white/10 px-4 py-3 backdrop-blur-md">
			<span
				class="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] {headerVerdict.cls}"
			>
				<Icon name="settings" size={12} /> Control Center
			</span>
			<p class="min-w-0 flex-1 truncate text-sm font-bold text-white">{projectName}</p>
			<button
				type="button"
				onclick={() => (open = false)}
				class="grid size-7 shrink-0 place-items-center rounded-lg text-ink-on-dark-muted transition hover:bg-white/10 hover:text-white"
				aria-label="Close Control Center"
				title="Close Control Center"
			>
				<Icon name="x" size={15} />
			</button>
		</div>

		<div class="flex-1 overflow-y-auto">
			<!-- Canonical readings: Coverage, Coherence and Build Readiness (as a maturity stage). -->
			<div class="px-4 pt-4">
				<div class="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
					{#each kpis as k (k.key)}
						{@const v = verdict(k.value)}
						{@const sel = selKpi === k.key}
						<button
							type="button"
							onclick={() => (selKpi = k.key)}
							aria-pressed={sel}
							class="relative flex flex-col items-center rounded-lg p-2 text-center transition {sel ? 'bg-white/10' : 'hover:bg-white/5'}"
						>
							{#if flash && flash.key === k.key}
								<span class="absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums {flash.delta > 0 ? 'bg-success-500/25 text-success-300' : 'bg-danger-500/25 text-danger-300'}">{flash.delta > 0 ? '+' : ''}{flash.delta}</span>
							{/if}
							<div class="mb-1 flex justify-center">{@render kpiRing(k.value, k.stroke, 52, k.display)}</div>
							<div class="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] {sel ? 'text-white' : 'text-ink-on-dark-muted'}">
								{k.label}
							</div>
							<div class="text-[11px] font-bold {v.cls}">{v.label}</div>
							<div class="mt-0.5 line-clamp-3 min-h-[2.7em] text-[9.5px] leading-snug {sel ? 'text-ink-on-dark-muted' : 'text-white/40'}">{k.hint}</div>
						</button>
					{/each}
				</div>

				<!-- What was verified: the breadth of the machine's reading, and whether the proof layer is on. -->
				<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-ink-on-dark-muted">
					{#if coherence.checks.run > 0}
						<span><span class="font-bold text-white">{coherence.checks.run}</span> checks ran</span>
						<span><span class="font-bold {coherence.checks.failing === 0 ? 'text-success-300' : 'text-white'}">{coherence.checks.passing}</span> pass</span>
						{#if coherence.checks.failing > 0}
							<span><span class="font-bold text-warning-300">{coherence.checks.failing}</span> fail</span>
						{/if}
					{/if}
					{#if coherence.formalEngine}
						<span class="ml-auto inline-flex items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 {coherence.formalEngine === 'active' ? 'text-success-300' : 'text-white/50'}" title={coherence.formalEngine === 'active' ? 'Violations below marked Proven come from the Rust DPO engine.' : 'Nothing was formally proven for this analysis.'}>
							<span class="size-1.5 rounded-full {coherence.formalEngine === 'active' ? 'bg-success-400' : 'bg-white/30'}"></span>
							{FORMAL_LABEL[coherence.formalEngine]}
						</span>
					{/if}
				</div>
			</div>

			<!-- Detail panel for the selected KPI -->
			<div class="px-4 py-3">
				<div class="rounded-xl border border-white/10 bg-white/6 p-3">
					<div class="mb-2.5 flex items-center gap-2">
						<span class="size-2 rounded-full" style="background:{sk.stroke}"></span>
						<div class="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-on-dark-muted">{sk.tag}</div>
						{#if sparkPoints.length > 1}
							<span class="ml-auto inline-flex items-center gap-2" title="The last {sparkPoints.length} recorded readings, oldest to newest">
								<span class="text-[9.5px] text-white/40">since {shortDate(sparkPoints[0].at)}</span>
								{@render sparkline(sparkPoints, sk.stroke)}
							</span>
						{/if}
					</div>

					{#if selKpi === 'coverage'}
						<div class="space-y-3">
							<!-- The overall % already leads the tab ring above, so only the breakdown here.
							     Same rows (and order) as the Readiness capability list, so the two tabs
							     always name the same entries; the headline ring stays structural-only. -->
							{@render tile(capabilityRows.filter((r) => r.score < 100).length + '/' + capabilityRows.length, 'Entries to complete', 'brand')}
							<div class="space-y-2">
								{#each capabilityRows as row (row.key)}
									{@const opened = openEntry === row.key}
									{@const expandable =
										row.issues.length > 0 ||
										(row.key === 'features' && trlBreakdown.features.length > 0)}
									<div class="overflow-hidden rounded-xl border {row.score >= 100 && !expandable ? 'border-success-500/30' : 'border-white/10'} bg-white/5">
										<div class="p-2.5">
											<div class="flex items-center gap-2">
												<button
													type="button"
													onclick={() => (openEntry = opened ? null : row.key)}
													disabled={!expandable}
													aria-expanded={opened}
													class="grid size-5 shrink-0 place-items-center rounded text-white/45 transition {expandable ? 'hover:bg-white/10 hover:text-white' : 'opacity-30'}"
													aria-label={opened ? `Collapse ${row.name}` : `Expand ${row.name}`}
												>
													<Icon name="chevron-right" size={12} class={opened ? 'rotate-90 transition' : 'transition'} />
												</button>
												{#if row.href}
													<a
														href={row.href}
														onclick={() => (open = false)}
														class="w-32 shrink-0 truncate text-[11.5px] font-semibold text-ink-on-dark transition hover:text-brand-300"
														title="Go to {row.name}"
													>{row.name}</a>
												{:else}
													<span class="w-32 shrink-0 truncate text-[11.5px] font-semibold text-ink-on-dark">{row.name}</span>
												{/if}
												<div class="flex-1">{@render bar(row.score, barColor(row.score))}</div>
												<span class="w-10 shrink-0 text-right text-[11px] font-bold" style="color:{barColor(row.score)}">{row.score}%</span>
											</div>
										</div>
										{#if opened}
											<div class="space-y-1.5 border-t border-white/10 px-3 pb-3 pt-2">
												{#if row.key === 'features' && trlBreakdown.features.length > 0}
													<div class="pb-1 text-[9.5px] font-bold uppercase tracking-widest text-white/40">
														Maturity by feature
													</div>
													{#each trlBreakdown.features as feature (feature.id)}
														{@render trlListRow(
															feature.name || 'Untitled feature',
															feature.detail,
															feature.score,
															featureHref(feature.id)
														)}
													{/each}
												{/if}
												{#each row.issues as inc (inc.id)}
													{@render issueCard(inc)}
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{:else if selKpi === 'coherence'}
						<div class="space-y-3">
							{#if firstFix}
								<!-- The diagnosis: ONE thing to do now, with what it is worth and where it happens. -->
								<div class="rounded-xl border border-brand-500/40 bg-brand-500/10 p-3">
									<div class="flex items-center gap-2">
										<span class="text-[9.5px] font-bold uppercase tracking-widest text-brand-300">{focus === 'all' ? 'Do this first' : `Do this first among ${FOCUS_META[focus].label.toLowerCase()}`}</span>
									</div>
									<p class="mt-1 truncate text-[10px] font-semibold text-white/55">{firstFix.capabilityTitle}{#if firstFix.subject}<span class="mx-1 text-white/35">›</span><span class="text-white/80">{firstFix.subject}</span>{/if}</p>
									<p class="mt-1 text-[13px] font-semibold leading-tight text-white">{firstFix.title}</p>
									<p class="mt-1 text-[11px] leading-snug text-ink-on-dark">{firstFix.nextBestAction}</p>
									<div class="mt-2 flex items-center gap-2">
										{#if firstFix.blocking}<span class="{CHIP} bg-danger-500/20 text-danger-300">Blocking</span>{/if}
										<span class="{CHIP} {SEVERITY_CHIP[firstFix.severity].cls}">{SEVERITY_CHIP[firstFix.severity].label}</span>
										<span class="{CHIP} {PROVENANCE_CLS[firstFix.provenance]}" title={PROVENANCE_META[firstFix.provenance].means}>{PROVENANCE_META[firstFix.provenance].label}</span>
										<a
											href={firstFix.fixRoute}
											onclick={() => (open = false)}
											class="ml-auto inline-flex items-center gap-1 rounded-md bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-brand-400"
										>
											Fix in {firstFix.capabilityTitle} <Icon name="arrow-right" size={12} />
										</a>
									</div>
								</div>
							{/if}

							<!-- The actionable split, as lenses: each tile keeps only what it counts. -->
							<div class="grid gap-2 {sinceLastVisit?.lastSeenAt ? 'grid-cols-3' : 'grid-cols-2'}">
								{@render focusTile('blocking', blockingCount, 'danger', FOCUS_META.blocking.label, FOCUS_META.blocking.means)}
								{@render focusTile('high', highSeverityCount, 'warning', FOCUS_META.high.label, FOCUS_META.high.means)}
								{#if sinceLastVisit?.lastSeenAt}
									{@render focusTile(
										'new',
										newIds.size,
										'brand',
										`New since ${shortDate(sinceLastVisit.lastSeenAt)}`,
										sinceLastVisit.resolvedCount > 0
											? `${sinceLastVisit.resolvedCount} resolved since then`
											: FOCUS_META.new.means
									)}
								{/if}
							</div>

							{#if groups.length === 0}
								<div class="flex flex-col items-center gap-2 py-10 text-center">
									<span class="grid size-10 place-items-center rounded-full bg-success-500/15 text-success-300">
										<Icon name="check" size={20} />
									</span>
									<p class="text-sm font-medium text-white">No incoherences</p>
									<p class="text-xs text-ink-on-dark-muted">
										{coherence.checks.run > 0 ? `${coherence.checks.run} checks ran and every one of them passes.` : 'The product reads as coherent across all capabilities.'}
									</p>
								</div>
							{:else}
								<div class="space-y-1.5">
									<div class="flex items-center justify-between gap-2">
										{#if focus !== 'all'}
											<!-- Under a focus the list is flat: each card already names its place. -->
											<div class="text-[9.5px] font-bold uppercase tracking-widest text-white/40">
												{FOCUS_META[focus].label} · {focused.length} of {coherence.incoherences.length}
											</div>
											<button
												type="button"
												onclick={() => (focus = 'all')}
												class="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9.5px] font-bold text-white transition hover:bg-white/15"
											>
												<Icon name="x" size={10} /> Show all {coherence.incoherences.length}
											</button>
										{:else}
											<div class="text-[9.5px] font-bold uppercase tracking-widest text-white/40">
												{lens === 'place' ? 'By place' : 'By type'} · {coherence.incoherences.length}
											</div>
											<div class="flex rounded-md border border-white/10 bg-white/5 p-0.5">
												<button type="button" onclick={() => (lens = 'place')} aria-pressed={lens === 'place'} class="rounded px-2 py-0.5 text-[9.5px] font-bold transition {lens === 'place' ? 'bg-white/15 text-white' : 'text-ink-on-dark-muted hover:text-white'}">Place</button>
												<button type="button" onclick={() => (lens = 'type')} aria-pressed={lens === 'type'} class="rounded px-2 py-0.5 text-[9.5px] font-bold transition {lens === 'type' ? 'bg-white/15 text-white' : 'text-ink-on-dark-muted hover:text-white'}">Type</button>
											</div>
										{/if}
									</div>
									{#if focus !== 'all'}
										{#each focused as inc (inc.id)}
											{@render issueCard(inc)}
										{/each}
									{:else}
									{#each groups as g (lens + ':' + g.key)}
										{@const isO = openGroup === g.key}
										{@const t = tallyOf(g.items)}
										<div class="overflow-hidden rounded-lg border border-white/10 bg-white/5">
											<button
												type="button"
												onclick={() => (openGroup = isO ? null : g.key)}
												aria-expanded={isO}
												class="flex w-full items-center gap-2 p-2 transition hover:bg-white/8"
											>
												<Icon name="chevron-right" size={12} class={isO ? 'shrink-0 rotate-90 text-white/45 transition' : 'shrink-0 text-white/45 transition'} />
												<span class="min-w-0 flex-1 truncate text-left text-[11.5px] font-semibold text-ink-on-dark">{g.name}</span>
												{#if t.blocking > 0}
													<span class="{CHIP} bg-danger-500/20 text-danger-300">{t.blocking} blocking</span>
												{/if}
												{#if t.high > 0}
													<span class="{CHIP} bg-warning-500/20 text-warning-300">{t.high} high</span>
												{/if}
												<span class="w-6 shrink-0 text-right text-[10px] font-bold tabular-nums text-white/70">{g.items.length}</span>
											</button>
											{#if isO}
												<div class="space-y-1.5 border-t border-white/10 px-2 pb-2 pt-1.5">
													{#each g.items as inc (inc.id)}
														{@render issueCard(inc)}
													{/each}
												</div>
											{/if}
										</div>
									{/each}
									{/if}
								</div>
							{/if}

							{#if coherence.settled.length > 0}
								<!-- Out of the score, never out of sight: who decided what, and why. -->
								<div class="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
									<button
										type="button"
										onclick={() => (settledOpen = !settledOpen)}
										aria-expanded={settledOpen}
										class="flex w-full items-center gap-2 p-2 transition hover:bg-white/8"
									>
										<Icon name="chevron-right" size={12} class={settledOpen ? 'shrink-0 rotate-90 text-white/45 transition' : 'shrink-0 text-white/45 transition'} />
										<span class="min-w-0 flex-1 truncate text-left text-[11.5px] font-semibold text-ink-on-dark-muted">Settled by decision</span>
										<span class="w-6 shrink-0 text-right text-[10px] font-bold tabular-nums text-white/50">{coherence.settled.length}</span>
									</button>
									{#if settledOpen}
										<div class="space-y-1.5 border-t border-white/10 px-2 pb-2 pt-1.5">
											{#if decisionError && reopeningId}
												<p class="text-[10.5px] text-danger-300">{decisionError}</p>
											{/if}
											{#each coherence.settled as s (s.incoherence.id)}
												{@render issueCard(s.incoherence, s)}
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<div class="space-y-3">
							<p class="text-[11px] leading-relaxed text-ink-on-dark-muted">
								Build Readiness combines structural Coverage and behavior depth into the
								implementation gate, read as a spec maturity stage (Idea to Complete). Coherence
								stays independent: a well-specified product can still carry a contradiction to fix.
							</p>
							<div class="flex gap-0.5">
								{#each MATURITY_STAGES as s (s.level)}
									<div class="h-3 flex-1 rounded-sm {s.level <= readinessStage ? 'bg-brand-500' : 'bg-white/10'}" title={`${s.label} · ${s.means}`}></div>
								{/each}
							</div>

							<!-- The build gate: the same deterministic verdict finish_project reads, for people. -->
							<div class="rounded-xl border border-white/10 bg-white/5 p-2.5">
								<div class="flex items-center gap-2">
									<span class="text-[9.5px] font-bold uppercase tracking-widest text-white/40">Ready to build?</span>
									{#if gate}
										<span class="ml-auto text-[11px] font-bold {GATE_LABEL[gate.status].cls}">{GATE_LABEL[gate.status].label}</span>
									{:else if gateLoading}
										<span class="ml-auto text-[10px] text-white/40">Assessing…</span>
									{:else if gateError}
										<button type="button" onclick={loadGate} class="ml-auto text-[10px] font-semibold text-warning-300 hover:text-warning-200">{gateError} Retry</button>
									{/if}
								</div>
								{#if gate}
									{@const blockers = gate.issues.filter((i) => i.severity === 'blocking')}
									{@const warnings = gate.issues.filter((i) => i.severity === 'warning')}
									<div class="mt-2 grid grid-cols-3 gap-2">
										{@render tile(`${gate.score}%`, 'gate score', 'brand')}
										{@render tile(blockers.length, blockers.length === 1 ? 'blocker' : 'blockers', blockers.length ? 'danger' : 'success')}
										{@render tile(warnings.length, warnings.length === 1 ? 'warning' : 'warnings', warnings.length ? 'warning' : 'success')}
									</div>
									<div class="mt-2 flex flex-wrap gap-1">
										{#each gate.checks as c (c.key)}
											<span class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9.5px] font-semibold {c.passed ? 'border-success-500/30 text-success-300' : 'border-white/10 text-white/50'}" title={c.detail}>
												<span class="size-1.5 rounded-full {c.passed ? 'bg-success-400' : 'bg-white/30'}"></span>{c.label}
											</span>
										{/each}
									</div>
									{#if blockers.length > 0 || warnings.length > 0}
										<ul class="mt-2 space-y-1">
											{#each [...blockers, ...warnings].slice(0, 8) as issue, i (issue.code + ':' + i)}
												<li class="flex items-start gap-1.5 text-[11px] leading-snug text-ink-on-dark">
													<span class="mt-1.5 size-1.5 shrink-0 rounded-full {issue.severity === 'blocking' ? 'bg-danger-500' : 'bg-warning-500'}"></span>
													<span>{issue.message}</span>
												</li>
											{/each}
											{#if blockers.length + warnings.length > 8}
												<li class="text-[10px] text-white/40">and {blockers.length + warnings.length - 8} more</li>
											{/if}
										</ul>
									{:else}
										<p class="mt-2 text-[11px] text-success-300">Every gate check passes. The project can be finished.</p>
									{/if}
								{/if}
							</div>

							<div class="space-y-1.5">
								<!-- One reading, three groupings: Core leads (the tree's structure),
								     Feature and Release re-read the per-leaf maturity along the roadmap. -->
								<div class="flex items-center justify-between gap-2">
									<div class="text-[9.5px] font-bold uppercase tracking-widest text-white/40">{trlAxisMeta.heading}</div>
									<div class="flex rounded-md border border-white/10 bg-white/5 p-0.5">
										{#each TRL_AXES as axis (axis.key)}
											<button
												type="button"
												onclick={() => (trlAxis = axis.key)}
												aria-pressed={trlAxis === axis.key}
												class="rounded px-2 py-0.5 text-[9.5px] font-bold transition {trlAxis === axis.key
													? 'bg-white/15 text-white'
													: 'text-ink-on-dark-muted hover:text-white'}"
											>{axis.label}</button>
										{/each}
									</div>
								</div>
								{#if trlAxis === 'core'}
									{#if trlBreakdown.cores.length === 0}
										{@render trlEmpty('No core features yet. Structure the feature tree to read maturity per core.')}
									{:else}
										{#each trlBreakdown.cores as row (row.id)}
											{@render trlListRow(
												row.name || 'Untitled core',
												`${row.featureCount} feature${row.featureCount === 1 ? '' : 's'}`,
												row.score,
												featuresHref
											)}
										{/each}
									{/if}
								{:else if trlAxis === 'feature'}
									{#if trlBreakdown.features.length === 0}
										{@render trlEmpty('No leaf features yet. Create one to measure its behavior maturity.')}
									{:else}
										{#each trlBreakdown.features as row (row.id)}
											{@render trlListRow(
												row.name || 'Untitled feature',
												row.detail,
												row.score,
												featureHref(row.id)
											)}
										{/each}
									{/if}
								{:else if trlBreakdown.releases.length === 0}
									{@render trlEmpty('No releases yet. Plan the roadmap to read maturity per release.')}
								{:else}
									{#each trlBreakdown.releases as row (row.id)}
										{@render trlListRow(
											row.id === UNPLANNED_RELEASE_ID ? 'Unplanned' : row.name || 'Untitled release',
											[row.detail, `${row.featureCount} feature${row.featureCount === 1 ? '' : 's'}`]
												.filter(Boolean)
												.join(' · '),
											row.score,
											featuresHref
										)}
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</aside>
{/if}
