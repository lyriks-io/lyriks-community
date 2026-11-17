<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Icon } from '$ui/design-system';
	import { toErDiagram } from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';
	import Mermaid from './Mermaid.svelte';
	import DataRulesView from './DataRulesView.svelte';

	interface Props {
		store: DataStore;
	}
	let { store }: Props = $props();

	const code = $derived(toErDiagram(store.draft));
	// A link to one rule opens the rules reading on it (`view=rules&rule=<key>`).
	const focusRule = untrack(() => page.url.searchParams.get('rule'));
	const canWrite = $derived((page.data as { canWrite?: boolean }).canWrite !== false);
	// The solver's verdicts are an Enterprise capability, declared by the root layout.
	const proofs = $derived((page.data as { proofs?: boolean }).proofs === true);
	const relationCount = $derived(
		store.draft.fields.filter((f) => f.type === 'relation' && f.relationTargetEntityId).length
	);

	// The diagram and its plain rules are two readings of the same model: one
	// replaces the other so the canvas keeps the full height.
	let view = $state<'diagram' | 'rules'>(
		untrack(() => (page.url.searchParams.get('view') === 'rules' ? 'rules' : 'diagram'))
	);

	const views = [
		{ id: 'diagram', label: 'Diagram', icon: 'table' },
		{ id: 'rules', label: 'Rules', icon: 'file-check' }
	] as const;

	// Fill the rest of the screen: 100dvh minus the chrome above/below the canvas
	// (page header, tab bar, card header, hint, legend, save bar).
	const CANVAS_HEIGHT = 'max(460px, calc(100dvh - 420px))';
</script>

<section class="rounded-card border border-line bg-surface">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
		<div>
			<p class="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Data model</p>
			<p class="text-xs text-ink-500">
				{store.draft.entities.length} table(s) · {relationCount} relation(s) - the classic entity map
				with one-to-many / many-to-one cardinalities.
			</p>
		</div>
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
	</header>

	{#if store.draft.entities.length === 0}
		<p class="px-4 py-10 text-center text-xs text-ink-400">
			{view === 'rules'
				? 'No table yet. Model your tables and the rules they state appear here.'
				: 'No table yet. Model your tables (or derive them from journeys) and the data map appears here.'}
		</p>
	{:else if view === 'rules'}
		<DataRulesView
			projectId={store.draft.projectId}
			{canWrite}
			savedAt={store.draft.lastSavedAt}
			{focusRule}
			height={CANVAS_HEIGHT}
			{proofs}
		/>
	{:else if view === 'diagram'}
		<div class="p-4">
			<div class="overflow-hidden rounded-card border border-line bg-surface-sunken/30">
				<Mermaid {code} title="Data model: every table, its fields and how they relate" height={CANVAS_HEIGHT} />
			</div>
			<p class="mt-2 text-[0.625rem] text-ink-400">
				Drag to pan · scroll to zoom · double-click to fit.
			</p>
		</div>
	{/if}

	<!-- cardinality legend: the rules reading has no notation to explain -->
	{#if view !== 'rules'}
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[0.625rem] text-ink-400">
		<span class="font-semibold uppercase tracking-widest">Cardinality</span>
		<span><span class="font-mono text-ink-600">||--o&#123;</span> one-to-many (list field)</span>
		<span><span class="font-mono text-ink-600">&#125;o--||</span> many-to-one (required)</span>
		<span><span class="font-mono text-ink-600">&#125;o--o|</span> zero-or-one (optional)</span>
		<span class="text-ink-300">·</span>
		<span><span class="font-mono text-ink-600">PK</span> primary key</span>
		<span><span class="font-mono text-ink-600">FK</span> relation</span>
		<span><span class="font-mono text-ink-600">UK</span> unique</span>
	</div>
	{/if}
</section>
