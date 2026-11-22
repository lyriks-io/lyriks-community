<script lang="ts">
	import Gauge from '$ui/design-system/Gauge.svelte';
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import { onMount } from 'svelte';
	import type { PhaseState } from '$domain/retrospec';
	import type { ReadingEnd } from '$domain/retrospec/reverse-page';
	import { PRIMARY_44 } from '$ui/evolution/evo-look';
	import FigureTiles from './FigureTiles.svelte';
	import CheckMark from './CheckMark.svelte';
	import { RESUME_COPIED, runPaused } from '$domain/retrospec';
	import { copyPrompt } from '$ui/evolution/copy-prompt';
	import { clockOf } from './look';

	/**
	 * The live analysis: what the person's AI has written so far, phase by
	 * phase, read from the specification's own sections as the AI saves them;
	 * the activity log of its calls; the counters of what it found. Nothing here
	 * runs on a timer: every line moves when the AI writes. Once done, the same
	 * board is the summary: what the AI read, how much of the spec the code
	 * holds and how much of it cites its source.
	 */
	interface Part {
		readonly key: string;
		readonly label: string;
		readonly share: number;
		readonly state: Exclude<PhaseState, 'current'>;
		readonly note: string;
	}
	interface Phase {
		readonly key: string;
		readonly label: string;
		readonly share: number;
		readonly state: PhaseState;
		readonly note: string;
		/** A phase the AI comes back to several times, read part by part. */
		readonly parts: readonly Part[];
	}
	interface Props {
		productName: string;
		/** The title while the AI reads, naming what this run reads (criterion 25254e5a). */
		reading: string;
		/** What this run reads, in one line that stays from the wait for the LLM to the summary. */
		scope: string;
		/** A run after the first: the counters beside the board count the whole specification, not what it found. */
		later?: boolean;
		phases: readonly Phase[];
		pct: number;
		started: boolean;
		finished: boolean;
		found: readonly { n: number; label: string }[];
		log: readonly { at: string; text: string; tone: 'normal' | 'warn' | 'ok' | 'found' }[];
		/** When the AI last called Lyriks about this project, null when never seen. */
		aiSeenAt: string | null;
		/** Now, ticking, so the reading of the LLM ages honestly. */
		now: number;
		/** The prompt that reconnects the LLM and resumes the run where it stopped, offered once it went silent (ac-ai-session-disconnected). */
		relaunchPrompt: string;
		canWrite: boolean;
		/** The board read as the summary: how far the reading went and the headline figures replace the live header (criterion a05bca06). */
		summary?: { readonly code: number | null; readonly traced: number | null; readonly reading: ReadingEnd } | null;
		onEnd: () => void;
		onSummary: () => void;
	}
	let { productName, reading, scope, later = false, phases, pct, started, finished, found, log, aiSeenAt, now, relaunchPrompt, canWrite, summary = null, onEnd, onSummary }: Props = $props();
	// The LLM went silent on a run it had called, written or not: a red alert under the title says so and copies what
	// reconnects it, the prompt itself never written out (criterion 348770f8).
	const silent = $derived((started || aiSeenAt !== null) && !finished && !summary && runPaused(aiSeenAt, now));
	let copied = $state(false);
	async function copyRelaunch() {
		await copyPrompt(relaunchPrompt, RESUME_COPIED);
		copied = true;
	}

	const waiting = $derived(!started && !aiSeenAt && !finished);
	// Only a run under way and heard from has something at work: once over, the phases keep where the reading stopped, still (criterion a05bca06).
	const atWork = $derived(!finished && !summary && !silent);

	// A silent LLM pauses the run: nothing on the board says it is at work until its next call (criterion 7a4a99e4).
	const title = $derived(
		finished ? 'Reverse-Specification complete' : waiting ? 'Waiting for your LLM' : silent ? `The analysis of ${productName} is paused` : reading
	);
	const sub = $derived(
		finished
			? 'The summary is ready.'
			: waiting
				? 'Paste the prompt in your LLM: the analysis shows here as soon as it connects through the Lyriks MCP.'
				: ''
	);
	// The icon says done or not; what the AI is on now spins beside its own word,
	// in the phase's line, and nowhere else.
	// The design's checklist (.ly-checklist): a phase done numbered on green, the one under way on orange, the rest on toner-2.
	const DONE = 'bg-green text-ink';
	const NOW = 'bg-orange text-ink';
	const NOT_YET = 'bg-toner-2 text-ink-3';
	/** The parts the AI is on now: those under way, else the first one it has not reached; none while it is silent. */
	function spinning(phase: Phase): Set<string> {
		if (phase.state !== 'current' || !atWork) return new Set();
		const started = phase.parts.filter((p) => p.state === 'started');
		const next = started.length > 0 ? started : phase.parts.filter((p) => p.state === 'pending').slice(0, 1);
		return new Set(next.map((p) => p.key));
	}
	/** The words of a phase's line: each part's count, or its name while it is still to come; a finished part with nothing to count says nothing. */
	const words = (phase: Phase, on: Set<string>) => phase.parts.filter((p) => p.note || p.state !== 'done' || on.has(p.key));
	// The console shows its latest lines and unfolds to the whole run.
	const LOG_FOLDED = 5;
	let logOpen = $state(false);
	const shownLog = $derived(logOpen ? log : log.slice(0, LOG_FOLDED));
	const LOG_TONE = { normal: 'text-paper', warn: 'text-orange', ok: 'text-green', found: 'text-blue-on-ink' } as const;
	// Times read in the reader's own time zone, which only the browser knows: they show once mounted.
	let mounted = $state(false);
	onMount(() => (mounted = true));
