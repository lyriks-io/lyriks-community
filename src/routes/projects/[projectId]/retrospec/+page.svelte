<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { navigating } from '$app/state';
	import { page } from '$app/state';
	import { AI_ACTIVITY_EVENT, PROJECT_ACTIVITY_ID, type AiActivity } from '$lib/shared/ai-activity';
	import { DEFAULT_DOCS_LOCATION, RETROSPEC_PHASES, resumeRetrospecPrompt, runPaused, type DocsLocation, type Finding, type PhaseState, type RetrospecMode, type RetrospecScope, type RetrospecStatusKind } from '$domain/retrospec';
	import { withSilence } from '$domain/retrospec/run-history';
	import { celebrationLine, liveTitle, readingEnd, relaunchOffered, relaunchQuestion, reverseLead, runReach, scopeLine } from '$domain/retrospec/reverse-page';
	import { aiSessionSlot } from '$ui/ai-session/ai-session-slot.svelte';
	import { OptimisticActs } from '$ui/evolution/optimistic-acts.svelte';
	import { SaveQueue } from '$ui/shell/save-queue';
	import { Button, confirmDialog, pushToast } from '$ui/design-system';
	import PageFrame from '$ui/shell/PageFrame.svelte';
	import ProblemSheet from '$ui/retrospec/ProblemSheet.svelte';
	import RetroRunning from '$ui/retrospec/RetroRunning.svelte';
	import RetroSource from '$ui/retrospec/RetroSource.svelte';
	import RetroStart from '$ui/retrospec/RetroStart.svelte';
	import RetroSteps, { type RetroStepKey } from '$ui/retrospec/RetroSteps.svelte';
	import RetroSummary from '$ui/retrospec/RetroSummary.svelte';
	import RetroDelta from '$ui/retrospec/RetroDelta.svelte';
	import RetroHistory from '$ui/retrospec/RetroHistory.svelte';
	import ScopeDrawer from '$ui/spec360/overview/ScopeDrawer.svelte';
	import RetroCelebration from '$ui/retrospec/RetroCelebration.svelte';
	import { sendRetrospecActs } from '$ui/retrospec/review.svelte';
	import { retrospecLiveKey } from '$ui/retrospec/live-key';
	import type { PageData } from './$types';

	/**
	 * The Retrospecification: where the person's AI starts from (the code, the
	 * documentation, or both), the analysis followed live while it writes, then
	 * the summary of what it rebuilt. Every element is then validated in the
	 * Specification 360°, which this page opens. It is the one place of the
	 * product's runs (criterion 2dbed801, design v3): their history under the
	 * run, and once the last one is validated, Relaunch the analysis.
	 *
	 * Each act of the person reads at once (the next step, the source chosen)
	 * and is saved behind, one after the other; a refusal puts
	 * the page back as it stood and says why.
	 */
	let { data }: { data: PageData } = $props();

	const queue = new SaveQueue();
	/** Where the run stands and its source, as the acts on their way leave them. */
	const statusActs = new OptimisticActs<RetrospecStatusKind>();
	const modeActs = new OptimisticActs<RetrospecMode>();
	const reading = () => data;

	const status = $derived(statusActs.of('run') ?? data.status.status);
	const run = $derived(data.run);
	const mode = $derived<RetrospecMode>(modeActs.of('mode') ?? run?.mode ?? 'repo');
	const finished = $derived(data.analysis.finished || status === 'bilan' || status === 'review' || status === 'done');

	// ── Where the page stands: the step the run reached, the one shown ────────
	const reached = $derived<RetroStepKey>(status === 'source' ? 'source' : 'analysis');
	const order: RetroStepKey[] = ['source', 'analysis'];
	const asked = $derived(page.url.searchParams.get('step') as RetroStepKey | null);
	const step = $derived<RetroStepKey>(asked && order.includes(asked) && order.indexOf(asked) <= order.indexOf(reached) ? asked : reached);
	/** The person watched the analysis run here: when it completes, it says so before the summary opens. */
	let watched = $state(false);
	$effect(() => {
		if (status === 'running' && step === 'analysis') untrack(() => (watched = true));
	});
	const view = $derived.by((): 'start' | 'source' | 'running' | 'summary' => {
		if (status === 'start') return 'start';
		if (step === 'source') return 'source';
		return status === 'running' || (status === 'bilan' && watched) ? 'running' : 'summary';
	});

	function scrollTop() {
		document.getElementById('app-scroll')?.scrollTo({ top: 0, behavior: 'auto' });
	}
	async function go(params: Record<string, string | null>, top = true) {
		const url = new URL(page.url);
		for (const [k, v] of Object.entries(params)) {
			if (v === null) url.searchParams.delete(k);
			else url.searchParams.set(k, v);
		}
		await goto(url, { replaceState: false, noScroll: true, keepFocus: true });
		if (top) scrollTop();
	}
	const goStep = (s: RetroStepKey) => {
		if (s === 'analysis' && status !== 'running') watched = false;
		// The step the run reached needs no address: the page then follows the run on to the next one (criterion a6f870af).
		return go({ step: s === reached ? null : s });
	};

	// ── The run's acts: shown at once, saved behind in order ────────────────
	const act = (acts: Record<string, unknown>[], what: string) => () => queue.run(() => sendRetrospecActs(data.projectId, acts, what));
	/** Moves the run on at once (saved after a move still on its way); a second click on the same move sends nothing more. */
	function moveRun(to: RetrospecStatusKind, acts: Record<string, unknown>[], what: string): Promise<boolean> {
		if (statusActs.of('run') === to) return Promise.resolve(false);
		return statusActs.run('run', to, act(acts, what), reading);
	}
	function start() {
		void moveRun('source', [{ op: 'start', mode: 'repo' }], 'Starting the Reverse-Specification');
		void go({ step: null });
	}
	const chooseMode = (m: RetrospecMode) => m !== mode && void modeActs.run('mode', m, act([{ op: 'choose_mode', mode: m }], 'Your choice of source'), reading);
	// What a later run reads, shown at once and saved behind (criterion 98612117).
	const scopeActs = new OptimisticActs<RetrospecScope>();
	const scope = $derived<RetrospecScope>(scopeActs.of('scope') ?? data.complementary?.scope ?? 'delta');
	const complementary = $derived(data.complementary ? { ...data.complementary, scope } : null);
	// Nothing this run found is in the specification yet (criterion 50b00229).
	const held = $derived(data.held);
	const mismatchHref = $derived(`/projects/${encodeURIComponent(data.projectId)}/drift`);
	// How much of the product this run reads, said from its source step to its summary (criterion 25254e5a).
	const reach = $derived(runReach(complementary ?? run?.complementary));
	const chooseScope = (s: RetrospecScope) => s !== scope && void scopeActs.run('scope', s, act([{ op: 'choose_scope', scope: s }], 'Your choice of what the run reads'), reading);
	// Where the documentation is, shown at once and saved behind (criterion b6ad9ca2).
	const docsActs = new OptimisticActs<DocsLocation>();
	const docsAt = $derived<DocsLocation>(docsActs.of('docs') ?? run?.docsAt ?? DEFAULT_DOCS_LOCATION);
	const chooseDocs = (at: DocsLocation) => void docsActs.run('docs', at, act([{ op: 'choose_docs', ...at }], 'Where the documentation is'), reading);
	async function endAnalysis() {
		const ok = await confirmDialog({
			title: 'Close the analysis?',
			message: 'Your LLM normally ends with its final check. Close it now only if it stopped: you validate what it wrote so far.',
			confirmLabel: 'Close the analysis'
		});
		if (!ok) return;
		// The person closed it: the summary opens at once, no "complete" toast for their own act.
		watched = false;
		selfEnded = true;
		void go({ step: 'analysis' });
		if (!(await moveRun('bilan', [{ op: 'end_analysis' }], 'Closing the analysis'))) selfEnded = false;
	}

	/**
	 * Starts the next run once the analysis of the last one is over (action
	 * e296dd4f): a complementary run that erases nothing, asked first since what
	 * it changes goes back to validation and a last run not validated closes,
	 * then shown on its source step, where what it reads is chosen. The question
	 * says what it reads by default, the same rule as Mismatch (EVO-014).
	 */
	async function relaunch() {
		const question = data.relaunch ?? relaunchQuestion(data.next, status !== 'done');
		if (!(await confirmDialog({ ...question, confirmLabel: 'Launch' }))) return;
		watched = false;
		void moveRun('source', [{ op: 'start', mode: 'repo' }], 'Launching the Reverse-Specification');
		void go({ step: null });
	}

	/**
	 * Takes the run back as if it never started (criterion 0ec7551b): a later run
	 * leaves the specification as it stands, with what its AI already wrote, and
	 * opens its Overview; a first run, cancelled before its prompt runs, goes back
	 * to the start of the Reverse-Specification.
	 */
	async function cancelRun() {
		const read = status !== 'source';
		const ok = await confirmDialog({
			title: 'Cancel this Reverse-Specification?',
			message: held && read
				? 'Nothing was written in the specification: what your AI found is dropped. Stop your AI in its own window.'
				: read
				? 'What your AI already wrote stays in the specification: nothing is erased, and the next run reads it. Stop your AI in its own window.'
				: 'Nothing was read yet: the product stays as it stands.',
			confirmLabel: 'Cancel the run',
			cancelLabel: 'Keep it'
		});
		if (!ok) return;
		const later = !!run?.complementary;
		if (!(await act([{ op: 'cancel' }], 'Cancelling the Reverse-Specification')())) return;
		pushToast({ level: 'success', message: 'Reverse-Specification cancelled' });
		if (later) await goto(`/projects/${encodeURIComponent(data.projectId)}/spec`);
		else await go({ step: null });
	}

	/**
	 * On to the Specification 360°, where every element is validated, edited or
	 * discussed: it opens at once, while the review is recorded as started behind
	 * (the Specification 360° needs nothing more to validate; a refusal says so).
	 */
	function openSpec() {
		const specHref = `/projects/${encodeURIComponent(data.projectId)}/spec`;
		// What this run found is decided on Mismatch, before anything is written (criterion 50b00229).
		if (held) return void goto(mismatchHref);
		if (status === 'done') return void goto(specHref);
		if (data.canWrite && status === 'bilan') void moveRun('review', [{ op: 'start_review', total: 0 }], 'Starting the review');
		pushToast({ level: 'success', message: 'Knowledge is ready: validate, edit or comment each element' });
		void goto(specHref);
	}

	// ── Live: the AI's calls on the project, followed as they come ──────────
	let aiSeenAt = $state<string | null>(null);
	let lastWritten = $state<string | null>(null);
	let now = $state(Date.now());
	const seenAt = $derived(aiSeenAt ?? data.analysis.aiLastSeenAt);
	let greeted = false;
	$effect(() => {
		const projectId = data.projectId;
		let timer: ReturnType<typeof setTimeout> | null = null;
		// The page re-reads at most this often while the AI works: a burst of calls costs one reload.
		const THROTTLE_MS = 3000;
		// A re-read replaces SvelteKit's navigation token: while a page is being opened it waits, so a live update never
		// interrupts it (criterion 6787a611), as the app's live sync does.
		const reread = () => {
			timer = null;
			if (navigating.to !== null) {
				timer = setTimeout(reread, THROTTLE_MS);
				return;
			}
			void invalidate(retrospecLiveKey(projectId));
		};
		const onActivity = (event: Event) => {
			const { detail } = event as CustomEvent<AiActivity>;
			if (detail.requestId !== PROJECT_ACTIVITY_ID) return;
			aiSeenAt = new Date().toISOString();
			now = Date.now();
			if (detail.act === 'write' && detail.section) lastWritten = detail.section;
			if (!greeted && (status === 'source' || status === 'running')) {
				greeted = true;
				pushToast({ level: 'success', message: `Your LLM connected to ${data.productName} via the Lyriks MCP` });
			}
			if (timer === null) timer = setTimeout(reread, THROTTLE_MS);
		};
		window.addEventListener(AI_ACTIVITY_EVENT, onActivity);
		// Fine enough for the LLM pill to turn from working to connected on time.
		const tick = setInterval(() => (now = Date.now()), 10_000);
		return () => {
			window.removeEventListener(AI_ACTIVITY_EVENT, onActivity);
			clearInterval(tick);
			if (timer !== null) clearTimeout(timer);
		};
	});
	// The prompt that reconnects the person's LLM: a run is launched only once its LLM called, so it resumes where it stopped, written or not (ac-ai-session-disconnected).
	const relaunchPrompt = $derived(resumeRetrospecPrompt(mode, data.productName, data.projectId, docsAt, held));
	// While the analysis runs, the chip of the top bar reads its LLM when no session speaks for the AI.
	$effect(() => {
		aiSessionSlot.run = view === 'running' && !finished ? { seenAt, now } : null;
		return () => {
			aiSessionSlot.run = null;
		};
	});

	// The analysis completing under the person's eyes says so once, unless they closed it themselves.
	let lastStatus: string | null = null;
	let selfEnded = false;
	$effect(() => {
		const current = status;
		untrack(() => {
			if (lastStatus === 'running' && current === 'bilan' && !selfEnded) void showSummary();
			// The AI has the prompt: the analysis takes the place of the source step, read from its top (criterion a6f870af).
			if (lastStatus === 'source' && current === 'running') scrollTop();
			lastStatus = current;
		});
	});
	async function showSummary() {
		watched = false;
		await go({ step: 'analysis' });
	}

	/** The phases as the page shows them: the one the AI just wrote reads in progress. */
	const phases = $derived.by(() => {
		const list = data.analysis.phases;
		// A behaviour batch is the features phase at work (actions and rules), though no section names it.
		const written = lastWritten?.split('.')[0] ?? null;
		const section = written === 'behavior' ? 'features' : written;
		const live = section ? RETROSPEC_PHASES.findIndex((p) => p.sections.includes(section)) : -1;
		if (live < 0 || list[live]?.state === 'done' || data.analysis.finished) return list;
		return list.map((p, i): (typeof list)[number] => ({ ...p, state: (i === live ? 'current' : p.state === 'current' ? (p.share > 0 ? 'started' : 'pending') : p.state) as PhaseState }));
	});

	let finding = $state<Finding | null>(null);

	// ── The end of the analysis is celebrated once per run, however the person arrives at it ──
	const celebratedKey = $derived(`lyriks.retrospec.celebrated:${data.projectId}:${data.run?.id ?? 'implicit'}`);
	let celebrated = $state(true);
	$effect(() => {
		const key = celebratedKey;
		untrack(() => {
			try {
				celebrated = localStorage.getItem(key) === '1';
			} catch {
				celebrated = true;
			}
		});
	});
	// Only a run Lyriks carried to its final check is celebrated as complete (criterion a05bca06).
	const checked = $derived(data.analysis.checkedAt !== null);
	const celebrating = $derived(status === 'bilan' && checked && !celebrated);
	/** How far the reading went, as the head of the summary says it (criterion a05bca06). */
	const readTo = $derived(
		readingEnd({
			productName: data.productName,
			mode,
			reach,
			checked,
			pct: data.analysis.pct,
			closed: !!run?.analysisEndedAt,
			closedBy: run?.analysisEndedBy?.name ?? null
		})
	);
	function closeCelebration() {
		celebrated = true;
		try {
			localStorage.setItem(celebratedKey, '1');
		} catch {
			// Private browsing: it shows again next time, nothing worse.
		}
		void showSummary();
	}
	const title = $derived(status === 'start' ? 'Reverse-Specification' : `Reverse-Specification · ${data.productName}`);
	// What the page does, from where its runs read (criterion 2dbed801).
	const lead = $derived(reverseLead(data.productName, data.runs[0]?.mode ?? mode, reach));
	// The run under way reads paused in the history while its LLM is silent (criterion 7a4a99e4).
	const history = $derived(withSilence(data.runs, status === 'running' && !finished && runPaused(seenAt, now)));
	let scopeOpen = $state(false);
