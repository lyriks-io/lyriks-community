<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon, clickedWithin, floatInView, type IconName } from '$ui/design-system';

	/**
	 * One toolbar button that opens a panel, so the Data map toolbar stays a
	 * single quiet row (the way the feature tree narrows): the controls are one
	 * click away instead of all on screen. Closes on an outside click or Escape.
	 * The panel opens whole, inside the window, whatever box holds the button
	 * (criterion 5651ca29).
	 */
	interface Props {
		label: string;
		icon: IconName;
		/** How many settings inside depart from the default; tints the button and shows a count. */
		active?: number;
		align?: 'left' | 'right';
		/** `menu` for a list of commands that closes on pick, `dialog` for a panel of settings. */
		role?: 'menu' | 'dialog';
		/** `link` draws the trigger as plain text, for the quiet status line under the toolbar. */
		look?: 'button' | 'link';
		/** `field` draws the button as tall as a search field beside it (42px), so a toolbar reads as one line. */
		size?: 'compact' | 'field';
		children: Snippet<[() => void]>;
	}
	let { label, icon, active = 0, align = 'left', role = 'dialog', look = 'button', size = 'compact', children }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);
	const close = () => (open = false);

	function closeOnOutside(event: MouseEvent) {
		if (open && !clickedWithin(event.target, root, panel)) open = false;
	}
	function closeOnEscape(event: KeyboardEvent) {
		if (open && event.key === 'Escape') open = false;
	}
</script>

<svelte:window onclick={closeOnOutside} onkeydown={closeOnEscape} />

<div class="relative" bind:this={root}>
	{#if look === 'link'}
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			aria-haspopup={role}
			class="inline-flex items-center gap-1 text-warning-700 hover:underline"
		>
			{label}
			<Icon name="chevron-down" size={11} />
		</button>
	{:else}
	<button
		type="button"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-haspopup={role}
		class="inline-flex items-center gap-1.5 rounded-pill border {size === 'field' ? 'min-h-[42px] px-4' : 'px-3 py-1.5'} text-xs font-medium transition {active > 0
			? 'border-brand-300 bg-brand-50 text-brand-600'
			: 'border-line bg-surface text-ink-600 hover:border-line-strong hover:text-ink-800'}"
	>
		<Icon name={icon} size={13} />
		{label}
		{#if active > 0}
			<span class="rounded-pill bg-brand-500 px-1.5 text-[0.625rem] font-semibold tabular-nums text-white">{active}</span>
		{/if}
		<Icon name="chevron-down" size={12} class="text-ink-400" />
	</button>
	{/if}

	{#if open}
		<div
			bind:this={panel}
			use:floatInView={{ anchor: root, align }}
			{role}
			aria-label={label}
			class="rounded-card border border-line bg-surface p-3 shadow-xl"
		>
			{@render children(close)}
		</div>
	{/if}
</div>
