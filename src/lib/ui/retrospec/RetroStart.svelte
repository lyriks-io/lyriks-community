<script lang="ts">
	import { PRIMARY_48 } from '$ui/evolution/evo-look';
	import PageFoot from '$ui/shell/PageFoot.svelte';

	/**
	 * Before any run: what a retrospecification reads and what it gives back,
	 * how it goes, and the one call to action. Starting records the run, so
	 * the team sees it under way from then on.
	 */
	/** `fromScratch` names a product started from scratch: its specification is written in Knowledge (criterion 9b3dbb64). */
	let { canWrite, onStart, fromScratch = null }: { canWrite: boolean; onStart: () => void; fromScratch?: string | null } = $props();

	const KICKER = 'font-evo-mono text-xs tracking-[0.08em] text-ink-3';
	const LI = 'flex items-baseline gap-2 text-sm leading-normal';
	// A step of the flow on ink: framed by the rule colour of ink (.ly-dark).
	const STEP = 'flex min-w-0 flex-[1_1_220px] items-center gap-3.5 border-[1.5px] border-night bg-ink px-[18px] py-4';
	const STEP_KICKER = 'font-evo-mono text-xs tracking-[0.08em] text-ink-4';
</script>

{#snippet sparkle(size: number)}
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"></path><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"></path></svg>
{/snippet}

<div class="flex animate-[lk-in_0.35s_ease_both] flex-col gap-5">
	{#if fromScratch}
		<p class="m-0 border-l-4 border-blue bg-paper px-4 py-3 text-sm leading-normal text-ink" data-from-scratch>
			{fromScratch} was started from scratch: its specification is written in Knowledge. Start a Reverse-Specification once there is code to read.
		</p>
	{/if}
	<div class="flex flex-col gap-[18px] border border-evo-line bg-surface p-6">
		<h2 class="m-0 text-xl leading-tight font-bold tracking-[-0.02em] text-ink">What it does</h2>
		<div class="flex flex-wrap items-stretch gap-5">
			<div class="flex min-w-0 flex-[1_1_220px] flex-col gap-2.5">
				<span class={KICKER}>WHAT LYRIKS READS</span>
				<div class="flex items-center gap-3 border-[1.5px] border-ink bg-paper px-4 py-3.5">
					<span class="flex size-9 flex-none items-center justify-center bg-surface text-ink"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6l-6 6 6 6M16 6l6 6-6 6"></path></svg></span>
					<span class="flex flex-col gap-0.5"><span class="text-[0.9375rem] font-bold">Your code</span><span class="text-[0.8125rem] text-ink-3">The source of truth</span></span>
				</div>
				<div class="flex items-center gap-3 border-[1.5px] border-dashed border-ink-3 bg-paper px-4 py-3.5">
					<span class="flex size-9 flex-none items-center justify-center bg-surface text-ink"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6M8 13h8M8 17h5"></path></svg></span>
					<span class="flex flex-col gap-0.5"><span class="text-[0.9375rem] font-bold">Your docs <span class="font-evo-mono text-xs font-normal text-ink-3">· optional</span></span><span class="text-[0.8125rem] text-ink-3">Even outdated, used as context</span></span>
				</div>
			</div>
			<div aria-hidden="true" class="mt-11 flex-none self-start font-evo-mono text-[1.375rem] text-ink-3">→</div>
			<div class="mt-[30px] flex flex-none flex-col items-center gap-2 self-start">
				<span aria-hidden="true" class="flex size-14 items-center justify-center bg-ink text-paper">{@render sparkle(22)}</span>
				<span class="text-sm font-bold">Lyriks</span>
			</div>
			<div aria-hidden="true" class="mt-11 flex-none self-start font-evo-mono text-[1.375rem] text-ink-3">→</div>
			<div class="flex min-w-0 flex-[3_1_520px] flex-col gap-2.5">
				<span class={KICKER}>WHAT YOU GET · BOTH</span>
				<div class="flex flex-1 flex-wrap items-stretch gap-3">
					<!-- The design's module (.ly-module): a tile on the sand block under a 4px blue top edge. -->
					<div class="flex min-w-0 flex-[1_1_240px] flex-col gap-3 border-t-4 border-blue bg-paper px-5 py-[18px]">
						<span class="font-evo-mono text-xs font-semibold tracking-[0.08em] text-blue-ink">1 · FUNCTIONAL</span>
						<div class="flex flex-col gap-0.5"><span class="text-lg font-bold tracking-[-0.01em]">Reverse-Specification</span><span class="text-sm font-semibold text-blue-ink">What it must do</span></div>
						<ul class="m-0 flex list-none flex-col gap-1 p-0">
							{#each ['Features', 'Actions and journeys', 'Business rules', 'Expected behaviours and invariants', 'Testable requirements'] as line (line)}
								<li class={LI}><span class="flex-none text-blue-ink">•</span>{line}</li>
							{/each}
						</ul>
					</div>
					<div class="flex min-w-0 flex-[1_1_240px] flex-col gap-3 border-t-4 border-blue bg-surface-sunken px-5 py-[18px]">
						<span class="font-evo-mono text-xs font-semibold tracking-[0.08em] text-blue-ink">2 · TECHNICAL</span>
						<div class="flex flex-col gap-0.5"><span class="text-lg font-bold tracking-[-0.01em]">Retro-documentation</span><span class="text-sm font-semibold text-blue-ink">How it’s built</span></div>
						<ul class="m-0 flex list-none flex-col gap-1 p-0">
							{#each ['Architecture and modules', 'Dependencies', 'Data model', 'Interfaces and API', 'Processing flows'] as line (line)}
								<li class={LI}><span class="flex-none text-blue-ink">•</span>{line}</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>

	<section
		aria-label="How it works"
		class="flex flex-col gap-3.5 bg-ink px-6 py-5"
	>
		<h2 class="m-0 text-xl leading-tight font-bold tracking-[-0.02em] text-paper">How it works</h2>
		<div class="flex flex-wrap items-stretch gap-2.5">
			<div class={STEP}>
				<span aria-hidden="true" class="flex size-10 flex-none items-center justify-center bg-blue-ink text-paper"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path></svg></span>
				<span class="flex min-w-0 flex-col gap-0.5"><span class={STEP_KICKER}>STEP 1</span><span class="text-[0.9375rem] font-bold text-paper">Paste a prompt in your LLM</span></span>
			</div>
			<span aria-hidden="true" class="flex-none self-center font-evo-mono text-lg text-ink-4">→</span>
			<div class={STEP}>
				<span aria-hidden="true" class="flex size-10 flex-none items-center justify-center bg-violet-ink text-paper">{@render sparkle(18)}</span>
				<span class="flex min-w-0 flex-col gap-0.5"><span class={STEP_KICKER}>STEP 2</span><span class="text-[0.9375rem] font-bold text-paper">Lyriks analyzes</span></span>
			</div>
			<span aria-hidden="true" class="flex-none self-center font-evo-mono text-lg text-ink-4">→</span>
			<div class={STEP}>
				<span aria-hidden="true" class="flex size-10 flex-none items-center justify-center bg-green text-ink"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg></span>
				<span class="flex min-w-0 flex-col gap-0.5"><span class={STEP_KICKER}>STEP 3</span><span class="text-[0.9375rem] font-bold text-paper">You check and validate</span></span>
			</div>
		</div>
	</section>

	<PageFoot class="flex justify-end">
		<button type="button" class={PRIMARY_48} disabled={!canWrite} title={canWrite ? undefined : 'Only a project editor can start a Reverse-Specification'} onclick={onStart}>Start a Reverse-Specification →</button>
	</PageFoot>
</div>
