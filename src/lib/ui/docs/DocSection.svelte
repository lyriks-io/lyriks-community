<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One topic of the Documentation (criterion e3629a5f), drawn as the boxes of
	 * the Specification 360°: paper on the page's tinted ground, a thin line
	 * border, its title and the sentence that says what it covers. It carries
	 * data-doc-topic so the page reads its words for the search.
	 */
	let { id, title, lead, children }: { id: string; title: string; lead?: string; children: Snippet } = $props();
</script>

<section {id} data-doc-topic={id} aria-labelledby="{id}-title" class="min-w-0 scroll-mt-5 border border-line bg-paper px-6 pt-6 pb-[26px] max-[760px]:px-4 max-[760px]:pt-5">
	<div class="mb-4 grid gap-1">
		<h2 id="{id}-title" class="m-0 text-[1.1875rem] leading-[1.25] font-bold tracking-[-0.015em] text-ink">{title}</h2>
		{#if lead}<p class="m-0 text-[0.84375rem] leading-normal text-ink-2">{lead}</p>{/if}
	</div>
	<div class="doc-body flex flex-col gap-3.5">
		{@render children()}
	</div>
</section>

<style>
	/* The reading text of a topic: one measure, one leading, links and keys alike in every topic. */
	.doc-body :global(p) {
		margin: 0;
		max-width: 78ch;
		color: var(--color-ink-2);
		font-size: 0.9375rem;
		line-height: 1.65;
	}
	.doc-body :global(h3) {
		margin: 6px 0 0;
		color: var(--color-ink);
		font-size: 0.9375rem;
		font-weight: 700;
	}
	.doc-body :global(strong) {
		color: var(--color-ink);
		font-weight: 600;
	}
	/* Links in the reading text only: a card of Get help is a link drawn as a card. */
	.doc-body :global(:is(p, li) a) {
		color: var(--color-blue-ink);
		font-weight: 600;
		text-decoration: none;
	}
	.doc-body :global(:is(p, li) a:hover) {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.doc-body :global(kbd) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		min-width: 24px;
		padding: 1px 6px;
		border: 1.5px solid var(--color-ink);
		background: var(--color-paper);
		color: var(--color-ink);
		font: 700 0.75rem/1.4 var(--font-evo-mono);
	}
	.doc-body :global(code) {
		padding: 1px 5px;
		background: var(--color-toner-1, var(--color-surface-sunken));
		color: var(--color-ink);
		font: 400 0.8125rem/1.5 var(--font-evo-mono);
	}
	.doc-body :global(.rows) {
		display: grid;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-line);
		list-style: none;
	}
	.doc-body :global(.rows > li) {
		display: grid;
		grid-template-columns: minmax(150px, 220px) 1fr;
		gap: 4px 18px;
		padding: 10px 0;
		border-bottom: 1px solid var(--color-line);
		color: var(--color-ink-2);
		font-size: 0.875rem;
		line-height: 1.55;
	}
	.doc-body :global(.rows > li > :first-child) {
		color: var(--color-ink);
		font-weight: 600;
	}
	@media (max-width: 640px) {
		.doc-body :global(.rows > li) {
			grid-template-columns: 1fr;
		}
	}
</style>
