<script lang="ts" module>
	/** What the comments link reads (criterion 416e4885): how many topics are open, else the invitation to write one. */
	export const commentsWords = (open: number): string => (open > 0 ? `${open} ${open === 1 ? 'comment' : 'comments'}` : 'Comment');
	/** What the sources link reads: how many sources the block cites. */
	export const sourcesWords = (count: number): string => `${count} ${count === 1 ? 'source' : 'sources'}`;
</script>

<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { toggleCommentsInView } from '$ui/shell/comments-in-view';
	import { useDiscussions } from './discussions.svelte';
	import { useSources } from './sources.svelte';

	/**
	 * A block's comments and sources as two links closing its text, the way a
	 * citation closes a sentence (criterion 416e4885, About the product): each
	 * its small icon and its words in the blue of a link; a click opens them at
	 * the block's foot as their icons do on the other blocks (BlockFoot), the
	 * comments brought into view (criterion 8cb972b5). A block that cites
	 * nothing shows no sources link.
	 */
	interface Props {
		anchor: string;
	}
	let { anchor }: Props = $props();
	const discussions = useDiscussions();
	const sources = useSources();
	const tally = $derived(discussions.tally(anchor));
	const commentsOpen = $derived(discussions.openAnchor === anchor);
	const cited = $derived(sources?.countOf(anchor) ?? 0);
	const sourcesOpen = $derived(sources?.openAnchor === anchor);

	function toggleComments(event: MouseEvent) {
		void toggleCommentsInView(() => discussions.toggle(anchor), event.currentTarget as HTMLElement);
	}

	const LINK =
		'inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 align-baseline font-[inherit] text-[0.8125rem] font-semibold whitespace-nowrap text-blue-ink underline decoration-blue-ink/35 decoration-1 underline-offset-[3px] hover:decoration-blue-ink aria-expanded:decoration-blue-ink';
</script>

<span data-row-isolated class="cite-links">
	<button type="button" class={LINK} aria-expanded={commentsOpen} title={commentsOpen ? 'Hide the comments' : 'Open the comments'} onclick={toggleComments}>
		<Icon name="message-circle" size={13} />{commentsWords(tally.open)}
	</button>
	{#if sources && cited > 0}
		<span aria-hidden="true" class="text-ink-4">·</span>
		<button type="button" class={LINK} aria-expanded={sourcesOpen} title={sourcesOpen ? 'Hide the sources' : 'Open the sources'} onclick={() => sources.toggle(anchor)}>
			<Icon name="book" size={13} />{sourcesWords(cited)}
		</button>
	{/if}
</span>

<style>
	/* After the text's last word, on the same line, in lists as in heads (criteria 57ee9b9b, dfbc2f49): inline, so a
	   full line breaks link by link rather than sending the whole group down; each link keeps its words together. */
	.cite-links {
		display: inline;
		margin-left: 6px;
	}
	.cite-links > :global(* + *) {
		margin-left: 6px;
	}
</style>
