<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/state';
	import { previewHeadline, resumeOffered, runPaused, type PreviewStatus } from '$domain/retrospec';
	import { AI_ACTIVITY_EVENT, PROJECT_ACTIVITY_ID, type AiActivity } from '$lib/shared/ai-activity';
	import type { RunPreviewView } from '$lib/shared/code-drift-page';
	import { useProjectAiSession } from '$ui/ai-session/project-ai-session.svelte';
	import { copyRunPrompt, handRunToMyAi, handsInSession } from '$ui/retrospec/run-handover';
	import { retrospecLiveKey } from '$ui/retrospec/live-key';
	import { BTN_MAIN, CARD } from '$ui/spec360/page/look';
	import { timeAgo } from '$ui/shell/notification-view';

	/**
	 * The run under way, in place of the waiting card (criterion 63d6ffe7,
	 * EVO-014): Waiting for your AI until it says it has the run, then the phase
	 * it reads among the phases of the reading, then Paused once it went silent
	 * (rules 2b888b83, 4e4cf7f2, 2919d935); what the run reads, what it already
	 * found, and the way to the run on Reverse. It follows the AI's calls as
	 * Reverse does, re-reading the page at most every 3 seconds. A paused run is
	 * resumed from here (action e0c218de); a reader sees no button (criterion 32e221a6).
	 */
	interface Props {
		projectId: string;
		productName: string;
		preview: RunPreviewView;
		canWrite?: boolean;
	}
	let { projectId, productName, preview, canWrite = false }: Props = $props();
	const ai = useProjectAiSession();

	let heardAt = $state<string | null>(null);
	let now = $state(Date.now());
	const seenAt = $derived([heardAt, preview.aiLastSeenAt].filter((at): at is string => !!at).sort().at(-1) ?? null);
	const status = $derived<PreviewStatus>(preview.status === 'reading' && runPaused(seenAt, now) ? 'paused' : preview.status);
	const phase = $derived(preview.phases.find((p) => p.state === 'current')?.label ?? null);
	const runHref = $derived(`/projects/${encodeURIComponent(projectId)}/retrospec`);
	let busy = $state(false);

	$effect(() => {
		const key = retrospecLiveKey(projectId);
		let timer: ReturnType<typeof setTimeout> | null = null;
		// A burst of calls costs one re-read; a page being opened is never interrupted (criterion 6787a611).
		const THROTTLE_MS = 3000;
		const reread = () => {
			timer = null;
			if (navigating.to !== null) {
				timer = setTimeout(reread, THROTTLE_MS);
				return;
			}
			void invalidate(key);
		};
		const onActivity = (event: Event) => {
			const { detail } = event as CustomEvent<AiActivity>;
			if (detail.requestId !== PROJECT_ACTIVITY_ID) return;
			heardAt = new Date().toISOString();
			now = Date.now();
			if (timer === null) timer = setTimeout(reread, THROTTLE_MS);
		};
		window.addEventListener(AI_ACTIVITY_EVENT, onActivity);
		const tick = setInterval(() => (now = Date.now()), 10_000);
		return () => {
			window.removeEventListener(AI_ACTIVITY_EVENT, onActivity);
			clearInterval(tick);
			if (timer !== null) clearTimeout(timer);
		};
	});

	async function resume() {
		// No AI listens: the prompt that resumes the run is copied at the press, as on Reverse (rule d5a5ad98).
		if (!handsInSession(ai) || !ai) return void copyRunPrompt('resume', preview.resumePrompt);
		busy = true;
		await handRunToMyAi(ai, 'resume', productName);
		busy = false;
	}
	const DOT: Readonly<Record<string, string>> = { done: 'bg-green', current: 'bg-blue animate-lk-pulse', started: 'bg-orange', pending: 'bg-line' };
</script>

<div class="{CARD} animate-lk-in mt-[22px] flex flex-col gap-3" data-run-preview data-status={status}>
	<div class="flex flex-wrap items-baseline justify-between gap-3">
		<div class="flex items-center gap-2">
			<span class="size-2.5 flex-none {status === 'paused' ? 'bg-red' : status === 'waiting' ? 'bg-orange animate-lk-pulse' : 'bg-blue animate-lk-pulse'}" aria-hidden="true"></span>
			<b class="text-[0.9375rem] text-ink" data-preview-headline>{previewHeadline(status, phase)}</b>
		</div>
		<span class="font-evo-mono text-[0.8125rem] text-ink-3">{preview.pct} %</span>
	</div>
	{#if status === 'waiting'}
		<p class="m-0 text-sm text-ink-2">The run starts as soon as your AI says it received it: in session it already has it, otherwise paste the prompt in it.</p>
	{:else if status === 'paused'}
		<p class="m-0 text-sm text-ink-2" data-preview-paused>No call from your AI{seenAt ? ` since ${timeAgo(seenAt)}` : ''}. Look in its window first: it may be asking you to allow a Lyriks tool.</p>
	{/if}
	{#if status !== 'waiting'}
		<ol class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0" aria-label="Phases of the reading">
			{#each preview.phases as p (p.key)}
				<li class="inline-flex items-center gap-1.5 text-[0.8125rem] {p.state === 'current' ? 'font-semibold text-ink' : 'text-ink-2'}" data-phase={p.key} data-state={p.state}>
					<span class="size-2 flex-none {DOT[p.state]}" aria-hidden="true"></span>{p.label}
				</li>
			{/each}
		</ol>
	{/if}
	<p class="m-0 text-sm text-ink-2" data-preview-scope><span class="font-bold text-ink">{preview.scopeTitle}</span> · {preview.scope}</p>
	<p class="m-0 font-evo-mono text-[0.8125rem] text-ink-2" data-preview-found>{preview.found.map((f) => `${f.n} ${f.label}`).join(' · ')}</p>
	<div class="flex flex-wrap items-center gap-3">
		{#if resumeOffered(status, canWrite)}
			<button type="button" class={BTN_MAIN} disabled={busy} onclick={() => void resume()} data-resume-with-my-ai>Resume it with my AI</button>
		{/if}
		<a href={runHref} class="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-blue-ink no-underline hover:underline" data-open-run>Open the run →</a>
	</div>
</div>
