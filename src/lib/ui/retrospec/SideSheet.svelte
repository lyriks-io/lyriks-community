<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A side panel over the page: a kicker, a title, what the caller puts in it,
	 * then one closing button. Focus moves into it when it opens; Escape, the
	 * backdrop or the × close it.
	 */
	interface Props {
		kicker: string;
		/** The kicker's text colour. */
		kickerClass?: string;
		title: string;
		closeLabel: string;
		/** What the backdrop does, for assistive technology. */
		backdropLabel?: string;
		onClose: () => void;
		children: Snippet;
	}
	let { kicker, kickerClass = 'text-ink-3', title, closeLabel, backdropLabel = 'Close', onClose, children }: Props = $props();

	let panel: HTMLDivElement | undefined = $state();
	$effect(() => {
		panel?.focus();
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="fixed inset-0 z-[55] flex animate-lk-fade justify-end bg-ink/45">
	<button type="button" aria-label={backdropLabel} class="min-w-0 flex-auto cursor-pointer border-0 bg-transparent" onclick={onClose}></button>
	<div
		bind:this={panel}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		class="box-border flex h-full w-[640px] max-w-full animate-lk-up flex-col gap-5 overflow-y-auto border-l-2 border-ink bg-paper p-7 outline-none"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="flex flex-col gap-1.5">
				<span class="font-evo-mono text-xs tracking-[0.08em] uppercase {kickerClass}">{kicker}</span>
				<h2 class="m-0 text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-ink">{title}</h2>
			</div>
			<button type="button" aria-label="Close" class="size-11 flex-none border-[1.5px] border-line bg-transparent text-xl text-ink hover:border-ink" onclick={onClose}>×</button>
		</div>
		{@render children()}
		<button type="button" class="pressable min-h-11 self-start border-[1.5px] border-ink bg-transparent px-4 text-xs font-bold tracking-[0.07em] text-ink uppercase" onclick={onClose}>{closeLabel}</button>
	</div>
</div>
