<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { firstStepsDone, type FirstStep } from './first-steps-guide';
	import { firstStepsUrlFor } from './first-steps';
	import SideIcon from './SideIcon.svelte';

	/**
	 * "How to use Lyriks": the first steps of the installation, each ticked from
	 * what it really holds, opened from Help & support (criterion 81cc595c) and
	 * from the Get help block of the Documentation (criterion e3629a5f). The full
	 * guide lives on get.lyriks.io, one link at its foot, in a new tab (action b4068a45).
	 */
	let { steps, onClose }: { steps: FirstStep[]; onClose: () => void } = $props();

	// The guide on get.lyriks.io knows this installation from the fragment only, which only a browser can read.
	const guideUrl = $derived(firstStepsUrlFor(browser ? location.origin : null));

	function goStep(s: FirstStep) {
		onClose();
		if (s.href) void goto(s.href);
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="fixed inset-0 z-[60] box-border flex items-start justify-center overflow-y-auto bg-ink/45 px-4 py-16" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
	<div role="dialog" aria-modal="true" aria-labelledby="first-steps-title" class="box-border flex w-full max-w-[600px] animate-lk-in flex-col gap-[18px] border-2 border-ink bg-paper p-6 shadow-pop">
		<div class="flex items-start justify-between gap-3">
			<div class="flex flex-col gap-1">
				<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3">FIRST STEPS · {firstStepsDone(steps)}</span>
				<h2 id="first-steps-title" class="m-0 text-[1.375rem] font-bold tracking-[-0.02em] text-ink">How to use Lyriks</h2>
			</div>
			<button type="button" onclick={onClose} aria-label="Close" class="size-9 flex-none cursor-pointer border-[1.5px] border-line bg-transparent text-lg text-ink">×</button>
		</div>
		<div class="flex flex-col">
			{#each steps as s (s.n)}
				<div class="flex gap-3.5 border-t border-line py-3.5">
					{#if s.done}
						<span aria-hidden="true" class="flex size-7 flex-none items-center justify-center bg-green font-bold text-ink">✓</span>
					{:else}
						<span aria-hidden="true" class="flex size-7 flex-none items-center justify-center border-[1.5px] border-ink font-evo-mono text-xs font-bold text-ink">{s.n}</span>
					{/if}
					<span class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="text-[0.9375rem] font-bold text-ink">{s.t}</span>
						<span class="text-sm leading-normal text-ink-2">{s.d}</span>
						{#if s.cta && !s.done && s.href}
							<button type="button" onclick={() => goStep(s)} class="mt-1 min-h-8 cursor-pointer self-start border-0 bg-transparent p-0 text-sm font-semibold text-blue-ink">{s.cta} →</button>
						{/if}
					</span>
				</div>
			{/each}
		</div>
		{#if page.data.onlineHelp}
			<a href={guideUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 self-start border-t border-line pt-3.5 text-sm font-semibold text-blue-ink no-underline">
				The full guide, with the questions people ask <SideIcon name="external" size={13} />
			</a>
		{/if}
	</div>
</div>
