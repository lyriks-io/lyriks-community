<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { brokenCitations, citedSources, type DocumentSource } from '$domain/documents';
	import { getDocumentRegistry } from './registry.svelte';
	import SourceLink from './SourceLink.svelte';

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
		/** The element citing them: its passages read under the chips, and the reader highlights them (criterion f09da92d). */
		element?: string;
	}
	let { ids, onRemove, emptyLabel, element }: Props = $props();

	const registry = getDocumentRegistry();
	const sources = $derived(registry?.sources ?? []);
	const cited = $derived(citedSources(ids, sources));
	const broken = $derived(brokenCitations(ids, sources));

	const labelOf = (source: DocumentSource) => source.title || source.url || 'Untitled source';
	// The words each source gave the element, and what it took from them, under the chips.
	const passages = $derived(element && registry ? registry.passagesOf(element).filter((p) => cited.some((c) => c.id === p.sourceId)) : []);
</script>

{#if cited.length > 0}
	<ul class="flex flex-wrap gap-1">
		{#each cited as source (source.id)}
			{@const label = labelOf(source)}
			<li
				class="inline-flex max-w-full items-center gap-1 rounded-pill bg-success-50 py-0.5 pl-2 pr-1 text-[0.6875rem] font-medium text-success-700"
				class:pr-2={!onRemove}
			>
				<!-- Every citation reads the same: a hover card with its first sentence,
				     a click for the whole source (and from there, its link or file). -->
				<SourceLink {source} {element} />
				{#if onRemove}
					<button
						type="button"
						onclick={() => onRemove(source.id)}
						aria-label={`Remove citation ${label}`}
						class="grid size-3.5 shrink-0 place-items-center text-success-600 transition hover:bg-success-100 hover:text-success-800"
					>
						<Icon name="x" size={10} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{:else if emptyLabel && broken.length === 0}
	<p class="text-[0.6875rem] text-ink-400">{emptyLabel}</p>
{/if}

{#if passages.length > 0}
	<!-- What each source gave the element: the words it rests on, then what it took from them (criterion f09da92d). -->
	<ul class="mt-1.5 flex flex-col gap-1.5">
		{#each passages as passage (passage.id)}
			{@const source = cited.find((c) => c.id === passage.sourceId)}
			<li class="flex flex-col gap-0.5 border-l-2 border-evo-amber pl-2 text-xs">
				<span class="line-clamp-2 text-ink-2 italic">“{passage.words}”</span>
				<span class="text-ink-3">{passage.takes}{#if source}<span class="text-ink-4"> · {labelOf(source)}</span>{/if}</span>
			</li>
		{/each}
	</ul>
{/if}

{#if broken.length > 0}
	<p class="mt-2 rounded-field bg-warning-50 px-2 py-1.5 text-[0.6875rem] text-warning-700">
		{broken.length} linked {broken.length === 1
			? 'source no longer exists'
			: 'sources no longer exist'}.
	</p>
{/if}
