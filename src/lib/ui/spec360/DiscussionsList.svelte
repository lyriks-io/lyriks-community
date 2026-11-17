<script lang="ts">
	import { KICKER } from './type-scale';
	import { goto } from '$app/navigation';
	import { placeOfAnchor } from '$domain/discussions';
	import { useDiscussions } from './discussions.svelte';

	/**
	 * Every element someone discusses, with how many threads still wait and
	 * the last thing said; a click opens the element's page with its panel
	 * open. Reached from the Home ("N open discussions").
	 */
	interface Props {
		base: string;
	}
	let { base }: Props = $props();
	const discussions = useDiscussions();

	const entries = $derived.by(() => {
		const byAnchor = new Map<string, typeof discussions.document.threads>();
		for (const t of discussions.document.threads) byAnchor.set(t.anchor, [...(byAnchor.get(t.anchor) ?? []), t]);
		return [...byAnchor.entries()].map(([anchor, threads]) => {
			const open = threads.filter((t) => t.state === 'open').length;
			const last = threads
				.flatMap((t) => t.messages)
				.reduce((a, b) => (b.at > a.at ? b : a));
			// The link lands on the thread still waiting, else on the latest one.
			const target = threads.find((t) => t.state === 'open') ?? threads[threads.length - 1];
			return { anchor, threadId: target.id, title: threads[threads.length - 1].anchorTitle || anchor, open, last };
		});
	});
	const openCount = $derived(entries.reduce((n, e) => n + e.open, 0));

	/** The page that holds the element, told which thread to open: it opens the panel and scrolls to it. */
	function go(anchor: string, threadId: string) {
		const place = placeOfAnchor(anchor);
		void goto(`${place ? `${base}/${place}` : base}?discussion=${encodeURIComponent(threadId)}`, { noScroll: true });
	}
</script>

<div class="flex animate-lk-in-fast flex-col gap-2 rounded-evo-card border border-evo-line bg-surface p-3.5">
	<span class="px-0.5 {KICKER} text-evo-muted">DISCUSSIONS</span>
	<span class="px-0.5 text-sm font-bold text-evo-orange">{openCount} {openCount === 1 ? 'open discussion' : 'open discussions'}</span>
	{#if entries.length === 0}
		<span class="px-0.5 text-[0.8125rem] text-evo-muted">No discussion yet.</span>
	{/if}
	{#each entries as entry (entry.anchor)}
		<button
			type="button"
			onclick={() => go(entry.anchor, entry.threadId)}
			class="flex cursor-pointer flex-col gap-0.5 rounded-lg border-0 bg-evo-sunken p-2 text-left text-evo-ink hover:bg-paper"
		>
			<span class="text-[0.8125rem] leading-snug font-semibold">{entry.title}</span>
			<span class="text-xs {entry.open ? 'text-evo-orange' : 'text-evo-green'}">{entry.open ? `${entry.open} open` : 'resolved'}</span>
			<span class="line-clamp-2 text-xs text-evo-muted">{entry.last.author.name}: {entry.last.text}</span>
		</button>
	{/each}
</div>
