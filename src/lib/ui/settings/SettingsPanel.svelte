<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon, type IconName } from '$ui/design-system';

	// One expandable settings panel. The page owns exclusivity (a single open
	// id), so this stays a dumb header-toggle around its content.

	interface Props {
		id: string;
		title: string;
		icon: IconName;
		/** Card + title accent; warning/danger match the reclaim / danger zones. */
		tone?: 'default' | 'warning' | 'danger';
		/** Right-aligned header annotation (edition, workspace role, …). */
		meta?: string;
		open: boolean;
		onToggle: (id: string) => void;
		children: Snippet;
	}
	let { id, title, icon, tone = 'default', meta, open, onToggle, children }: Props = $props();

	const CARD = {
		default: 'border-line bg-surface',
		warning: 'border-orange bg-orange-tint',
		danger: 'border-red-ink bg-red-tint'
	} as const;
	const TITLE = {
		default: 'text-ink-900',
		warning: 'text-ink-900',
		danger: 'text-red-ink'
	} as const;
	const ICON_TONE = {
		default: 'text-ink-900',
		warning: 'text-orange-ink',
		danger: 'text-red-ink'
	} as const;
</script>

<section {id} class="scroll-mt-6 rounded-card border {CARD[tone]}">
	<button
		type="button"
		onclick={() => onToggle(id)}
		aria-expanded={open}
		aria-controls="settings-panel-{id}"
		class="flex w-full items-center gap-2 rounded-card px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
	>
		<Icon name={icon} size={15} class={ICON_TONE[tone]} />
		<h2 class="text-sm font-bold {TITLE[tone]}">{title}</h2>
		<span class="ml-auto flex items-center gap-2">
			{#if meta}
				<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-500">{meta}</span>
			{/if}
			<Icon name="chevron-down" size={16} class="text-ink-900 transition-transform {open ? 'rotate-180' : ''}" />
		</span>
	</button>
	{#if open}
		<div id="settings-panel-{id}" class="space-y-4 px-5 pb-5">
			{@render children()}
		</div>
	{/if}
</section>
