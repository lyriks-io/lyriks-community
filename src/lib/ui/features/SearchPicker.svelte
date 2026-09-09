<script module lang="ts">
	import type { IconName } from '$ui/design-system';

	/** One row of a {@link SearchPicker}. */
	export interface PickerOption {
		key: string;
		label: string;
		/** Secondary line: where the item lives, where it currently sits. */
		hint?: string | null;
		icon?: IconName;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { Icon } from '$ui/design-system';

	/**
	 * A searchable "pick one" menu behind a small trigger button, for lists too
	 * long for a plain dropdown (every leaf feature, every action). The menu is
	 * body-portalled and fixed-positioned (same recipe as HelpTip), so no
	 * ancestor can hide it: not an `overflow-hidden` table, not a sibling card
	 * painted later, not the sticky save bar. It flips above the trigger when
	 * the viewport has no room below.
	 */
	interface Props {
		options: PickerOption[];
		onPick: (key: string) => void;
		/** Text on the trigger button. */
		triggerLabel: string;
		triggerTitle?: string;
		placeholder?: string;
		emptyText?: string;
		/** Which edge of the trigger the menu lines up with. */
		align?: 'left' | 'right';
		/** Trigger look: `dashed` is the quiet in-card affordance, `solid` the brand button. */
		variant?: 'dashed' | 'solid';
		/** Aria label for the trigger, when `triggerLabel` alone is too terse. */
		ariaLabel?: string;
	}
	let {
		options,
		onPick,
		triggerLabel,
		triggerTitle = '',
		placeholder = 'Search…',
		emptyText = 'Nothing to add.',
		align = 'left',
		variant = 'dashed',
		ariaLabel
	}: Props = $props();

	const MAX_ROWS = 60;
	const WIDTH = 288; // w-72
	/** Search row + the list's max height: what a fully populated menu takes. */
	const MAX_HEIGHT = 336;

	let open = $state(false);
	let query = $state('');
	let trigger = $state<HTMLButtonElement>();
	let menu = $state<HTMLElement>();
	let input = $state<HTMLInputElement>();
	let x = $state(0);
	let y = $state(0);
	let placeAbove = $state(false);

	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q)
		);
	});
	const shown = $derived(matches.slice(0, MAX_ROWS));

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	function position() {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const margin = 8;
		const left = align === 'right' ? r.right - WIDTH : r.left;
		x = Math.min(Math.max(margin, left), window.innerWidth - WIDTH - margin);
		// Prefer below the trigger; flip above when the room below is too short.
		const belowRoom = window.innerHeight - r.bottom;
		placeAbove = belowRoom < MAX_HEIGHT && r.top > belowRoom;
		y = placeAbove ? r.top - 4 : r.bottom + 4;
	}

	function onWindowClick(e: MouseEvent) {
		if (!open) return;
		const t = e.target as Node;
		if (trigger?.contains(t) || menu?.contains(t)) return;
		open = false;
	}
	async function toggle() {
		open = !open;
		if (!open) return;
		query = '';
		position();
		await tick();
		input?.focus();
	}
	function close() {
		open = false;
		trigger?.focus();
	}
	function pick(key: string) {
		onPick(key);
		open = false;
	}
</script>

<svelte:window
	onclick={onWindowClick}
	onresize={() => open && position()}
	onscrollcapture={() => open && position()}
/>

<button
	bind:this={trigger}
	type="button"
	onclick={() => void toggle()}
	aria-haspopup="menu"
	aria-expanded={open}
	aria-label={ariaLabel ?? triggerLabel}
	title={triggerTitle || triggerLabel}
	class={variant === 'solid'
		? 'inline-flex shrink-0 items-center gap-1 rounded-field bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white hover:shadow-card'
		: 'inline-flex shrink-0 items-center gap-1 rounded-field border border-dashed border-line px-2 py-1 text-[11px] font-medium text-ink-500 transition hover:border-brand-300 hover:bg-brand-50/30 hover:text-brand-600'}
>
	<Icon name="plus" size={variant === 'solid' ? 13 : 11} />
	{triggerLabel}
</button>

{#if open}
	<div
		bind:this={menu}
		use:portal
		role="menu"
		aria-label={ariaLabel ?? triggerLabel}
		class="fixed z-[130] w-72 rounded-lg border border-line bg-surface shadow-xl"
		style="left:{x}px; top:{y}px; {placeAbove ? 'transform: translateY(-100%);' : ''}"
	>
		<div class="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
			<Icon name="search" size={12} class="shrink-0 text-ink-400" />
			<input
				bind:this={input}
				bind:value={query}
				type="text"
				{placeholder}
				aria-label={placeholder}
				onkeydown={(e) => {
					if (e.key === 'Escape') {
						e.stopPropagation();
						close();
					}
				}}
				class="min-w-0 flex-1 bg-transparent text-xs text-ink-900 outline-none placeholder:text-ink-300"
			/>
		</div>
		<div class="max-h-72 overflow-y-auto py-1">
			{#each shown as o (o.key)}
				<button
					type="button"
					role="menuitem"
					onclick={() => pick(o.key)}
					class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-sunken"
				>
					{#if o.icon}
						<span class="shrink-0 text-ink-400"><Icon name={o.icon} size={12} /></span>
					{/if}
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[12px] font-medium text-ink-800">{o.label}</span>
						{#if o.hint}
							<span class="block truncate text-[10px] text-ink-400">{o.hint}</span>
						{/if}
					</span>
				</button>
			{/each}
			{#if matches.length === 0}
				<p class="px-2.5 py-2 text-[11px] italic text-ink-400">
					{options.length === 0 ? emptyText : 'No match.'}
				</p>
			{:else if matches.length > shown.length}
				<p class="border-t border-line px-2.5 py-1.5 text-[10px] text-ink-400">
					{matches.length - shown.length} more; refine the search.
				</p>
			{/if}
		</div>
	</div>
{/if}