</script>

<svelte:head>
	<title>{data.productName} · Reverse-Specification · Lyriks</title>
</svelte:head>

<PageFrame>
	<header class="sticky top-0 z-20 -my-3 flex items-center gap-3 bg-evo-page/96 py-3 backdrop-blur-[6px]" data-sticky-head>
		<h1 class="m-0 min-w-0 flex-1 text-[1.75rem] leading-[1.15] font-bold tracking-[-0.03em] text-ink">{title}</h1>
		{#if data.canWrite && data.cancellable}
			<Button variant="ghost" size="sm" title="Take this run back as if it never started" onclick={cancelRun}>Cancel this run</Button>
		{/if}
	</header>

	{#if view !== 'start'}
		<p class="m-0 text-[0.9375rem] leading-normal text-evo-ink-2">{lead}</p>
		<RetroSteps {reached} current={step} {finished} onGo={goStep} />
	{/if}

	{#if view === 'start'}
		<RetroStart canWrite={data.canWrite} onStart={start} fromScratch={data.fromScratch ? data.productName : null} />
		<!-- No run yet: the History holds an approved scope alone (criterion bccbfdb5). -->
		<RetroHistory runs={[]} scope={data.scope} onScope={() => (scopeOpen = true)} />
	{:else if view === 'source'}
		<RetroSource
			projectId={data.projectId}
			productName={data.productName}
			{mode}
			mcpUrl={data.mcpUrl}
			canWrite={data.canWrite}
			aiSeenAt={seenAt}
			{now}
			onMode={chooseMode}
			{docsAt}
			onDocs={chooseDocs}
			{complementary}
			onScope={chooseScope}
		/>
	{:else}
		<RetroRunning
			productName={data.productName}
			reading={liveTitle(data.productName, mode, reach)}
			scope={scopeLine(mode, reach, held)}
			later={reach.kind !== 'first'}
			{phases}
			pct={data.analysis.pct}
			started={data.analysis.started}
			{finished}
			found={data.analysis.found}
			log={data.analysis.log}
			aiSeenAt={seenAt}
			{now}
			{relaunchPrompt}
			canWrite={data.canWrite}
			summary={view === 'summary' ? { code: data.summary.code.pct, traced: data.summary.traced.pct, reading: readTo } : null}
			onEnd={endAnalysis}
			onSummary={showSummary}
		/>
		{#if view === 'summary'}
			{#if data.summary.delta}<RetroDelta projectId={data.projectId} delta={data.summary.delta} goesBack={status !== 'done' && !held} reportHref={status === 'done' ? null : mismatchHref} />{/if}
			<RetroSummary
				findings={data.summary.findings}
				health={data.summary.health}
				validated={status === 'done'}
				openLabel={held ? 'Review on Mismatch →' : null}
				onFinding={(f) => (finding = f)}
				onOpenSpec={openSpec}
				onRelaunch={relaunchOffered(data.canWrite, status) ? () => void relaunch() : null}
			/>
		{/if}
		<RetroHistory runs={history} scope={data.scope} onScope={() => (scopeOpen = true)} />
	{/if}
</PageFrame>

{#if data.scope}
	<!-- An approved scope opens from its row of the History, as from the Overview (criterion bccbfdb5). -->
	<ScopeDrawer open={scopeOpen} onClose={() => (scopeOpen = false)} view={data.scope} projectId={data.projectId} canApprove={data.canWrite} />
{/if}

{#if finding}
	<ProblemSheet {finding} onClose={() => (finding = null)} />
{/if}

{#if celebrating}
	<RetroCelebration
		line={celebrationLine(data.productName, mode, reach, data.summary.code.pct, held)}
		next={held ? { line: 'Next: decide each change on Mismatch, beside what the specification says today.', label: 'Review on Mismatch →' } : null}
		delta={data.summary.delta}
		counts={data.summary.counts}
		unconfirmed={data.summary.unconfirmed}
		onClose={closeCelebration}
		onOpenSpec={openSpec}
	/>
{/if}
