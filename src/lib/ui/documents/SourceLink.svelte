<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DOCUMENT_KINDS, sourceGist } from '$domain/documents';
	import { getDocumentRegistry } from './registry.svelte';
	import { openSourceReader, type ReadableSource } from './source-reader.svelte';

	/**
	 * One citation, readable where it stands. Hovering (or focusing) it shows a
	 * card with the source's name, kind and the first sentence of what it says;
	 * clicking opens the whole source in the reader. Every citation renders
	 * through this, so a source reads the same on every surface (spec: Read a
	 * cited source).
	 */
	interface Props {
		source: ReadableSource;
		class?: string;
		/** The visible label; the source's title when omitted. */
		children?: Snippet;
		/** The element the citation belongs to: the reader highlights its passages (criterion f09da92d). */
		element?: string;
	}
	let { source, class: klass = '', children, element }: Props = $props();

	const registry = getDocumentRegistry();
	const title = $derived(source.title || source.url || 'Untitled source');
	const gist = $derived(sourceGist(source));
	const kindLabel = $derived(
		DOCUMENT_KINDS.find((k) => k.code === source.kind)?.label ?? source.kind ?? 'Source'
	);

	const WIDTH = 300;
	const DELAY_MS = 250;
	let anchor = $state<HTMLButtonElement>();
	let open = $state(false);
	let x = $state(0);
	let y = $state(0);
	let above = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	function place() {
		if (!anchor) return;
		const r = anchor.getBoundingClientRect();
		const margin = 8;
		x = Math.min(Math.max(margin, r.left), window.innerWidth - WIDTH - margin);
		const below = window.innerHeight - r.bottom;
		above = below < 160 && r.top > below;
		y = above ? r.top - 6 : r.bottom + 6;
	}

	// A short delay so sweeping the pointer across a row of chips does not
	// flash a card for each one.
	function show() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			place();
			open = true;
		}, DELAY_MS);
	}

	function hide() {
		if (timer) clearTimeout(timer);
		timer = null;
		open = false;
	}

	function read() {
		hide();
		openSourceReader({ source, registerHref: registry?.documentsHref, anchor, ...(element && registry ? { element: { projectId: registry.projectId, anchor: element } } : {}) });
	}

	$effect(() => () => {
		if (timer) clearTimeout(timer);
	});
</script>

<button
	bind:this={anchor}
	type="button"
	onclick={read}
	onmouseenter={show}
	onmouseleave={hide}
	onfocus={show}
	onblur={hide}
	aria-haspopup="dialog"
	aria-label="Read the source {title}"
	class="truncate text-left underline-offset-2 hover:underline {klass}"
>
	{#if children}{@render children()}{:else}{title}{/if}
</button>

{#if open}
	<div
		use:portal
		role="tooltip"
		class="pointer-events-none fixed z-[130] rounded-card border border-ink-300 border-l-4 border-l-brand-500 bg-surface px-3.5 py-3 text-left shadow-pop ring-1 ring-ink-900/5"
		style="left:{x}px; top:{y}px; width:{WIDTH}px; {above ? 'transform: translateY(-100%);' : ''}"
	>
		<p class="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink-400">{kindLabel}</p>
		<p class="mt-0.5 break-words text-[0.8125rem] font-semibold leading-snug text-ink-900">{title}</p>
		{#if gist}
			<p class="mt-1.5 break-words text-[0.8125rem] leading-relaxed text-ink-700">{gist}</p>
		{/if}
		<p class="mt-2 text-[0.6875rem] font-medium text-brand-600">Click to read the whole source</p>
	</div>
{/if}
