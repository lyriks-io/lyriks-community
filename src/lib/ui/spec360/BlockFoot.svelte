<script lang="ts">
	import CitedSources from '$ui/documents/CitedSources.svelte';
	import CodePlace from './CodePlace.svelte';
	import { KICKER } from './type-scale';
	import TopicThreads from './TopicThreads.svelte';
	import { useDiscussions } from './discussions.svelte';
	import { useSources } from './sources.svelte';

	/**
	 * What opens at the foot of a block, under everything it shows: the evidence
	 * it rests on, opened by its sources icon (criterion b0ea9889), the sources
	 * it cites then the places in the code it was located at, each with the lines
	 * that prove it on hover; then its discussions, opened by its Discuss button
	 * and read as topics.
	 */
	interface Props {
		anchor: string;
		/** What the element is called, kept on a new thread for its notifications. */
		title: string;
		/** Name the element on what opens: the foot of a row of small elements, where it is not under the element itself. */
		named?: boolean;
	}
	let { anchor, title, named = false }: Props = $props();
	const discussions = useDiscussions();
	const sources = useSources();
	const open = $derived(sources?.openAnchor === anchor);
	const cited = $derived(open && sources ? sources.of(anchor) : []);
	// The data map names each table with its own sources (criterion 3918b2ea).
	const groups = $derived(open && sources ? sources.groupsOf(anchor) : []);
	const code = $derived(open && sources ? sources.codeOf(anchor) : []);
	const count = $derived(cited.length + (open && sources ? sources.codeCountOf(anchor) : 0));
	$effect(() => {
		if (open && sources && sources.codeCountOf(anchor) > 0) void sources.readPlaces();
	});
</script>

{#if count > 0 && sources}
	<div class="flex animate-lk-in-fast flex-col gap-2 bg-evo-sunken px-3.5 py-3">
		<span class="{KICKER} text-evo-muted">{named ? `${title} · ` : ''}{count} {count === 1 ? 'SOURCE' : 'SOURCES'}</span>
		{#if groups.length > 0}
			{#each groups as group (group.id)}
				<span class="flex flex-wrap items-baseline gap-2 text-xs">
					<span class="font-bold text-evo-violet-ink">{group.label}</span>
					<CitedSources ids={group.sourceIds} element={anchor} />
				</span>
			{/each}
		{:else if cited.length > 0}<CitedSources ids={cited} element={anchor} />{/if}
		{#each code as c (c.place)}
			<span class="flex flex-wrap items-baseline gap-2 text-xs">
				<span class="font-bold text-evo-violet-ink">Code</span>
				<CodePlace projectId={sources.projectId} featureId={c.featureId} place={c.place} file={c.file} line={c.line} elementId={c.elementId} kind={c.kind} name={c.name} class="font-evo-mono text-xs break-all text-evo-ink-3" />
			</span>
		{/each}
	</div>
{/if}
{#if discussions.openAnchor === anchor}
	{#if named}<span class="{KICKER} text-evo-muted" data-comments>COMMENTS · {title}</span>{/if}
	<TopicThreads {anchor} {title} />
{/if}
