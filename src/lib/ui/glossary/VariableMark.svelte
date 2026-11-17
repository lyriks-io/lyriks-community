<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import type { Mark } from '$domain/glossary';
	import { leaveTheStage, takeTheStage } from '$ui/shell/one-card';
	import { floatInView } from '$ui/design-system/float-in-view';

	interface Props {
		text: string;
		identifiers: readonly string[];
		definitions?: readonly Mark[];
		children?: Snippet;
	}
	let { text, identifiers, definitions = [], children }: Props = $props();
	const banned = $derived(definitions.some((definition) => definition.kind === 'banned'));
	const tooltipId = $props.id();
	let open = $state(false);
	let focused = false;
	let hovered = false;
	let anchor = $state<HTMLElement>();
	function close() { open = false; leaveTheStage(close); }
	function show() {
		takeTheStage(close);
		open = true;
	}
	onDestroy(() => leaveTheStage(close));
</script>

<span
	bind:this={anchor}
	role="button"
	tabindex="0"
	aria-label={`Variable identifiers: ${identifiers.join(', ')}`}
	aria-describedby={open ? tooltipId : undefined}
	onmouseenter={() => { hovered = true; show(); }}
	onmouseleave={() => { hovered = false; if (!focused) close(); }}
	onfocus={() => { focused = true; show(); }}
	onblur={() => { focused = false; if (!hovered) close(); }}
	onclick={show}
	onkeydown={(event) => { if (event.key === 'Escape') close(); else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } }}
	class="variable-mark cursor-help underline {banned ? 'decoration-danger-400 decoration-dashed' : 'decoration-ink-300 decoration-dotted'} underline-offset-2 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-400"
>{#if children}{@render children()}{:else}{text}{/if}</span>{#if open}<span
	use:floatInView={{ anchor, prefer: 'above' }}
	id={tooltipId}
	role="tooltip"
	class="pointer-events-none fixed z-120 w-max max-w-sm rounded-card border border-line bg-surface px-3 py-2 text-left shadow-card"
><span class="block text-[0.625rem] font-bold uppercase tracking-wide text-ink-500">Variable identifier{identifiers.length > 1 ? 's' : ''}</span>{#each identifiers as identifier (identifier)}<code class="block whitespace-normal break-all text-xs text-ink-900">{identifier}</code>{/each}{#each definitions as definition, i (i)}<span class="mt-1 block text-xs font-semibold text-ink-800">{definition.canonical}</span>{#if definition.definition.trim()}<span class="block text-[0.6875rem] leading-snug text-ink-500">{definition.definition}</span>{/if}{/each}</span>{/if}
