<script lang="ts">
	import { Icon, openFileViewer } from '$ui/design-system';
	import {
		brokenCitations,
		citedSources,
		sourceHref,
		type DocumentSource
	} from '$domain/documents';
	import { getDocumentRegistry } from './registry.svelte';

	/**
	 * What an object cites, rendered so the evidence is one click away.
	 *
	 * The ONE read-only citation display. `SourceCitations` wraps it with a
	 * picker; every surface that only SHOWS what something rests on (an evolution
	 * proposal, a field carrying its sources) renders this instead of printing
	 * titles of its own. A chip that is not a way to reach the source it names is
	 * not a citation but a claim, which is the one thing the register exists to
	 * stop, so the resolution lives here, once, rather than in each caller.
	 *
	 * Sources are read from the project-wide register, never from props: a caller
	 * that threads titles down has already dropped the address by the time it
	 * renders.
	 */
	interface Props {
		/** Ids cited by the object being shown. */
		ids: readonly string[] | undefined;
		/** Passed by an editor so a citation can be dropped; omitted for a reading. */
		onRemove?: (sourceId: string) => void;
		/** What is missing, when a caller would rather say nothing than say zero. */
		emptyLabel?: string;
	}
	let { ids, onRemove, emptyLabel }: Props = $props();

	const registry = getDocumentRegistry();
	const sources = $derived(registry?.sources ?? []);
	const cited = $derived(citedSources(ids, sources));
	const broken = $derived(brokenCitations(ids, sources));

	// Inline files (data URLs) cannot be navigated to in a new tab, because
	// browsers block that, so they open the in-app preview instead.
	const isInlineFile = (source: DocumentSource) => source.url.trim().startsWith('data:');
	const labelOf = (source: DocumentSource) => source.title || source.url || 'Untitled source';
</script>

{#if cited.length > 0}
	<ul class="flex flex-wrap gap-1">
		{#each cited as source (source.id)}
			{@const label = labelOf(source)}
			{@const href = sourceHref(source)}
			<li
				class="inline-flex max-w-full items-center gap-1 rounded-pill bg-success-50 py-0.5 pl-2 pr-1 text-[11px] font-medium text-success-700"
				class:pr-2={!onRemove}
			>
				{#if isInlineFile(source)}
					<button
						type="button"
						onclick={() => openFileViewer({ name: label, dataUrl: source.url })}
						class="truncate underline-offset-2 hover:underline"
						title={`Preview ${label}`}
					>
						{label}
					</button>
				{:else if href}
					<a
						{href}
						target="_blank"
						rel="noopener noreferrer"
						class="truncate underline-offset-2 hover:underline"
						title={`Open ${source.url}`}
					>
						{label}
					</a>
				{:else}
					<!-- Nothing to open ("Ops lead interview"), so the source's own words
					     are the evidence: they are what the note carries, and hovering is
					     how you read them without leaving the card. -->
					<span class="truncate" title={source.note || source.url || label}>{label}</span>
				{/if}
				{#if onRemove}
					<button
						type="button"
						onclick={() => onRemove(source.id)}
						aria-label={`Remove citation ${label}`}
						class="grid size-3.5 shrink-0 place-items-center rounded-full text-success-600 transition hover:bg-success-100 hover:text-success-800"
					>
						<Icon name="x" size={10} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{:else if emptyLabel && broken.length === 0}
	<p class="text-[11px] text-ink-400">{emptyLabel}</p>
{/if}

{#if broken.length > 0}
	<p class="mt-2 rounded-field bg-warning-50 px-2 py-1.5 text-[11px] text-warning-700">
		{broken.length} linked {broken.length === 1
			? 'source no longer exists'
			: 'sources no longer exist'}.
	</p>
{/if}