</script>

{#snippet scopeRow()}
	<p data-run-scope class="m-0 max-w-[560px] text-center text-sm leading-normal text-ink-2"><span class="font-bold text-ink">Scope</span> · {scope}</p>
{/snippet}

{#snippet spinner()}
	<span aria-label="In progress" role="img" class="ml-1 inline-block size-2.5 flex-none animate-[lk-spin_0.9s_linear_infinite] rounded-full border-[1.5px] border-evo-violet border-t-transparent align-[-1px]"></span>
{/snippet}

<div class="flex animate-[lk-in_0.35s_ease_both] flex-col gap-4">
	<div class="flex flex-wrap items-stretch gap-4">
		<div class="box-border flex min-w-0 flex-[1_1_420px] flex-col items-center gap-[18px] border border-evo-line bg-surface px-6 py-7">
			{#if summary}
				{#if summary.reading.whole}
					<span aria-hidden="true" class="flex size-14 flex-none animate-lk-pop items-center justify-center bg-green text-ink"><CheckMark size={28} /></span>
				{:else}
					<span role="img" aria-label="Read in part: {summary.reading.pct} %" data-partial-reading class="flex size-14 flex-none animate-lk-pop items-center justify-center bg-orange font-evo-mono text-sm font-bold text-ink">{summary.reading.pct}%</span>
				{/if}
				<div class="flex flex-col items-center gap-1.5 text-center">
					<h2 class="m-0 text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-ink">{summary.reading.title}</h2>
					{#if !summary.reading.whole}<span class="text-sm text-ink-2">{summary.reading.line}</span>{/if}
				</div>
				{@render scopeRow()}
				<FigureTiles code={summary.code} traced={summary.traced} class="max-w-[560px]" />
			{:else if finished}
				<span aria-hidden="true" class="flex size-14 flex-none animate-lk-pop items-center justify-center bg-green text-ink"><CheckMark size={28} /></span>
			{:else if silent}
				<span role="img" aria-label="Paused" class="flex size-14 flex-none animate-[lk-in_0.25s_ease_both] items-center justify-center bg-orange text-ink">
					<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="5" y="4" width="5" height="16"></rect><rect x="14" y="4" width="5" height="16"></rect></svg>
				</span>
			{:else}
				<span aria-hidden="true" class="relative size-14 flex-none">
					<span class="absolute inset-0 animate-[lk-spin_1.1s_linear_infinite] rounded-full" style:background="conic-gradient(from 0deg, var(--color-blue), var(--color-blue) 70%, var(--color-toner-2) 70%)"></span>
					<span class="absolute inset-1 rounded-full bg-surface"></span>
					<span class="bg-evo-gradient absolute inset-[9px] flex animate-[lk-pulse_1.6s_ease-in-out_infinite] items-center rounded-full justify-center text-white">
						<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"></path><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"></path></svg>
					</span>
				</span>
			{/if}
			{#if !summary}
			<div class="flex flex-col items-center gap-1.5 text-center">
				<h2 class="m-0 text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-ink">{title}</h2>
				{#if sub}<span class="text-sm text-ink-2">{sub}</span>{/if}
			</div>
			{@render scopeRow()}
			{/if}
			{#if silent}
				<!-- The design's alert: a thick red edge, a light red ground, room around every line, one button set apart. -->
				<div role="alert" data-silent-alert class="box-border flex w-full max-w-[560px] animate-[lk-in_0.25s_ease_both] flex-col gap-3 border-l-[6px] border-red bg-red-tint px-5 py-5 text-left text-ink">
					<span class="flex items-center gap-2.5 text-[0.9375rem] leading-snug font-bold">
						<svg class="flex-none text-red-ink" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="square" stroke-linejoin="miter"><path d="M12 3L2 21h20z"></path><path d="M12 10v5"></path><path d="M12 17.5v1"></path></svg>
						No call from your LLM{aiSeenAt && mounted ? ` since ${clockOf(aiSeenAt)}` : ' lately'}
					</span>
					<p class="m-0 text-sm leading-relaxed text-ink-2">Look in its window first: it may be asking you to allow a Lyriks tool. If it stopped, copy the prompt and paste it in your LLM session: it resumes where it stopped, without rewriting what is written.</p>
					<button type="button" class="pressable mt-1 inline-flex min-h-10 items-center justify-center gap-2 self-start border-[1.5px] border-ink bg-ink px-4 text-xs font-bold tracking-[0.07em] text-paper uppercase" onclick={copyRelaunch}
						>{copied ? 'Copied: now paste it in your LLM session' : 'Copy the prompt'}</button
					>
				</div>
			{/if}
			<Gauge parts={[{ value: pct, tone: 'bg-blue' }]} total={100} class="w-full max-w-[560px]" progress={pct} label="Analysis progress" />
			<div class="flex w-full max-w-[560px] flex-col gap-2">
				{#each phases as phase, i (phase.key)}
					{@const on = spinning(phase)}
					<div class="flex items-center gap-3 text-sm {phase.state === 'pending' ? 'text-ink-3' : phase.state === 'current' ? 'font-bold text-ink' : 'text-ink'}">
						<span class="flex size-[22px] flex-none items-center justify-center font-evo-mono text-[0.6875rem] font-bold {phase.state === 'done' ? DONE : phase.state === 'current' ? NOW : NOT_YET}">{#if phase.state === 'done'}<CheckMark size={13} />{:else}{i + 1}{/if}</span>
						<span class="flex-1">{phase.label}</span>
						<span class="flex flex-wrap items-center justify-end gap-x-1 text-right font-evo-mono text-xs font-normal text-ink-3">
							{#if phase.parts.length > 0}
								{#each words(phase, on) as part, k (part.key)}
									{#if k > 0}<span aria-hidden="true">·</span>{/if}
									<span class="inline-flex items-center {part.state === 'pending' && !on.has(part.key) ? 'text-ink-4' : on.has(part.key) ? 'text-blue-ink' : ''}">{part.note || part.label.toLowerCase()}{#if on.has(part.key)}{@render spinner()}{/if}</span>
								{/each}
							{:else}
								{#if phase.note}<span class={phase.state === 'current' ? 'text-blue-ink' : ''}>{phase.note}</span>{/if}
								{#if phase.state === 'current' && atWork}{@render spinner()}{/if}
							{/if}
						</span>
					</div>
				{/each}
			</div>
			{#if !summary && !finished && started && canWrite}
				<!-- An exit for a run that stopped, not the way a run ends: a quiet link under the phases (criterion 0427b908). -->
				<div class="flex w-full max-w-[560px] justify-end">
					<button
						type="button"
						data-end-analysis
						class="min-h-7 cursor-pointer border-0 bg-transparent p-0 text-xs text-ink-3 underline decoration-ink-4 underline-offset-[3px] hover:text-ink"
						title="Your LLM ends the analysis with its final check. If it stopped before, close the analysis here and review what it wrote."
						onclick={onEnd}>Mark the analysis as finished</button
					>
				</div>
			{/if}
		</div>
		<!-- As tall as the board beside it: its counters share the height. -->
		<div class="box-border flex w-[220px] flex-none flex-col gap-3 border border-evo-line bg-paper px-6 py-5 max-[760px]:w-full">
			<h2 class="m-0 text-xl leading-tight font-bold tracking-[-0.02em] text-ink">{later ? 'In the specification' : summary ? 'Found' : 'Found so far'}</h2>
			<div class="grid flex-1 auto-rows-fr grid-cols-[minmax(0,1fr)] gap-2">
				{#each found as counter (counter.label)}
					<span class="flex flex-col justify-center gap-1 bg-surface px-3 py-2.5">
						<span class="text-[1.625rem] leading-none font-bold tracking-[-0.03em] text-ink">{counter.n}</span>
						<span class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">{counter.label}</span>
					</span>
				{/each}
			</div>
		</div>
	</div>
	{#if finished && !logOpen}
		<!-- Once the analysis is over, the log is history: one link, no preview. -->
		<button type="button" class="self-start text-sm font-semibold text-blue-ink underline-offset-2 hover:underline" onclick={() => (logOpen = true)}>See the activity log ({log.length} {log.length === 1 ? 'line' : 'lines'})</button>
	{:else}
	<div class="flex flex-col gap-2.5 bg-ink px-6 py-5 font-evo-mono text-paper">
		<div class="flex items-center justify-between gap-3">
			<h2 class="m-0 font-evo text-xl leading-tight font-bold tracking-[-0.02em] text-paper">Activity log</h2>
			{#if finished}
				<button type="button" class="min-h-7 px-2.5 font-evo-mono text-xs text-toner-2 hover:text-paper" onclick={() => (logOpen = false)}>Hide</button>
			{:else if log.length > LOG_FOLDED}
				<button type="button" class="min-h-7 px-2.5 font-evo-mono text-xs text-toner-2 hover:text-paper" aria-expanded={logOpen} onclick={() => (logOpen = !logOpen)}
					>{logOpen ? 'Show the last lines' : `Show all ${log.length} lines`}</button
				>
			{/if}
		</div>
		<div class="flex flex-col gap-1 {logOpen ? 'max-h-[360px] overflow-y-auto' : 'min-h-[118px]'}">
			{#each shownLog as line, i (i)}
				<div class="flex gap-3 text-[0.8125rem] leading-normal">
					<span class="w-[42px] flex-none font-evo-mono text-ink-4">{mounted ? clockOf(line.at) : ''}</span>
					<span class={LOG_TONE[line.tone]}>{line.text}</span>
				</div>
			{:else}
				<span class="text-[0.8125rem] text-ink-4">Nothing yet: the log starts with your LLM’s first call.</span>
			{/each}
		</div>
	</div>
	{/if}
	{#if finished && !summary}
		<PageFoot class="flex justify-end">
			<div class="flex animate-[lk-in_0.25s_ease_both] flex-wrap items-center justify-end gap-2.5 rounded-evo-btn border border-evo-green-line bg-evo-green-soft py-2 pr-2 pl-3.5">
				<span class="text-sm font-semibold text-evo-green">Reverse-Specification complete: the summary is ready.</span>
				<button type="button" class={PRIMARY_44} onclick={onSummary}>View the summary →</button>
			</div>
		</PageFoot>
	{/if}
</div>
