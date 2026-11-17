<script lang="ts">
	import Icon from './Icon.svelte';
	import type { ChipTone } from './Chip.svelte';
	import { clickedWithin, floatInView } from './float-in-view';

	type Option = string | { code: string; label: string };

	interface Props {
		/** Selected values (codes). */
		values: string[];
		/** The pickable options. */
		options?: readonly Option[];
		placeholder?: string;
		/** Allow typing a value that isn't in the options list (Enter to add). */
		allowCustom?: boolean;
		/** Kept for API compatibility; chips render in the brand tone like the mockup. */
		tone?: ChipTone;
		onchange: (values: string[]) => void;
	}
	let {
		values,
		options = [],
		placeholder = 'Pick…',
		allowCustom = true,
		onchange
	}: Props = $props();

	let open = $state(false);
	let search = $state('');
	let root = $state<HTMLDivElement>();
	let panel = $state<HTMLDivElement>();

	const norm = $derived(
		options.map((o) => (typeof o === 'string' ? { code: o, label: o } : o))
	);
	const labelOf = (code: string) => norm.find((o) => o.code === code)?.label ?? code;
	const filtered = $derived(
		norm
			.filter((o) => !values.includes(o.code))
			.filter((o) => !search.trim() || o.label.toLowerCase().includes(search.trim().toLowerCase()))
	);

	function add(code: string) {
		if (!code || values.includes(code)) return;
		onchange([...values, code]);
		search = '';
	}
	function remove(i: number) {
		onchange(values.filter((_, idx) => idx !== i));
	}
	function addCustom() {
		const v = search.trim();
		if (!v || values.includes(v)) return;
		const match = norm.find((o) => o.label.toLowerCase() === v.toLowerCase());
		add(match ? match.code : v);
	}
	function toggle() {
		open = !open;
		if (!open) search = '';
	}
	function onWindowClick(e: MouseEvent) {
		if (open && !clickedWithin(e.target, root, panel)) {
			open = false;
			search = '';
		}
	}
	function autofocus(node: HTMLInputElement) {
		node.focus();
	}
</script>

<svelte:window onclick={onWindowClick} />

<div class="relative" bind:this={root}>
	<!-- Trigger: chips live inside the box, chevron on the right -->
	<div
		role="button"
		tabindex="0"
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={toggle}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		}}
		class="flex min-h-12 w-full cursor-pointer flex-wrap items-center gap-1.5 border-[1.5px] bg-surface-sunken px-3.5 py-1.5 text-left text-sm transition-colors hover:border-ink {open
			? 'border-blue'
			: 'border-ink-3'}"
	>
		{#if values.length === 0}
			<span class="text-sm text-ink-3">{placeholder}</span>
		{:else}
			{#each values as v, i (v + i)}
				<span
					class="inline-flex items-center gap-1 bg-ink px-2 py-0.5 text-xs font-medium text-paper"
				>
					{labelOf(v)}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							remove(i);
						}}
						aria-label="Remove"
						class="-mr-0.5 leading-none text-toner-2 hover:text-red-on-ink"
					>
						<Icon name="x" size={12} />
					</button>
				</span>
			{/each}
		{/if}
		<Icon
			name="chevron-down"
			size={14}
			class="ml-auto shrink-0 text-ink-3 transition-transform {open ? 'rotate-180' : ''}"
		/>
	</div>

	<!-- Opens whole, inside the window, as wide as its field at least (criterion 5651ca29). -->
	{#if open}
		<div bind:this={panel} use:floatInView={{ anchor: root, matchWidth: true }} class="overflow-hidden border-[1.5px] border-ink bg-paper shadow-pop">
			<input
				use:autofocus
				bind:value={search}
				placeholder={allowCustom ? 'Search or type to add…' : 'Search…'}
				onkeydown={(e) => {
					if (e.key === 'Enter' && allowCustom && filtered.length === 0) {
						e.preventDefault();
						addCustom();
					}
				}}
				class="w-full border-b border-line bg-surface-sunken px-3 py-2 text-xs text-ink placeholder:text-ink-3 focus:outline-none"
			/>
			<div class="max-h-60 overflow-y-auto">
				{#each filtered as o (o.code)}
					<button
						type="button"
						onclick={() => add(o.code)}
						class="block w-full px-3 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface-sunken"
					>
						{o.label}
					</button>
				{/each}
				{#if filtered.length === 0 && allowCustom && search.trim()}
					<button
						type="button"
						onclick={addCustom}
						class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-semibold text-blue-ink hover:bg-blue-tint"
					>
						<Icon name="plus" size={12} /> Add "{search.trim()}"
					</button>
				{:else if filtered.length === 0}
					<div class="px-3 py-3 text-xs italic text-ink-3">No options.</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
