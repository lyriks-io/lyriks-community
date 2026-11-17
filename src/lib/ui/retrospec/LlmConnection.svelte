<script lang="ts">
	import { aiConnected, aiSilentFor } from '$domain/retrospec';

	/**
	 * Whether the person's LLM has reached the project through the Lyriks MCP,
	 * read live under a prompt to paste: waiting while it never called,
	 * connected right after a call, then how long it has been silent.
	 */
	let { aiSeenAt, now, class: klass = '' }: { aiSeenAt: string | null; now: number; class?: string } = $props();

	const connected = $derived(aiConnected(aiSeenAt, now));
	const silentFor = $derived(aiSilentFor(aiSeenAt, now));
</script>

<span role="status" class="flex items-center gap-2.5 text-sm {connected ? 'font-semibold text-green-ink' : 'font-evo-mono text-[0.8125rem] text-ink-3'} {klass}">
	{#if connected}
		<span aria-hidden="true" class="size-2 flex-none bg-green"></span>Your LLM is connected
	{:else if silentFor !== null}
		<span aria-hidden="true" class="size-2 flex-none bg-ink-4"></span>No call from your LLM for {Math.round(silentFor / 60_000)} min
	{:else}
		<!-- The design's waiting mark (.ly-wait): an 8px orange square. -->
		<span aria-hidden="true" class="size-2 flex-none animate-[lk-pulse_1.4s_ease-in-out_infinite] bg-orange"></span>Waiting for your LLM to connect…
	{/if}
</span>
