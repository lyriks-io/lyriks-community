<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import { toErDiagram } from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';
	import Mermaid from './Mermaid.svelte';

	interface Props {
		store: DataStore;
	}
	let { store }: Props = $props();

	const code = $derived(toErDiagram(store.draft));
	const relationCount = $derived(
		store.draft.fields.filter((f) => f.type === 'relation' && f.relationTargetEntityId).length
	);

	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard blocked — switch to the source view to select it by hand */
		}
	}

	// The diagram and its Mermaid source are two readings of the same model — one
	// replaces the other so the canvas keeps the full height in both.
	let view = $state<'diagram' | 'source'>('diagram');

	const views = [
		{ id: 'diagram', label: 'Diagram', icon: 'table' },
		{ id: 'source', label: 'Mermaid source', icon: 'list' }
	] as const;

	// Fill the rest of the screen: 100dvh minus the chrome above/below the canvas
	// (page header, tab bar, card header, hint, legend, save bar).
	const CANVAS_HEIGHT = 'max(460px, calc(100dvh - 420px))';
</script>

<section class="rounded-card border border-line bg-surface">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
		<div>
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Data model</p>
			<p class="text-xs text-ink-500">
				{store.draft.entities.length} table(s) · {relationCount} relation(s) - the classic entity map
				with one-to-many / many-to-one cardinalities.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<div class="flex items-center gap-0.5 rounded-pill border border-line bg-surface-sunken/60 p-0.5" role="group" aria-label="Data model view">
				{#each views as v (v.id)}
					{@const isActive = view === v.id}
					<button
						type="button"
						onclick={() => (view = v.id)}
						aria-pressed={isActive}
						class="inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-xs font-medium transition-colors {isActive
							? 'bg-surface text-ink-900 shadow-sm'
							: 'text-ink-500 hover:text-ink-700'}"
					>
						<Icon name={v.icon} size={14} /> {v.label}
					</button>
				{/each}
			</div>
			<Button variant="outline" size="sm" onclick={copy}>
				<Icon name={copied ? 'check' : 'file'} size={14} /> {copied ? 'Copied' : 'Copy'}
			</Button>
		</div>
	</header>

	{#if store.draft.entities.length === 0}
		<p class="px-4 py-10 text-center text-xs text-ink-400">
			No table yet. Model your tables (or derive them from journeys) and the data map appears here.
		</p>
	{:else if view === 'diagram'}
		<div class="p-4">
			<div class="overflow-hidden rounded-card border border-line bg-surface-sunken/30">
				<Mermaid {code} height={CANVAS_HEIGHT} />
			</div>
			<p class="mt-2 text-[10px] text-ink-400">
				Drag to pan · scroll to zoom · double-click to fit.
			</p>
		</div>
	{:else}
		<div class="p-4">
			<pre
				class="overflow-auto rounded-card border border-line bg-ink-900/90 p-4 font-mono text-[11px] leading-relaxed text-ink-100"
				style="height: {CANVAS_HEIGHT}">{code}</pre>
			<p class="mt-2 text-[10px] text-ink-400">
				Mermaid erDiagram — paste it into any Mermaid renderer or a Markdown code fence.
			</p>
		</div>
	{/if}

	<!-- cardinality legend -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[10px] text-ink-400">
		<span class="font-semibold uppercase tracking-widest">Cardinality</span>
		<span><span class="font-mono text-ink-600">||--o&#123;</span> one-to-many (list field)</span>
		<span><span class="font-mono text-ink-600">&#125;o--||</span> many-to-one (required)</span>
		<span><span class="font-mono text-ink-600">&#125;o--o|</span> zero-or-one (optional)</span>
		<span class="text-ink-300">·</span>
		<span><span class="font-mono text-ink-600">PK</span> primary key</span>
		<span><span class="font-mono text-ink-600">FK</span> relation</span>
		<span><span class="font-mono text-ink-600">UK</span> unique</span>
	</div>
</section>
