<script lang="ts">
	import { page } from '$app/state';
	import { PLANS, type Plan } from '$domain/tier';
	import { PRICING_URL } from '$domain/licensing';

	// The four offers of Lyriks (EVO-001), the workspace's own one marked. Their
	// prices are not settled: a paid plan shows no figure and points to the
	// plans page, linked only where the installation allows links out
	// (criterion b4538030). Moving to another plan takes a key, entered on the
	// activation page (told which plan was asked so it can say where that key
	// comes from), and a change of the installation's configuration: the key
	// alone does not move the plan.
	let { current, onclose }: { current: Plan; onclose: () => void } = $props();
	const online = $derived(!!page.data.onlineHelp);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div role="dialog" aria-modal="true" aria-label="Plans" tabindex="-1" class="fixed inset-0 z-[85] box-border flex animate-lk-fade items-start justify-center overflow-y-auto bg-ink/45 px-4 py-10 font-evo">
	<div class="box-border flex w-full max-w-[980px] flex-col gap-[18px] border-2 border-ink bg-paper p-6 text-ink shadow-pop">
		<div class="flex items-start justify-between gap-3">
			<span class="flex flex-col gap-1">
				<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3">PLANS</span>
				<h2 class="m-0 text-2xl font-bold tracking-[-0.02em]">Your plan: {current.name}</h2>
			</span>
			<button type="button" onclick={onclose} aria-label="Close" class="size-9 cursor-pointer border-[1.5px] border-line bg-transparent text-lg text-ink">×</button>
		</div>
		<div class="flex flex-wrap items-stretch gap-3.5">
			{#each PLANS as plan (plan.id)}
				{@const cur = plan.id === current.id}
				<!-- The design's choice card (.ly-choice): sand, the current one paper with an ink border. -->
				<div class="box-border flex min-w-0 flex-[1_1_200px] flex-col gap-3 p-5 {cur ? 'border-2 border-ink bg-paper' : 'border border-transparent bg-surface'}">
					<div class="flex items-center justify-between gap-2">
						<span class="text-lg font-bold tracking-[-0.01em]">{plan.name}</span>
						{#if cur}<span class="border-[1.5px] border-ink bg-ink px-2.5 py-[3px] font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-paper uppercase">Current plan</span>{/if}
					</div>
					{#if plan.free}
						<span class="text-[1.375rem] font-bold tracking-[-0.03em] text-ink">Free</span>
					{:else if online}
						<a href={PRICING_URL} target="_blank" rel="noopener noreferrer" class="text-[0.8125rem] font-bold text-blue-ink">See the price on the plans page</a>
					{:else}
						<span class="text-[0.8125rem] text-ink-2">Price on {PRICING_URL.replace(/^https?:\/\//, '')}</span>
					{/if}
					<span class="text-[0.8125rem] text-ink-2">{plan.pitch}</span>
					<div class="flex flex-col gap-1.5">
						{#each plan.includes as item (item)}
							<span class="flex gap-2 text-[0.8125rem] leading-[1.45]"><span aria-hidden="true" class="font-bold text-green-ink">✓</span>{item}</span>
						{/each}
						{#each plan.excludes as item (item)}
							<span class="flex gap-2 text-[0.8125rem] leading-[1.45] text-red-ink"><span aria-hidden="true" class="font-bold">×</span>{item}</span>
						{/each}
					</div>
					{#if !cur && !plan.free}
						<a href="/activate?plan={plan.id}" onclick={onclose} class="pressable mt-auto flex min-h-10 items-center justify-center border-[1.5px] border-ink bg-transparent text-xs font-bold tracking-[0.07em] text-ink uppercase no-underline">Switch to {plan.name}</a>
					{/if}
				</div>
			{/each}
		</div>
		<!-- Plans and keys do not share a vocabulary: four offers, two key editions.
		     Said here so Switch to <plan> promises nothing a key alone does not do (issues.238, issues.332). -->
		<p class="m-0 text-[0.8125rem] leading-[1.5] text-ink-2" data-plans-switch-note>
			Plans are named as on lyriks.io/pricing; a licence key grants one of two editions, Community or Enterprise.
			Switching plan takes a key for that plan, entered on the activation page, and a change of this
			installation's configuration by whoever runs it: the key alone does not change which pages it opens.
		</p>
	</div>
</div>
