<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import Gauge from '$ui/design-system/Gauge.svelte';
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import { untrack, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Icon, floatInView, hoverWithin, pushToast } from '$ui/design-system';
	import type { DossierReading, HistoryPart, ReportPart } from '$lib/server/evolution-view.server';
	import { AI_ACTIVITY_EVENT, type AiActivity } from '$lib/shared/ai-activity';
	import { aiCallWords, buildFiles, buildPackages, buildProgress, buildStatus, codePlaceOf, briefSubject, briefToCopy, isRequirement, lineLabels, ownLines, readLine, requirementParts } from './report-board';
	import CodePlace from '$ui/spec360/CodePlace.svelte';
	import BlockControls, { type ValidateControl } from './BlockControls.svelte';
	import LineCodeSource from './LineCodeSource.svelte';
	import { useLiveSession } from './live-session.svelte';
	import { FOOT_BAR, KICKER, PRIMARY_48, SECONDARY_44, SECONDARY_48, SECTION_TITLE, numberPill } from './evo-look';
	import ImplementationWaitingCard from './ImplementationWaitingCard.svelte';
	import CodeBranchCard from './CodeBranchCard.svelte';
	import EditorialNote from './EditorialNote.svelte';
	import { implementationNote, noteReadKey } from './editorial-note';
	import { scrollToBlock } from './evo-scroll';
	import { applyEvolution } from './reading-api';
	import { springEasing } from '$ui/design-system/spring-easing';
	import { fillToScrollerFoot } from '$ui/shell/fit-in-scroller';

	/**
	 * Step 5, Implementation, the way the design walks it, on what the platform
	 * really reads: it waits for the go-ahead of the impact analysis; once the
	 * version is frozen, the person says who develops it (their LLM, with the
	 * brief to hand it, or themselves, with the checklist); then every
	 * requirement moves from pending to what the code shows as the index is
	 * synced, the page re-reading the request after each sync. Nothing here runs
	 * on a timer, and nothing counts what the platform does not see (commits).
	 * The requirements read as packages, one per feature, the ones still moving
	 * on top, each line saying why it is open and what closes it; the status
	 * says what is really happening, and with a session of the person's own the
	 * build goes to their AI in one click instead of a pasted brief.
	 */
	type Report = NonNullable<ReportPart['report']>;
	interface Props {
		projectId: string;
		dossier: DossierReading;
		report: Report | null;
		history: HistoryPart['history'];
		/** Opens Verification, then the Simulation where the impact is decided. */
		onReport: () => void;
		onImpact: () => void;
		// Still passed by the page; the design has no place for them on this step.
		canEdit?: boolean;
		/** The roster, so the card of the code names who approved. */
		members?: readonly { id: string; name: string }[];
		testKit?: Snippet;
		gate?: Snippet;
	}
	let { projectId, dossier, report, history, onReport, onImpact, canEdit = false, members = [] }: Props = $props();

	const frozen = $derived(dossier.stage === 'implementation' || dossier.stage === 'acceptance' || dossier.stage === 'delivered');
	const own = $derived(ownLines(report?.lines ?? []));
	const asked = $derived(own.filter(isRequirement));
	const labels = $derived(lineLabels(own));
	const progress = $derived(buildProgress(report?.lines ?? []));
	const packages = $derived(buildPackages(report?.lines ?? []));
	const files = $derived(buildFiles(report?.lines ?? []));
	const live = useLiveSession();

	/**
	 * The person's AI at work through the MCP, with or without a session: each
	 * call it makes on the request or the project reaches the page live, so the
	 * status and the log follow it while it reads, writes and syncs. Nothing of
	 * it is saved; what lasts is the reading of the code each sync leaves.
	 */
	// Provisional, as on the request page: how long the AI counts as at work after its last call.
	const AI_PRESENCE_MS = 30_000;
	/** Calls of one kind within this of each other read as one line of the log. */
	const CALL_BURST_MS = 10_000;
	let calls = $state<{ at: string; until: string; words: string }[]>([]);
	let lastCallAt = $state<number | null>(null);
	let nowTick = $state(Date.now());
	$effect(() => {
		const requestId = dossier.id;
		const onActivity = (event: Event) => {
			const words = aiCallWords((event as CustomEvent<AiActivity>).detail, requestId);
			if (!words) return;
			const at = new Date().toISOString();
			lastCallAt = nowTick = Date.now();
			const last = calls.at(-1);
			calls =
				last && last.words === words && Date.parse(at) - Date.parse(last.until) <= CALL_BURST_MS
					? [...calls.slice(0, -1), { ...last, until: at }]
					: [...calls, { at, until: at, words }].slice(-20);
		};
		window.addEventListener(AI_ACTIVITY_EVENT, onActivity);
		const tick = setInterval(() => (nowTick = Date.now()), 2000);
		return () => {
			window.removeEventListener(AI_ACTIVITY_EVENT, onActivity);
			clearInterval(tick);
		};
	});
	const mcpActive = $derived(lastCallAt !== null && nowTick - lastCallAt < AI_PRESENCE_MS);
	const lastCallSaid = $derived.by(() => {
		const last = calls.at(-1);
		if (!last || lastCallAt === null) return null;
		const ago = Math.max(0, Math.round((nowTick - lastCallAt) / 1000));
		return `Lyriks ${last.words}${ago < 3 ? ', just now' : `, ${ago} s ago`}.`;
	});

	/** A package whose standing moved at the last reading of the code glows for a moment, so a change never goes unseen. */
	const MOVED_MS = 6000;
	let movedAt = $state<Record<string, number>>({});
	let seenStanding: Map<string, string> | null = null;
	$effect(() => {
		const standing = new Map(packages.map((p) => [p.name, `${p.open}:${p.settled}:${p.total}`]));
		const before = seenStanding;
		seenStanding = standing;
		if (!before) return;
		const moved = [...standing].filter(([name, s]) => before.get(name) !== s).map(([name]) => name);
		if (moved.length === 0) return;
		const at = Date.now();
		movedAt = { ...untrack(() => movedAt), ...Object.fromEntries(moved.map((name) => [name, at])) };
		nowTick = at;
	});
	const justMoved = (name: string) => movedAt[name] !== undefined && nowTick - movedAt[name] < MOVED_MS;
	/** What the impact analysis still waits for: every point that does not fit and carries no accepted risk. */
	const misfits = $derived(dossier.docking.points.filter((p) => p.qualification !== 'fits'));
	const undecided = $derived(misfits.filter((p) => !p.risk));
	const taken = $derived(misfits.filter((p) => p.risk));
	const waiting = $derived(
		undecided.length > 0
			? `${undecided.length} decision(s) remain to be made (${undecided.map((p) => p.label).join(', ')}) before the evolution can be developed safely.`
			: dossier.gate.next === 'implementation' && dossier.gate.ok
				? 'All decisions are made: the evolution can move into development.'
				: (dossier.gate.reason ?? 'The impact analysis has not handed the evolution to implementation yet.')
	);

	type Who = 'llm' | 'self';
	let who = $state<Who>('llm');
	/** Following the build: chosen here, or already under way once the code has been read at least once. */
	let following = $state(untrack(() => own.some((l) => l.verdict !== 'missing' || l.decision !== 'undecided')));
	const projectName = $derived((page.data as { projectName?: string }).projectName ?? projectId);
	/** The branch the briefs name, once the project names a deployment branch (feat-evo-code-branch). */
	const branchOf = (d: DossierReading) => (d.code ? { name: d.code.expectedBranch, deploymentBranch: d.code.deploymentBranch, bound: !!d.code.branch } : null);
	const key = $derived(dossier.key ?? 'EVO');
	/** What the briefs say about the request: the version it hands out, and the one in correction (EVO-012). */
	const subject = $derived(briefSubject(dossier, { id: projectId, name: projectName }, branchOf(dossier)));
	const brief = $derived(
		briefToCopy(
			'whole',
			subject,
			report?.lines ?? [],
			taken.map((p) => ({ label: p.label, reason: p.risk?.reason ?? '' }))
		)
	);
	/** What is still open, for the AI to finish from where the build stands. */
	const remaining = $derived(briefToCopy('open_points', subject, report?.lines ?? []));
	const inSession = $derived(live?.isOpen ?? false);
	const buildClick = $derived(live?.buildClick ?? null);
	const aiOnBuild = $derived(buildClick?.state === 'waiting' || buildClick?.state === 'taken' ? buildClick.state : null);
	let sending = $state(false);
	/** Hands the build to the person's AI in session; without one, the brief is copied to paste. */
	async function sendToAi(text: string) {
		if (!live || sending) return;
		sending = true;
		try {
			if (await live.sendBuild(text)) following = true;
		} finally {
			sending = false;
		}
	}
	let copied = $state(false);
	async function copyBrief() {
		try {
			await navigator.clipboard.writeText(brief.text);
			copied = true;
			pushToast({ level: 'success', message: brief.copied });
		} catch {
			pushToast({ level: 'error', message: 'The clipboard is not available here.' });
		}
	}
	function follow() {
		following = true;
		pushToast({ level: 'info', message: who === 'llm' ? 'Tracking enabled: Lyriks reads the code each time your LLM syncs the index' : 'Tracking enabled: Lyriks reads the code each time the index is synced' });
	}

	/** What the report still asks of the code or of a person once every requirement is read. */
	const gaps = $derived(own.filter((l) => !readLine(l, { specVersion: dossier.specVersion }).resolved).length);
	// Said once, when the last requirement is tested or ruled out while the page is open.
	let wasFinished = untrack(() => progress.finished);
	$effect(() => {
		const finished = progress.finished;
		if (finished && !wasFinished)
			pushToast({
				level: gaps > 0 ? 'warn' : 'success',
				message:
					dossier.iteration > 1 ? `Corrections verified: cycle report ${dossier.iteration} ready` : `Implementation complete: Lyriks found ${gaps} ${gaps === 1 ? 'gap' : 'gaps'}`,
				action: { label: 'View verification', run: onReport }
			});
		wasFinished = finished;
	});

	/** Every package reads folded, its bar and what it still misses in sight, until the person opens it. */
	let toggled = $state<Record<string, boolean>>({});
	const isOpen = (name: string) => toggled[name] ?? false;
	// The line whose sources are open under it, one at a time, as on a feature (criterion 2670dc31).
	let sourcesOpen = $state<string | null>(null);

	/**
	 * The verification and the log behave like the feature tree of the
	 * Specification 360: they always end a margin above the page's foot and
	 * grow as the page scrolls up, until they reach the whole height in view
	 * under the request's title; each scrolls on its own under a title that
	 * stays in view. The log is folded away until STATUS opens it; it then
	 * slides in beside the verification, which yields its width (owner, 2026-10-29).
	 */
	let panes = $state<HTMLDivElement>();
	let panesHeight = $state(560);
	let logWidth = $state(380);
	let logOpen = $state(false);
	let logMotion = $state<{ easing: string; duration: number } | null>(null);
	// Provisional, tuned on sight: tall enough to read a few packages on a small screen.
	const PANES_MIN = 360;
	const LOG_GAP = 16;
	$effect(() => {
		const row = panes;
		const scroller = document.getElementById('app-scroll');
		if (!row || !scroller) return;
		// A soft spring that barely overshoots, the way the rest of the redesign moves; none where motion is reduced.
		logMotion = matchMedia('(prefers-reduced-motion: reduce)').matches ? null : springEasing({ omega: 15, zeta: 0.86 });
		const measure = () => {
			const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
			// What the page keeps below the panes (its end padding): the margin above the foot.
			const below = Math.max(0, scroller.scrollHeight - (top + row.offsetHeight));
			// Always the whole height in view, never what happens to be left under the tiles: one scroll of the page
			// brings them between the request's title, which stays on top, and the margin above its foot (owner, 2026-10-29).
			const head = document.getElementById('evo-head')?.getBoundingClientRect().height ?? 0;
			const fit = Math.max(PANES_MIN, Math.floor(scroller.clientHeight - below - head - LOG_GAP));
			if (fit !== panesHeight) panesHeight = fit;
			const width = Math.min(380, Math.round(row.clientWidth * 0.42));
			if (width !== logWidth) logWidth = width;
		};
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(scroller);
		if (row.parentElement) watch.observe(row.parentElement);
		const head = document.getElementById('evo-head');
		if (head) watch.observe(head);
		return () => watch.disconnect();
	});
	/** The log entries that came while it was folded, counted on the link that opens it. */
	let logSeenAt = $state(untrack(() => new Date().toISOString()));
	function toggleLog() {
		logOpen = !logOpen;
		logSeenAt = new Date().toISOString();
	}

	/** A line only a person settles (a table change the index cannot locate): validated where it is read. */
	async function validateLine(lineId: string) {
		savingLine = lineId;
		try {
			await applyEvolution(projectId, [{ op: 'decide_line', requestId: dossier.id, lineId, decision: 'validated' }], { what: 'the validation of the line' });
		} finally {
			savingLine = null;
		}
	}
	let savingLine = $state<string | null>(null);
	/** The reader's own box on a line Yours to validate, the only way to validate it (criterion f27ab2f8). */
	const lineValidation = (lineId: string, title: string): ValidateControl => ({
		saving: savingLine === lineId,
		what: title,
		look: 'grey',
		title: 'Validate this line',
		run: () => void validateLine(lineId),
		stamps: [],
		settled: false
	});
	/** Opens the package holding the first line that waits for a person, and brings it into view in the verification. */
	function showLineForYou() {
		const pkg = packages.find((p) => p.lines.some((r) => r.read.state === 'yours'));
		if (!pkg) return;
		toggled = { ...toggled, [pkg.name]: true };
		requestAnimationFrame(() => document.getElementById(packageAnchor(pkg.name))?.scrollIntoView({ block: 'nearest', behavior: scrollMotion() }));
	}
	const packageAnchor = (name: string) => `dev-pkg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

	/** Once every requirement is read against the code, what Lyriks read is summed up first (ac-evo-form-step-note). */
	const note = $derived(
		implementationNote({
			key,
			finished: progress.finished,
			requirements: progress.total,
			files: progress.files,
			additions: own
				.filter((l) => l.verdict === 'out_of_scope')
				.map((l) => ({ label: labels.get(l.id) ?? '', title: requirementParts(l.requirement).title, decided: l.decision !== 'undecided' })),
			// The verification is validated once the request crossed into the acceptance testing (ac-evo-form-step-note).
			verified: dossier.stage === 'acceptance' || dossier.stage === 'delivered' || dossier.status === 'closed'
		})
	);
	const goTo = (target: string) => (target === 'verification' ? onReport() : scrollToBlock(target));

	/**
	 * What happened since the version was frozen, newest first: each reading of
	 * the code that moved a line, the decisions, and the build handed to the AI.
	 */
	const frozenAt = $derived(dossier.frozenVersions?.find((v) => v.version === dossier.specVersion)?.at ?? '');
	const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
	const log = $derived(
		[
			...history.filter((h) => h.recordedAt >= frozenAt).map((h) => ({ at: h.recordedAt, summary: h.summary, ai: false })),
			...calls.map((c) => ({ at: c.until, summary: `Lyriks ${c.words}`, ai: true })),
			...(live?.buildClicks ?? [])
				.filter((c) => c.at >= frozenAt)
				.map((c) => ({ at: c.at, summary: `Build handed to your AI${c.state === 'answered' ? ': it answered' : c.state === 'taken' ? ': it is on it' : c.state === 'waiting' ? ': waiting for it' : ''}`, ai: true }))
		]
			.sort((a, b) => b.at.localeCompare(a.at))
			.slice(0, 30)
	);
	const unseen = $derived(logOpen ? 0 : log.filter((e) => e.at > logSeenAt).length);
	const lastRead = $derived(history.filter((h) => h.recordedAt >= frozenAt && h.summary.startsWith('Code read:')).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]?.recordedAt ?? null);
	/** The AI in session announced a step it is on outside any click: it works on the build on its own. */
	const aiBusy = $derived(!!live && live.isOpen && (live.status === 'writing' || live.status === 'thinking') && !live.thinkingAbout && !!live.saying);
	const status = $derived(
		buildStatus(
			progress,
			aiBusy ? { click: aiOnBuild, saying: live?.saying ?? null, busy: true } : { click: aiOnBuild, saying: aiOnBuild ? (live?.saying ?? null) : lastCallSaid, busy: mcpActive },
			lastRead ? TIME.format(new Date(lastRead)) : null
		)
	);
	// The design's tags: complete filled green, the AI at work in the LLM's violet, a person awaited orange, the code awaited toner-2.
	const STATUS_LOOK: Record<string, string> = {
		complete: 'border-green bg-green text-ink',
		building: 'border-violet bg-violet-tint text-violet-ink',
		working: 'border-violet bg-violet-tint text-violet-ink',
		sent: 'border-violet bg-violet-tint text-violet-ink',
		waiting_you: 'border-orange bg-orange text-ink',
		waiting_code: 'border-toner-2 bg-toner-2 text-ink-2'
	};

	// The design's choice card (.ly-choice): sand at rest, paper with an ink border once chosen.
	const OPTION = 'flex min-h-30 flex-[1_1_320px] flex-col gap-2 rounded-evo-card px-[22px] py-5 text-left text-evo-ink';
	// The design's stat block (.ly-found): sand, flat.
	const TILE = 'flex min-w-0 flex-[1_1_240px] flex-col gap-3 rounded-evo-card border bg-surface px-6 py-5';
	/** A long label wraps on a phone instead of running off the screen. */
	const WRAP = 'max-w-full py-2 whitespace-normal!';
	// The files the verification reads, listed while the Files tile is hovered or focused from the keyboard.
	let filesShown = $state(false);
	let filesAnchor = $state<HTMLElement | null>(null);
</script>

{#snippet filesRead()}
	<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3">FILES READ</span>
	{#each files as f (f.file)}
		<span class="flex items-baseline justify-between gap-4 text-xs"><span class="font-evo-mono text-evo-ink">{f.file}</span><span class="flex-none font-evo-mono text-ink-3">{f.lines} {f.lines === 1 ? 'point' : 'points'}</span></span>
	{/each}
{/snippet}

{#if dossier.correction}
	<!-- Version N+1 in correction: the build still reads version N until N+1 is validated and frozen (EVO-012, criterion 6103617d). -->
	<p class="m-0 mb-5 rounded-evo-btn border-l-[6px] border-orange bg-orange-tint px-3.5 py-2.5 text-sm text-orange-ink" role="status">
		Version {dossier.correction.version} in correction waits for its validation: this reads the report of version {dossier.correction.builtAgainst} until version {dossier.correction.version} is frozen.
	</p>
{/if}
{#if !frozen}
	<div class="flex flex-col gap-5">
		<!-- The go-ahead comes from the impact analysis: nothing is developed against a version that is not frozen. -->
		<ImplementationWaitingCard title="Waiting for the go-ahead from the impact analysis" text={waiting}>
			{#snippet actions()}
				<button type="button" class={SECONDARY_48} onclick={onImpact}>{undecided.length > 0 ? 'Make the decisions' : 'Go to Simulation'}</button>
			{/snippet}
		</ImplementationWaitingCard>
		<!-- The freeze waits for the deployment branch: it is named here, before the freeze (criterion 5411b88e). -->
		{#if dossier.branchAwaitedByFreeze}<CodeBranchCard {projectId} {dossier} {canEdit} {members} />{/if}
	</div>
{:else if !following}
	<div class="flex flex-col gap-5">
		<CodeBranchCard {projectId} {dossier} {canEdit} {members} />
		{#if !dossier.waiver}
			<div class="animate-lk-in flex items-center gap-3.5 rounded-xl border border-transparent bg-green-tint px-[18px] py-4 shadow-[inset_6px_0_0_var(--color-green)]">
				<span aria-hidden="true" class="flex size-9 flex-none items-center justify-center bg-green text-lg font-bold text-ink">✓</span>
				<span class="flex flex-col gap-0.5">
					<span class="text-[0.9375rem] font-bold text-ink">Well done, every impact is resolved</span>
					<span class="text-sm leading-normal text-ink-2">{taken.length > 0 ? `${taken.length} decision(s) taken. ` : ''}You can start the implementation.</span>
				</span>
			</div>
		{/if}
		<h2 class="m-0 text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-evo-ink">Who develops the evolution?</h2>
		<div class="flex flex-wrap gap-4">
			<button type="button" class="{OPTION} {who === 'llm' ? 'border-2 border-ink bg-paper' : 'border-2 border-transparent bg-surface hover:border-line'}" aria-pressed={who === 'llm'} onclick={() => (who = 'llm')}>
				<span class="flex w-full items-center justify-between gap-2">
					<span class="text-base font-bold">I’ll delegate to my LLM</span>
					<span class="border-[1.5px] border-ink bg-ink px-2.5 py-[3px] font-evo-mono text-xs font-bold tracking-[0.06em] text-paper uppercase">Recommended</span>
				</span>
				<span class="text-sm leading-normal text-ink-2">Claude Code, Cursor, Copilot… Lyriks generates the brief. Via the Lyriks MCP, the LLM reads the spec directly.</span>
			</button>
			<button type="button" class="{OPTION} {who === 'self' ? 'border-2 border-ink bg-paper' : 'border-2 border-transparent bg-surface hover:border-line'}" aria-pressed={who === 'self'} onclick={() => (who = 'self')}>
				<span class="text-base font-bold">I’ll develop it myself</span>
				<span class="text-sm leading-normal text-ink-2">Lyriks checks each sync of the implementation index against the spec.</span>
			</button>
		</div>
		{#if who === 'llm'}
			<section class="flex flex-col gap-3.5 rounded-evo-card border border-transparent bg-surface p-6" aria-label="LLM brief">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex flex-wrap items-center gap-3"><span class={numberPill(false)}>5.1</span><h3 class={SECTION_TITLE}>LLM brief</h3></div>
					<div class="flex flex-wrap items-center gap-2">
						<button type="button" class={SECONDARY_44} onclick={copyBrief}>{copied ? 'Copied ✓' : 'Copy brief'}</button>
						{#if inSession}
							<button type="button" class="{PRIMARY_48} {WRAP} inline-flex items-center gap-2" disabled={sending} onclick={() => sendToAi(brief.text)}
								><Icon name="sparkles" size={16} />Send to my AI</button
							>
						{/if}
					</div>
				</div>
				{#if inSession}
					<p class="m-0 text-sm text-ink-2">Your AI is in session: it takes the brief from here, nothing to paste.</p>
				{/if}
				<pre class="m-0 rounded-evo-btn bg-evo-ink px-5 py-[18px] font-evo-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap wrap-anywhere text-paper">{brief.text}</pre>
			</section>
		{:else}
			<section class="flex flex-col gap-3 rounded-evo-card border border-transparent bg-surface p-6" aria-label="Developer checklist">
				<div class="flex flex-wrap items-center gap-3"><span class={numberPill(false)}>5.1</span><h3 class={SECTION_TITLE}>Developer checklist</h3></div>
				<div class="flex flex-wrap gap-2">
					{#each asked as l (l.id)}
						<span class="flex min-w-0 flex-[1_1_300px] items-center gap-2.5 rounded-lg border border-line bg-toner-1 px-3 py-2.5 text-sm" title={l.requirement}>
							<span class="w-8 flex-none font-evo-mono text-xs font-bold text-blue-ink">{labels.get(l.id)}</span>{requirementParts(l.requirement).title}
						</span>
					{/each}
				</div>
			</section>
		{/if}
		<div class="flex flex-wrap items-center justify-between gap-2.5">
			<span class="text-sm text-ink-3">You can close the page: Lyriks will let you know when it’s done.</span>
			<button type="button" class="{PRIMARY_48} {WRAP}" onclick={follow}>{who === 'llm' ? 'I’ve launched my LLM · follow the implementation' : 'I’m starting · follow the implementation'}</button>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-5">
		<!-- What Lyriks read opens the step, first under the step bar, above the branch (ac-evo-form-step-note). -->
		{#if note}<EditorialNote {note} readKey={noteReadKey(dossier.id, 'development', note)} onGo={goTo} />{/if}
		<CodeBranchCard {projectId} {dossier} {canEdit} {members} />
		<div class="flex flex-wrap items-stretch gap-4">
			<div class="{TILE} transition-[box-shadow] duration-300 border-transparent {progress.finished ? 'shadow-[inset_6px_0_0_var(--color-green)]' : ''}">
				<span class={KICKER}>PROGRESS</span>
				<span class="flex flex-wrap items-baseline gap-2.5">
					<span class="text-[2.5rem] leading-none font-bold tracking-[-0.03em] transition-colors duration-300 {progress.finished ? 'text-green-ink' : 'text-evo-ink'}">{progress.percent} %</span>
					<span class="text-[0.8125rem] {progress.finished ? 'font-semibold text-green-ink' : 'text-ink-2'}">of the spec covered by passing tests</span>
				</span>
				<!-- Tested, then found but not tested yet, then the rest: the bar never counts a line merely read as done. -->
				<Gauge
					parts={[
						{ value: progress.tested + progress.decided, tone: 'bg-green' },
						{ value: progress.found + progress.failing, tone: 'bg-orange' }
					]}
					total={progress.total}
					counts
					label="{progress.tested + progress.decided} tested or ruled out, {progress.found + progress.failing} found but not tested, {progress.todo + progress.yours} not found yet"
				/>
				<span class="flex flex-wrap gap-x-3 gap-y-1 font-evo-mono text-xs text-ink-2">
					<span><span class="mr-1 inline-block size-2.5 bg-green align-[-1px]"></span>{progress.tested + progress.decided} tested</span>
					<span><span class="mr-1 inline-block size-2.5 bg-orange align-[-1px]"></span>{progress.found + progress.failing} found, not tested</span>
					<span><span class="mr-1 inline-block size-2.5 bg-toner-2 align-[-1px]"></span>{progress.todo + progress.yours} not found yet</span>
				</span>
			</div>
			<div class="{TILE} border-transparent">
				<span class={KICKER}>VERIFICATION SCOPE</span>
				<div class="flex gap-2">
					<!-- Hover or focus lists the files the verification reads (the busiest first); the list floats under <body> so no
					     box cuts it (criterion 5651ca29), its words kept in the page for the screen reader. -->
					<button type="button" class="relative flex flex-1 cursor-default flex-col gap-1 rounded-evo-btn bg-toner-1 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-ink" aria-describedby="dev-files">
						<span class="text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-evo-ink">{progress.files}</span><span class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Files</span>
						{#if files.length > 0}
							<span hidden use:hoverWithin={{ selector: 'button', focus: 'visible', onChange: (on, at) => ((filesShown = on), (filesAnchor = at)) }}></span>
							<span id="dev-files" class="sr-only">{@render filesRead()}</span>
						{/if}
					</button>
					{#if filesShown && files.length > 0}
						<span
							use:floatInView={{ anchor: filesAnchor }}
							aria-hidden="true"
							class="pointer-events-none flex w-max max-w-[min(520px,80vw)] animate-lk-in-fast flex-col gap-1 rounded-xl border-[1.5px] border-ink bg-paper p-3 shadow-pop"
						>{@render filesRead()}</span>
					{/if}
					<span class="flex flex-1 flex-col gap-1 rounded-evo-btn bg-toner-1 px-3 py-2.5"><span class="text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-evo-ink">{progress.tested + progress.decided} / {progress.total}</span><span class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Points tested</span></span>
				</div>
			</div>
			<div class="{TILE} border-transparent">
				<span class={KICKER}>STATUS</span>
				<span class="inline-flex items-center gap-2 self-start border-[1.5px] px-3.5 py-2 font-evo-mono text-[0.8125rem] font-bold tracking-[0.06em] uppercase {STATUS_LOOK[status.kind]}"
					>{#if status.kind === 'building' || status.kind === 'working' || status.kind === 'sent'}<span class="animate-lk-pulse size-2 bg-orange"></span>{/if}{status.word}</span
				>
				<span class="text-sm leading-normal text-ink-2">{status.text}</span>
				{#if status.kind === 'waiting_you'}
					<button type="button" class="{SECONDARY_44} {WRAP} self-start" onclick={showLineForYou}>Show the line</button>
				{/if}
				{#if status.kind === 'waiting_code'}
					{#if inSession}
						<button type="button" class="{SECONDARY_44} {WRAP} inline-flex items-center gap-2 self-start" disabled={sending} onclick={() => sendToAi(remaining.text)}
							><Icon name="sparkles" size={16} />Ask my AI to finish</button
						>
					{:else}
						<button
							type="button"
							class="{SECONDARY_44} {WRAP} self-start"
							title="No session with your AI: the brief of the open points is copied, to paste in your LLM."
							onclick={async () => {
								await navigator.clipboard.writeText(remaining.text).catch(() => null);
								pushToast({ level: 'success', message: remaining.copied });
							}}>Copy the open points</button
						>
					{/if}
				{/if}
				<!-- The log stays folded until it is asked for here (owner, 2026-10-29). -->
				<button
					type="button"
					class="mt-auto inline-flex items-center gap-1.5 self-start text-sm font-semibold text-blue-ink underline-offset-2 hover:underline"
					aria-expanded={logOpen}
					aria-controls="dev-activity-log"
					onclick={toggleLog}><Icon name="history" size={14} />{logOpen ? 'Hide the activity log' : 'Activity log'}{unseen > 0 ? ` · ${unseen} new` : ''}</button
				>
			</div>
		</div>
		<!-- The full height keeps the page's room to scroll; the panes inside fit what is in view above the foot. -->
		<div style="height: {panesHeight}px" bind:this={panes}>
		<div class="flex items-stretch" {@attach fillToScrollerFoot(LOG_GAP, () => panesHeight, 120)}>
			<section
				id="dev-verification"
				class="flex min-w-0 flex-1 scroll-mt-36 flex-col gap-3 overflow-y-auto rounded-evo-card border border-transparent bg-surface px-6 pb-6 [contain:layout_paint]"
				aria-label="Continuous verification"
			>
				<!-- The title stays in view while the verification scrolls on its own. -->
				<div class="sticky top-0 z-10 -mx-6 flex flex-col gap-1.5 bg-surface px-6 pt-6 pb-2">
					<span class={KICKER}>CONTINUOUS VERIFICATION</span>
					<span class="text-sm text-ink-2">One package per feature, the one missing the most verification first: open one to see its lines. Lyriks reads the code again at each index sync.</span>
				</div>
				{#each packages as pkg (pkg.name)}
					{@const opened = isOpen(pkg.name)}
					<div id={packageAnchor(pkg.name)} class="flex flex-none scroll-mt-24 flex-col rounded-xl border transition-[box-shadow,background-color] duration-500 {pkg.done ? 'border-green/50' : 'border-line'} {justMoved(pkg.name) ? 'bg-blue-tint shadow-[0_0_0_3px_var(--color-blue-tint)]' : 'bg-toner-1'}">
						<button
							type="button"
							class="flex flex-wrap items-center gap-3 px-4 py-3 text-left"
							aria-expanded={opened}
							onclick={() => (toggled = { ...toggled, [pkg.name]: !opened })}
						>
							<Icon name={opened ? 'chevron-down' : 'chevron-right'} size={16} class="flex-none text-ink" />
							<span class="min-w-0 flex-[1_1_180px] text-[0.9375rem] font-bold text-evo-ink"
								>{pkg.name}{#if justMoved(pkg.name)}<span class="ml-2 font-evo-mono text-xs font-normal text-blue-ink" role="status">moved at the last reading</span>{/if}</span
							>
							<span class="flex w-40 flex-none flex-col gap-1">
								<Gauge
									parts={[
										{ value: pkg.settled, tone: 'bg-green' },
										{ value: pkg.lines.filter((r) => r.read.state === 'found' || r.read.state === 'failing').length, tone: 'bg-orange' }
									]}
									total={pkg.total}
									counts
									height={6}
								/>
								<span class="font-evo-mono text-xs text-ink-3">{pkg.settled} / {pkg.total} tested</span>
							</span>
							<span class="min-w-18 flex-none border-[1.5px] px-2.5 py-1 text-center font-evo-mono text-xs font-bold tracking-[0.06em] uppercase {pkg.done ? 'border-green bg-green text-ink' : 'border-toner-2 bg-toner-2 text-ink-2'}">{pkg.done ? '✓ Done' : `${pkg.open} open`}</span>
						</button>
						{#if opened}
							<div class="flex flex-col border-t border-line">
								{#each pkg.lines as { line: l, read } (l.id)}
									{@const code = codePlaceOf(l)}
									<div class="flex flex-wrap items-start gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
										<span class="w-9 flex-none pt-0.5 font-evo-mono text-xs font-bold text-blue-ink">{labels.get(l.id)}</span>
										<span class="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
											<span class="text-sm text-evo-ink" title={l.requirement}>
												{#if read.kind}<span class="mr-1.5 rounded bg-toner-2 px-1.5 py-0.5 font-evo-mono text-[0.6875rem] tracking-[0.04em] text-ink-2 uppercase">{read.kind}</span>{/if}{read.title}
											</span>
											{#if read.place}<span class="font-evo-mono text-xs text-ink-3">{read.place}</span>{/if}
											<span class="text-xs text-ink-2">{read.why}{#if read.where}<span class="font-evo-mono">{' · '}{#if code}<CodePlace {projectId} featureId={code.featureId} place={code.place} file={code.file} line={code.line} recorded={code.recorded} kind={read.kind || 'Line'} name={read.title} />{:else}{read.where}{/if}</span>{/if}</span>
											{#if read.next}<span class="text-xs text-ink-3">{read.next}</span>{/if}
										</span>
										<span class="flex flex-none flex-col items-end gap-1.5">
											<span class="flex items-center gap-1.5">
												<!-- A line Yours to validate carries the reader's own box, no Validate button (criterion f27ab2f8). -->
												{#if code || (read.state === 'yours' && canEdit)}<BlockControls icons small sources={code ? { count: 1, open: sourcesOpen === l.id, toggle: () => (sourcesOpen = sourcesOpen === l.id ? null : l.id) } : null} validate={read.state === 'yours' && canEdit ? lineValidation(l.id, read.title) : null} />{/if}
												<span class="border-[1.5px] px-2.5 py-1 font-evo-mono text-xs font-bold tracking-[0.04em] transition-colors duration-300 {read.look}">{read.word}</span>
											</span>
										</span>
										{#if code && sourcesOpen === l.id}<LineCodeSource {projectId} {code} kind={read.kind || 'Line'} name={read.title} />{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<span class="text-[0.8125rem] text-ink-3 italic">The verification builds itself at the first index sync against version {dossier.specVersion}.</span>
				{/each}
			</section>
			<!--
				The log's slot grows from nothing to its width on a spring, the verification yielding as it does; the log
				inside keeps its own width, so it never reflows while it moves, and slides in as it fades up.
			-->
			<div
				class="flex-none overflow-hidden"
				style="width: {logOpen ? logWidth + LOG_GAP : 0}px; {logMotion ? `transition: width ${logMotion.duration}ms ${logMotion.easing};` : ''}"
			>
				<section
					id="dev-activity-log"
					class="flex h-full flex-col gap-3 overflow-y-auto rounded-evo-card bg-evo-ink px-6 pb-6 font-evo-mono text-paper"
					style="width: {logWidth}px; margin-left: {LOG_GAP}px; opacity: {logOpen ? 1 : 0}; transform: translateX({logOpen ? 0 : 24}px); {logMotion
						? `transition: opacity ${Math.round(logMotion.duration * 0.6)}ms ease-out, transform ${logMotion.duration}ms ${logMotion.easing};`
						: ''}"
					aria-label="Activity log"
					inert={!logOpen}
				>
					<div class="sticky top-0 z-10 -mx-6 flex items-center justify-between gap-3 bg-evo-ink px-6 pt-6 pb-2">
						<span class="font-evo text-sm font-bold tracking-normal">ACTIVITY LOG</span>
						<button type="button" class="grid size-7 place-items-center rounded-md border-[1.5px] border-night text-ink-4 hover:text-paper" aria-label="Hide the activity log" onclick={toggleLog}
							><Icon name="x" size={14} /></button
						>
					</div>
				{#if inSession && live?.saying}
					<div class="flex gap-3 text-[0.8125rem] leading-normal">
						<span class="animate-lk-pulse flex-none font-evo-mono text-orange">now</span><span>Lyriks: {live.saying}</span>
					</div>
				{/if}
				{#each log as entry, i (i)}
					<div class="flex gap-3 text-[0.8125rem] leading-normal">
						<span class="flex-none font-evo-mono text-ink-4">{TIME.format(new Date(entry.at))}</span><span>{entry.summary}</span>
					</div>
				{/each}
				</section>
			</div>
		</div>
		</div>
		{#if progress.readAll}
			<PageFoot class={FOOT_BAR}><button type="button" class={PRIMARY_48} onclick={onReport}>Go to Verification →</button></PageFoot>
		{/if}
	</div>
{/if}
