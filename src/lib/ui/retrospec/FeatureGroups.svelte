<script lang="ts">
	import type { FeatureGroup } from '$domain/retrospec';
	import ItemControls from './ItemControls.svelte';
	import ItemThread from './ItemThread.svelte';
	import { REJECTED_CHIP, flagChip, itemBorder, struck } from './look';
	import { useReview } from './review.svelte';

	/** The Features tab: each core feature as a section, its features as rows a person validates or rejects. */
	let { groups, nextId }: { groups: readonly FeatureGroup[]; nextId: string | null } = $props();
	const review = useReview();
</script>

<div class="flex flex-col gap-5">
	{#each groups as group (group.id)}
		<section aria-label={group.title} class="flex flex-col gap-3.5 rounded-evo-card border border-evo-line bg-white p-6">
			<div class="flex min-w-0 flex-col gap-1">
				<span class="font-evo-mono text-[0.6875rem] font-semibold tracking-[0.08em] text-evo-violet-ink">CORE FEATURE</span>
				<h3 class="m-0 text-lg font-bold">{group.title}</h3>
				{#if group.desc}<span class="text-sm text-evo-muted">{group.desc}</span>{/if}
			</div>
			<div class="flex flex-col gap-2.5">
				{#each group.items as item (item.id)}
					{@const view = review.view(item.id)}
					{@const chip = flagChip(view)}
					<div id="rv-{item.id}" class="flex scroll-mt-36 flex-col gap-2.5 rounded-xl border px-4 py-3.5 transition-[border-color] duration-300 {itemBorder(view)}">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="flex min-w-0 flex-[1_1_320px] items-baseline gap-3">
								<span aria-hidden="true" class="flex-none text-evo-violet-ink">•</span>
								<span class="flex min-w-0 flex-col gap-0.5">
									<span class="flex flex-wrap items-center gap-2 text-base font-bold">
										{#if view.state === 'rejected'}<span class={REJECTED_CHIP}>REJECTED</span>{/if}
										<span class={struck(view)}>{item.title}</span>
										{#if chip}<span class=" px-[9px] py-[3px] text-xs font-semibold {chip.look}">{chip.text}</span>{/if}
									</span>
									{#if item.desc}<span class="text-sm text-evo-muted">{item.desc}</span>{/if}
								</span>
							</div>
							<ItemControls {item} next={item.id === nextId} />
						</div>
						<ItemThread {item} />
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
