<script lang="ts">
	import { sortByName } from '$domain/shared';
	
import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { DOCUMENT_KINDS, type DocumentSource } from '$domain/documents';
	import { Icon } from '$ui/design-system';
	import { restoreScroll } from '$ui/shell/return-scroll';
	import SourceLink from '$ui/documents/SourceLink.svelte';
	import { getDocumentRegistry } from '$ui/documents/registry.svelte';
	import { BACK, KICK, LEAD, LIST } from '$ui/spec360/page/look';
	import FindInput from '$ui/spec360/tech/FindInput.svelte';

	/**
	 * Tech and data · Sources (criterion b0ea9889): every source of the register
	 * the specification rests on, with its kind, narrowed by a search on its
	 * title, kind and note; each with the blocks that cite it, one click from
	 * where they stand, or 'Not cited yet'. A source reads as every citation
	 * does: its gist on hover, the whole of it in the reader on a click.
	 * Opened from a citation's reader, the search is set to that source
	 * (40aef524) and an arrow goes back to where it was cited (12c2df35).
	 */
	let { data } = $props();
	const registry = getDocumentRegistry();
	// The register from A to Z by title (criterion 4b3d2b4d).
	const all = $derived(sortByName(registry?.sources ?? [], (s) => s.title || s.url));
	let query = $state('');
	const kindOf = (s: DocumentSource) => DOCUMENT_KINDS.find((k) => k.code === s.kind)?.label ?? s.kind ?? 'Source';
	const matches = (s: DocumentSource, q: string) =>
		[s.title, s.url, kindOf(s), s.note ?? ''].some((v) => (v ?? '').toLowerCase().includes(q));
	const shown = $derived(query.trim() ? all.filter((s) => matches(s, query.trim().toLowerCase())) : all);
	// Once per arrival from a citation, so a later reload never overwrites what the reader typed since.
	$effect(() => {
		const id = page.url.searchParams.get('source');
		if (!id) return;
		untrack(() => {
			const source = all.find((s) => s.id === id);
			if (source) query = source.title || source.url;
		});
	});
	// Only an in-app path is followed back, never another origin.
	const back = $derived.by(() => {
		const from = page.url.searchParams.get('from');
		return from && from.startsWith('/') && !from.startsWith('//') ? from : null;
	});
</script>

<section aria-label="Sources" class="flex animate-lk-in flex-col">
	<p class={LEAD}>
		{all.length === 0
			? 'No source is registered yet: your LLM registers the sources of the specification as it writes it.'
			: `The ${all.length === 1 ? 'source' : `${all.length} sources`} the specification rests on, each with the blocks that cite it.`}
	</p>
	{#if back}
		<button type="button" class="mt-4 inline-flex min-h-9 cursor-pointer items-center gap-1.5 self-start border-0 bg-transparent p-0 {BACK} hover:underline" onclick={() => void goto(back).then(() => restoreScroll(back))}>
			<Icon name="arrow-left" size={14} />Back to where it is cited
		</button>
	{/if}
	{#if all.length > 0}
		<FindInput bind:value={query} placeholder="Find a source…" class="mt-6" resultLabel={query.trim() ? `${shown.length} of ${all.length} sources` : null} />
		{#if shown.length === 0}
			<p class="m-0 mt-4 text-[0.9375rem] text-evo-muted">No source matches “{query.trim()}”.</p>
		{:else}
			<div class="{LIST} mt-3">
				{#each shown as source (source.id)}
					{@const citers = data.citedBy[source.id] ?? []}
					<div class="flex flex-col gap-1.5 border-t border-evo-line-soft px-[18px] py-3.5 transition-colors duration-150 first:border-t-0 hover:bg-evo-hover">
						<span class={KICK}>{kindOf(source)}</span>
						<SourceLink {source} class="text-[0.9375rem] font-semibold" />
						<span class="flex flex-wrap items-center gap-1.5 text-xs">
							{#each citers as citer (citer.anchor)}
								<a href={citer.href} class="inline-flex min-h-7 items-center border-[1.5px] border-line bg-paper px-2.5 font-medium text-ink no-underline transition-colors hover:border-ink hover:text-ink">{citer.label}</a>
							{:else}
								<span class="text-evo-muted">Not cited yet</span>
							{/each}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>
