<script lang="ts">
	import { onMount } from 'svelte';
	import { runPaused } from '$domain/retrospec';
	import { AI_ACTIVITY_EVENT, PROJECT_ACTIVITY_ID, type AiActivity } from '$lib/shared/ai-activity';
	import type { LiveProcess } from '$lib/shared/app-chrome';
	import { clockOf } from '$ui/retrospec/look';

	/**
	 * A process running on the current project, a row at the foot of the
	 * navigation (criterion 81cc595c) whose bars move while it runs. One its LLM
	 * carries reads paused, its bars still, once the LLM went silent, and live
	 * again at its next call, without a reload (criterion 7a4a99e4).
	 */
	let { process }: { process: LiveProcess } = $props();

	/** When this tab last heard the LLM call the project; the server's reading stands until then. */
	let heard = $state<string | null>(null);
	let now = $state(Date.now());
	const seenAt = $derived.by(() => {
		const told = process.llm?.seenAt ?? null;
		return heard && (!told || heard > told) ? heard : told;
	});
	const paused = $derived(!!process.llm && runPaused(seenAt, now));
	// Times read in the reader's own time zone, which only the browser knows: they show once mounted.
	let mounted = $state(false);
	const label = $derived(paused && process.llm ? process.llm.pausedLabel : process.label);
	const title = $derived(
		paused ? `No call from your LLM ${seenAt && mounted ? `since ${clockOf(seenAt)}` : 'lately'}: open the Reverse-Specification to resume it` : (process.title ?? process.label)
	);

	onMount(() => {
		mounted = true;
		if (!process.llm) return;
		const onActivity = (event: Event) => {
			if ((event as CustomEvent<AiActivity>).detail.requestId !== PROJECT_ACTIVITY_ID) return;
			now = Date.now();
			heard = new Date(now).toISOString();
		};
		window.addEventListener(AI_ACTIVITY_EVENT, onActivity);
		// Fine enough for the chip to turn paused about when the LLM's silence crosses the line.
		const tick = setInterval(() => (now = Date.now()), 10_000);
		return () => {
			window.removeEventListener(AI_ACTIVITY_EVENT, onActivity);
			clearInterval(tick);
		};
	});
</script>

<a href={process.href} {title} class="si live-row" data-tip={label}>
	<span class="lab"><span aria-hidden="true" class="eq {paused ? 'still' : 'live'}"><i></i><i></i><i></i></span><span class="txt">{label}</span></span>
</a>
