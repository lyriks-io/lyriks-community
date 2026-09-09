<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { citedSources } from '$domain/documents';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import { getDocumentRegistry } from '$ui/documents/registry.svelte';
	import type { ArchitectureStore } from '../draft-store.svelte';

	interface Props {
		store: ArchitectureStore;
	}
	let { store }: Props = $props();

	// The project evidence register — the only place a source is authored.
	const registry = getDocumentRegistry();
	const sources = $derived(registry?.sources ?? []);
	const documentsHref = $derived(registry?.documentsHref ?? '');

	// Rotating accent for the doc icon (mockup gives each card its own colour).
	const ICON = [
		'bg-info-50 text-info-600',
		'bg-brand-50 text-brand-600',
		'bg-danger-50 text-danger-600',
		'bg-warning-50 text-warning-600',
		'bg-success-50 text-success-600'
	];

	/** A safe, openable href: keep an explicit scheme, otherwise assume https. */
	function hrefFor(url: string): string {
		const u = url.trim();
		return /^https?:\/\//i.test(u) ? u : `https://${u}`;
	}

	const cited = $derived(citedSources(store.draft.sourceIds, sources));
</script>

<section class="rounded-card border border-line bg-surface">
	<header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
		<div class="flex items-center gap-2">
			<div>
				<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
					Cited sources
				</p>
				<p class="text-xs text-ink-500">
					Official links downstream AI agents read - not fuzzy recollections. Registered once in
					<a href={documentsHref} class="font-medium text-brand-600 hover:underline">
						Documents &amp; Sources
					</a>, cited here.
				</p>
			</div>
			<span class="rounded-pill bg-success-50 px-2 py-0.5 text-[10px] font-semibold text-success-600">
				{cited.length} cited
			</span>
		</div>
	</header>

	<div class="space-y-3 p-4">
		{#if cited.length > 0}
			<ul class="space-y-2">
				{#each cited as source, i (source.id)}
					<li
						data-anchor={source.id}
						class="flex items-start gap-3 rounded-field border border-line bg-surface-sunken px-3 py-2.5"
					>
						<span
							class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg {ICON[i % ICON.length]}"
						>
							<Icon name="file-check" size={14} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-ink-900">
								{source.title || 'Untitled source'}
							</p>
							<div class="flex items-center gap-1.5">
								<span class="min-w-0 flex-1 truncate font-mono text-[11px] text-info-600">
									{source.url || source.kind}
								</span>
								{#if source.url.trim()}
									<a
										href={hrefFor(source.url)}
										target="_blank"
										rel="noopener noreferrer"
										title="Open in a new tab"
										class="flex shrink-0 items-center gap-1 rounded-field border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-info-600 hover:bg-info-50"
									>
										Open <Icon name="external-link" size={11} />
									</a>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<SourceCitations
			selected={store.draft.sourceIds}
			onToggle={(sourceId) => store.toggleSource(sourceId)}
			subject="this architecture"
			open={cited.length === 0}
		/>
	</div>
</section>
