<script lang="ts">
	import { useDiscussions } from './discussions.svelte';

	/**
	 * The "Discuss" button of a block: a speech bubble, the number of threads
	 * held on the element, orange while one waits for an answer, green once
	 * every one is resolved, grey when nobody has said anything yet.
	 */
	interface Props {
		anchor: string;
		class?: string;
	}
	let { anchor, class: extra = '' }: Props = $props();
	const discussions = useDiscussions();

	const tally = $derived(discussions.tally(anchor));
	const tone = $derived(tally.open > 0 ? 'text-evo-orange' : tally.total > 0 ? 'text-evo-green' : 'text-evo-muted');
</script>

<button
	type="button"
	aria-label="Discuss"
	title="Discuss with colleagues"
	aria-expanded={discussions.openAnchor === anchor}
	onclick={() => discussions.toggle(anchor)}
	class="inline-flex h-9 flex-none cursor-pointer items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-[0.8125rem] {tone} {extra}"
>
	<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path></svg>{tally.total > 0 ? tally.total : ''}
</button>
