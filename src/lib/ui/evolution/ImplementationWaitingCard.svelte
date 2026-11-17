<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The design's waiting card: a step the request has not reached yet, said
	 * under the breathing hourglass, with the way to where it stands. Shared by
	 * Implementation (waiting for the go-ahead) and Verification (waiting for the
	 * code).
	 */
	interface Props {
		title: string;
		text: string;
		actions?: Snippet;
	}
	let { title, text, actions }: Props = $props();
</script>

<div
	class="flex flex-col items-center gap-3.5 rounded-2xl border border-transparent bg-surface px-6 pt-11 pb-10 text-center"
>
	<span aria-hidden="true" class="relative mb-1 size-14 flex-none">
		<!-- The ring: the design's waiting orange, at half. -->
		<span class="breathe absolute -inset-1.5 border-2 border-orange/50"></span>
		<span class="absolute inset-0 flex items-center justify-center bg-ink text-orange">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
				><path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4" /></svg
			>
		</span>
	</span>
	<h2 class="m-0 text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-evo-ink">{title}</h2>
	<span class="max-w-[560px] text-ink-2">{text}</span>
	{#if actions}
		<div class="flex flex-wrap justify-center gap-2.5">{@render actions()}</div>
	{/if}
</div>

<style>
	/* The design's lk-breathe: the ring swells and fades around the hourglass. */
	.breathe {
		animation: breathe 2.4s ease-in-out infinite;
	}
	@keyframes breathe {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.55;
		}
		50% {
			transform: scale(1.18);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.breathe {
			animation: none;
		}
	}
</style>
