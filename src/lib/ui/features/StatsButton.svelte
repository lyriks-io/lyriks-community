<script lang="ts">
	/**
	 * A stats icon that opens the behavior figures in a popover: the product's
	 * totals in the tree's toolbar, one feature's figures on its row.
	 */
	import { Icon, clickedWithin, floatInView } from '$ui/design-system';
	import BehaviorStats from './BehaviorStats.svelte';
	import type { BehaviorOverview } from '$application/specification/summarize-behavior';
	import type { FeatureImplementationCoverage } from '$application/use-cases';
	import { untrack } from 'svelte';
	import { oneMenu } from './one-menu.svelte';

	interface Props {
		overview: BehaviorOverview;
		implementation?: ReadonlyMap<string, FeatureImplementationCoverage>;
		featureId?: string | null;
		/** Popover heading, also the button's accessible name. */
		title: string;
		/** `md` in a toolbar, `sm` on a row. */
		size?: 'sm' | 'md';
		/** Whether the popover is open; bindable so a row menu can open it. */
		open?: boolean;
		/** False when something else (a row menu's Statistics) opens the popover. */
		trigger?: boolean;
	}
	let {
		overview,
		implementation,
		featureId = null,
		title,
		size = 'sm',
		open = $bindable(false),
		trigger = true
	}: Props = $props();

	let root = $state<HTMLElement>();
	let panel = $state<HTMLElement>();
	// One popover open at a time on the tree, shared with the row menus.
	const menuId = Symbol("stats popover");
	$effect(() => {
		if (open) untrack(() => oneMenu.claim(menuId));
	});
	$effect(() => {
		const owner = oneMenu.owner;
		if (owner !== null && owner !== menuId) untrack(() => (open = false));
	});
	function onWindowClick(e: MouseEvent) {
		if (open && !clickedWithin(e.target, root, panel)) open = false;
	}
	function onWindowKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div bind:this={root} class="relative shrink-0">
	{#if trigger}
	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			open = !open;
		}}
		aria-label={title}
		aria-expanded={open}
		title={title}
		class={size === 'md'
			? 'grid size-8 place-items-center rounded-pill border border-line bg-surface text-ink-500 transition hover:border-line-strong hover:text-ink-800'
			: 'grid size-6 place-items-center rounded-field text-ink-400 transition hover:bg-surface-sunken hover:text-ink-700'}
	>
		<Icon name="chart" size={size === 'md' ? 15 : 13} />
	</button>
	{/if}
	{#if open}
		<div bind:this={panel} use:floatInView={{ anchor: root, align: 'right' }}
			class="w-64 rounded-card border border-line bg-surface py-2 shadow-lg"
			role="dialog"
			aria-label={title}
		>
			<p class="px-3 pb-1 text-[0.59375rem] font-bold uppercase tracking-widest text-ink-400">{title}</p>
			<BehaviorStats {overview} {implementation} {featureId} />
		</div>
	{/if}
</div>
