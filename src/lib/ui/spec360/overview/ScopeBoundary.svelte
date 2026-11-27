<script lang="ts">
	import type { ScopeBoundaryView } from '$application/spec360/scope-boundary';
	import { Icon } from '$ui/design-system';
	import { META, TAG } from '../page/look';
	import { capabilitiesCount as count, scopeDay } from './scope-day';

	/**
	 * Where the specification stops, as the Scope drawer reads it (criterion
	 * 3b04797c): In scope, how many capabilities and the sentence of what it
	 * covers; Out of scope, how many and by group, each folded with its name,
	 * its count and its summary; unfolded, its capabilities by name, a deferred
	 * one marked later, each with its reason unless the group shares one. The
	 * decision closes it. Read-only: an AI client writes the scope.
	 */
	interface Props {
		view: ScopeBoundaryView;
	}
	let { view }: Props = $props();
	const decidedOn = $derived(scopeDay(view.decidedAt));
</script>

<div class="grid gap-5">
	<div class="grid gap-1.5">
		<h3 class="m-0 flex items-baseline gap-2 text-[0.9375rem] font-bold text-ink">
			In scope
			<span class="{META} font-normal">{count(view.coveredCount)}</span>
		</h3>
		{#if view.covers}<p class="m-0 text-[0.9375rem] leading-[1.55] text-ink-2">{view.covers}</p>{/if}
	</div>

	<div class="grid gap-2">
		<h3 class="m-0 flex items-baseline gap-2 text-[0.9375rem] font-bold text-ink">
			Out of scope
			{#if view.leftOutCount > 0}<span class="{META} font-normal">{count(view.leftOutCount)}</span>{/if}
		</h3>
		{#if view.leftOut.length === 0}
			<p class="m-0 text-[0.875rem] text-ink-2">Nothing is out of scope.</p>
		{:else}
			<ul class="m-0 list-none border border-line bg-toner p-0" aria-label="Out of scope, by group">
				{#each view.leftOut as group (group.name)}
					<li class="border-b border-line last:border-b-0">
						<details class="group/scope">
							<summary class="flex min-h-11 cursor-pointer list-none items-start gap-3 px-4 py-2.5 hover:bg-toner-1">
								<Icon name="chevron-right" size={14} class="mt-[3px] flex-none text-ink-3 transition-transform group-open/scope:rotate-90" />
								<span class="grid min-w-0 flex-1 gap-0.5">
									<strong class="text-[0.875rem] leading-snug font-semibold text-ink">{group.name}</strong>
									{#if group.summary}<span class="text-[0.8125rem] leading-snug text-ink-2">{group.summary}</span>{/if}
								</span>
								<span class="flex-none font-evo-mono text-[0.6875rem] text-ink-3 tabular-nums"><b class="font-semibold text-ink-2">{group.items.length}</b></span>
							</summary>
							<div class="grid gap-2 px-4 pt-0.5 pb-3 pl-[42px]">
								{#if group.sharedReason}<p class="{META} m-0">Why: {group.sharedReason}</p>{/if}
								<ul class="m-0 grid list-none gap-1.5 p-0">
									{#each group.items as item (item.id)}
										<li class="grid gap-0.5">
											<span class="flex flex-wrap items-center gap-2 text-[0.84375rem] text-ink">
												{item.name}
												{#if item.later}<span class="{TAG} min-h-5 border-line px-1.5 text-[0.625rem] text-ink-3">later</span>{/if}
											</span>
											{#if item.reason}<span class="text-[0.8125rem] leading-snug text-ink-3">{item.reason}</span>{/if}
										</li>
									{/each}
								</ul>
							</div>
						</details>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if view.decision}
		<p class="m-0 border-t border-line pt-3 text-[0.84375rem] leading-normal text-ink-2">
			{#if decidedOn}<span class={META}>Decided {decidedOn}:</span>{/if}
			{view.decision}
		</p>
	{/if}
</div>
