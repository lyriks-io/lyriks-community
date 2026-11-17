<script lang="ts">
	import { untrack } from 'svelte';
	import type { ActionFeature, RetroItem } from '$domain/retrospec';
	import ItemControls from './ItemControls.svelte';
	import ItemThread from './ItemThread.svelte';
	import { REJECTED_CHIP, struck } from './look';
	import { useReview } from './review.svelte';

	/**
	 * The Actions tab: one fold per feature, its actions each with the rules
	 * that constrain them. The first feature with something left to validate
	 * opens by itself; a person opens and closes the others.
	 */
	let { features, nextId }: { features: readonly ActionFeature[]; nextId: string | null } = $props();
	const review = useReview();

	const idsOf = (f: ActionFeature) => f.actions.flatMap((a) => [a.item.id, ...a.rules.map((r) => r.id)]);
	const firstOpen = $derived(features.find((f) => idsOf(f).some((id) => !review.view(id).handled))?.id ?? null);
	/** Undefined until the person folds or unfolds one: the first one left open by itself until then. */
	let chosen = $state<string | null | undefined>(undefined);
	const openId = $derived(chosen === undefined ? firstOpen : chosen);
	// When the review moves on to another feature, that feature unfolds; a fold the person chose stays otherwise.
	const nextFeature = $derived(nextId ? (features.find((f) => idsOf(f).includes(nextId))?.id ?? null) : null);
	let followed: string | null = null;
	$effect(() => {
		const target = nextFeature;
		untrack(() => {
			if (target === followed) return;
			if (followed !== null && chosen !== undefined && target) chosen = target;
			followed = target;
		});
	});
</script>

{#snippet row(item: RetroItem, kind: 'ACTION' | 'RULE')}
	{@const view = review.view(item.id)}
	<div id="rv-{item.id}" class="flex scroll-mt-36 flex-col gap-1.5 {kind === 'RULE' ? 'py-1.5' : ''}">
		<div class="flex flex-wrap items-center gap-2.5 {kind === 'RULE' ? 'text-sm' : ''}">
			<span class="flex-none font-evo-mono text-[0.6875rem] font-semibold text-evo-muted">{kind}</span>
			{#if view.state === 'rejected'}<span class={REJECTED_CHIP}>REJECTED</span>{/if}
			<span class="flex-[1_1_260px] leading-normal {kind === 'ACTION' ? 'text-[0.9375rem] font-semibold' : ''} {struck(view)}">{item.title}</span>
			<span class="flex-none"><ItemControls {item} next={item.id === nextId} /></span>
		</div>
		<ItemThread {item} />
	</div>
{/snippet}

<div class="flex flex-col gap-3">
	{#each features as feature (feature.id)}
		{@const ids = idsOf(feature)}
		{@const ok = ids.filter((id) => review.view(id).handled).length}
		{@const open = openId === feature.id}
		<div class="overflow-hidden rounded-evo-card bg-white transition-shadow duration-200 {open ? 'border border-evo-violet-edge' : 'border border-evo-line'}">
			<button type="button" aria-expanded={open} class="flex min-h-15 w-full flex-wrap items-center gap-3.5 px-5 py-3.5 text-left text-evo-ink" onclick={() => (chosen = open ? null : feature.id)}>
				<span class="flex flex-[1_1_260px] flex-col gap-0.5">
					{#if feature.core}<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] text-evo-muted">{feature.core}</span>{/if}
					<span class="text-base font-bold">{feature.name}</span>
				</span>
				<span class="text-[0.8125rem] font-semibold {ok === ids.length ? 'text-evo-green' : 'text-evo-muted'}">{ok === ids.length ? '✓ Fully validated' : `${ok} / ${ids.length} validated`}</span>
				<span aria-hidden="true" class="inline-block text-evo-muted transition-transform duration-200 {open ? 'rotate-180' : ''}">▾</span>
			</button>
			{#if open}
				<div class="flex animate-[lk-in_0.25s_ease_both] flex-col gap-3 px-5 pt-1 pb-5">
					{#each feature.actions as action (action.item.id)}
						<div class="flex flex-col gap-1.5 rounded-xl bg-evo-sunken px-4 py-3.5">
							{@render row(action.item, 'ACTION')}
							{#if action.rules.length > 0}
								<div class="mt-1 flex flex-col gap-1 pl-3.5">
									{#each action.rules as rule (rule.id)}{@render row(rule, 'RULE')}{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>
