<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Icon } from '$ui/design-system';
	import { ARCH_LAYERS, techOfLayer, type ArchLayer } from '$domain/architecture';
	import { getDocumentRegistry } from '$ui/documents/registry.svelte';
	import type { ArchitectureStore } from '../draft-store.svelte';

	interface Props {
		store: ArchitectureStore;
	}
	let { store }: Props = $props();

	// The project evidence register — a tech choice points at one of its rows.
	const registry = getDocumentRegistry();
	const sources = $derived(registry?.sources ?? []);
	const documentsHref = $derived(registry?.documentsHref ?? '');

	// First time an author opens the board and it's empty, seed it from Foundation
	// & Data automatically — no opaque button to discover. Guarded to the empty case,
	// so it never clobbers a curated stack; the manual "Import" button handles the
	// rest. See `autoDeriveIfEmpty`.
	onMount(() => store.autoDeriveIfEmpty());

	// Per-layer accent (mockup colours): coloured label + coloured tech cards.
	const layerLabel: Record<ArchLayer, string> = {
		frontend: 'text-info-600',
		backend: 'text-brand-600',
		data: 'text-danger-600',
		integrations: 'text-warning-600',
		infra: 'text-success-600'
	};
	const layerCard: Record<ArchLayer, string> = {
		frontend: 'border-info-200 bg-info-50',
		backend: 'border-brand-200 bg-brand-50',
		data: 'border-danger-200 bg-danger-50',
		integrations: 'border-warning-200 bg-warning-50',
		infra: 'border-success-200 bg-success-50'
	};
	// One generic example fits no layer — each placeholder shows a tech and a
	// role that actually belong to its column.
	const layerExample: Record<ArchLayer, { name: string; role: string }> = {
		frontend: { name: 'e.g. React 19', role: 'role, e.g. UI framework' },
		backend: { name: 'e.g. Node 22', role: 'role, e.g. Type-safe API' },
		data: { name: 'e.g. PostgreSQL 16', role: 'role, e.g. primary database' },
		integrations: { name: 'e.g. Stripe API', role: 'role, e.g. payments' },
		infra: { name: 'e.g. Docker', role: 'role, e.g. container runtime' }
	};
	// Every tech input reads as an editable field: a dashed box in all states so a
	// FILLED value still looks fillable/editable (not static content). Empty fields
	// take an amber "to fill" box; hover/focus light up in the brand colour.
	const fillableInput =
		'rounded border border-dashed border-ink-300 px-1.5 py-0.5 outline-none transition-colors placeholder-shown:border-warning-400 placeholder-shown:bg-warning-50/60 hover:border-brand-400 hover:bg-white/50 focus:border-solid focus:border-brand-500 focus:bg-white/70 placeholder:not-italic placeholder:text-ink-400';

	const docFor = (id: string | null) =>
		id ? (sources.find((source) => source.id === id) ?? null) : null;

	function hrefFor(url: string): string {
		const u = url.trim();
		return /^https?:\/\//i.test(u) ? u : `https://${u}`;
	}

	/** Citing a tech's official docs also cites it for the section as a whole. */
	function onRefChange(techId: string, sourceId: string) {
		store.linkTechToDoc(techId, sourceId || null);
		if (sourceId && !store.draft.sourceIds.includes(sourceId)) store.toggleSource(sourceId);
	}
</script>

<section class="@container rounded-card border border-line bg-surface">
	<header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
		<div>
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Architecture schema
			</p>
			<p class="text-xs text-ink-500">
				The stack by layer. Attach each choice to an official reference doc so AI agents get the real
				link, not a guess. <strong>Import stack</strong> adds any tech your Foundation &amp; Data sections
				imply - it won't touch or re-add cards you've edited.
			</p>
		</div>
		<Button
			variant="outline"
			size="sm"
			onclick={store.deriveStack}
			title="Adds tech implied by your Foundation & Data sections. Only adds what's missing - it never overwrites or re-adds cards you've edited or removed."
		>
			<Icon name="rotate" size={14} /> Import stack from Foundation &amp; Data
		</Button>
	</header>

	{#if store.missingTech.length > 0}
		<div class="mx-4 mt-3 hidden items-start gap-2 rounded-card border border-warning-300 bg-warning-50/50 px-3 py-2">
			<Icon name="info" size={14} />
			<p class="text-[11px] text-warning-700">
				From the Foundation &amp; Data sections but not on the board yet:
				<span class="font-medium">{store.missingTech.join(', ')}</span>. Click
				<strong>Import stack from Foundation &amp; Data</strong> to add them.
			</p>
		</div>
	{/if}

	<div class="grid gap-4 p-4 @4xl:grid-cols-5">
		{#each ARCH_LAYERS as layer (layer.code)}
			{@const techs = techOfLayer(store.draft, layer.code)}
			<div class="space-y-2">
				<p class="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] {layerLabel[layer.code]}">
					{layer.label}
				</p>
				<div class="space-y-2">
					{#each techs as tech (tech.id)}
						<div data-anchor={tech.id} class="rounded-field border {layerCard[layer.code]} p-2">
							<div class="flex items-center gap-1">
								<input
									value={tech.name}
									oninput={(e) => store.updateTech(tech.id, 'name', e.currentTarget.value)}
									placeholder="Tech + version, {layerExample[layer.code].name}"
									class="{fillableInput} min-w-0 flex-1 bg-transparent text-xs font-semibold text-ink-900 placeholder:font-normal"
								/>
								<button
									type="button"
									onclick={() => store.removeTech(tech.id)}
									class="text-ink-300 hover:text-danger-500"><Icon name="x" size={12} /></button
								>
							</div>
							<input
								value={tech.role}
								oninput={(e) => store.updateTech(tech.id, 'role', e.currentTarget.value)}
								placeholder={layerExample[layer.code].role}
								class="{fillableInput} w-full bg-transparent text-[11px] text-ink-500"
							/>
							<!-- reference doc attach -->
							<div class="mt-1 flex items-center gap-1">
								<Icon name="file-check" size={11} />
								<select
									value={tech.referenceDocId ?? ''}
									onchange={(e) => onRefChange(tech.id, e.currentTarget.value)}
									class="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-[10px] {tech.referenceDocId
										? 'text-ink-600'
										: 'text-danger-500'}"
								>
									<option value="">- no reference -</option>
									{#each sources as source (source.id)}
										<option value={source.id}>{source.title || source.url || 'untitled source'}</option>
									{/each}
								</select>
								<a
									href={documentsHref}
									title="Register a new source"
									class="shrink-0 text-[10px] font-semibold text-brand-600 hover:underline">+ new</a
								>
							</div>
							{#if docFor(tech.referenceDocId)}
								{@const d = docFor(tech.referenceDocId)}
								{#if d?.url?.trim()}
									<a
										href={hrefFor(d?.url ?? '')}
										target="_blank"
										rel="noopener noreferrer"
										title="Open in a new tab"
										class="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium text-success-600 hover:underline"
									>
										✓ {d?.title || 'untitled source'} <Icon name="external-link" size={9} />
									</a>
								{:else}
									<p class="mt-0.5 truncate text-[10px] text-success-600">
										✓ {d?.title || 'untitled source'} - set its URL in Documents &amp; Sources
									</p>
								{/if}
							{/if}
						</div>
					{/each}
					<button
						type="button"
						onclick={() => store.addTech(layer.code)}
						class="flex w-full items-center justify-center gap-1 rounded-field border border-dashed border-line py-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
					>
						<Icon name="plus" size={12} /> Tech
					</button>
				</div>
			</div>
		{/each}
	</div>
</section>
