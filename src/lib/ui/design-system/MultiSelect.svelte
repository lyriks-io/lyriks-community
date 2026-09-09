<script lang="ts">
	import Icon from './Icon.svelte';
	import type { ChipTone } from './Chip.svelte';

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
		if (open && root && !root.contains(e.target as Node)) {
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
		class="flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-field border bg-surface px-2 py-1.5 text-left transition-colors hover:border-line-strong {open
			? 'border-brand-400'
			: 'border-line'}"
	>
		{#if values.length === 0}
			<span class="px-1 text-xs text-ink-400">{placeholder}</span>
		{:else}
			{#each values as v, i (v + i)}
				<span
					class="inline-flex items-center gap-1 rounded-pill bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600"
				>
					{labelOf(v)}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							remove(i);
						}}
						aria-label="Remove"
						class="-mr-0.5 leading-none text-brand-400 hover:text-danger-500"
					>
						<Icon name="x" size={12} />
					</button>
				</span>
			{/each}
		{/if}
		<Icon
			name="chevron-down"
			size={14}
			class="ml-auto shrink-0 text-ink-400 transition-transform {open ? 'rotate-180' : ''}"
		/>
	</div>

	{#if open}
		<div
			class="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-card border border-line bg-surface shadow-card"
		>
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
				class="w-full border-b border-line bg-surface-sunken px-3 py-2 text-xs text-ink-900 placeholder:text-ink-400 focus:outline-none"
			/>
			<div class="max-h-60 overflow-y-auto">
				{#each filtered as o (o.code)}
					<button
						type="button"
						onclick={() => add(o.code)}
						class="block w-full px-3 py-1.5 text-left text-xs text-ink-700 transition-colors hover:bg-surface-sunken"
					>
						{o.label}
					</button>
				{/each}
				{#if filtered.length === 0 && allowCustom && search.trim()}
					<button
						type="button"
						onclick={addCustom}
						class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-brand-600 hover:bg-brand-50"
					>
						<Icon name="plus" size={12} /> Add "{search.trim()}"
					</button>
				{:else if filtered.length === 0}
					<div class="px-3 py-3 text-xs italic text-ink-400">No options.</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
