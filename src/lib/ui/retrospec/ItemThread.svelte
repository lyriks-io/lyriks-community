<script lang="ts">
	import type { RetroItem } from '$domain/retrospec';
	import { useReview } from './review.svelte';

	/**
	 * What opens under an item: its comments (one line each, resolved ones
	 * struck through, a box that sends on Enter), and the "Not sure…" menu that
	 * sets the item aside or shares it with someone of the team.
	 */
	let { item }: { item: RetroItem } = $props();

	const review = useReview();
	const view = $derived(review.view(item.id));
	const people = $derived(review.members);
	let draft = $state('');

	async function onKey(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey) return;
		event.preventDefault();
		const text = draft.trim();
		if (!text) return;
		draft = '';
		if (!(await review.comment(item, text))) draft = text;
	}
</script>

{#if review.commentsOpen === item.id}
	<div class="flex animate-lk-in-fast flex-col gap-1.5 rounded-lg bg-evo-sunken px-3 py-2.5" data-comments>
		{#each view.comments as c (c.id)}
			<div class="flex flex-wrap items-baseline gap-2.5 py-1 text-[0.8125rem] {c.resolved ? 'text-evo-faint line-through' : ''}">
				<span class="flex-[1_1_200px]"><b>{c.by.name}</b> {c.text}</span>
				{#if !c.resolved && review.source.canWrite}
					<button type="button" class="min-h-7 rounded-md border border-evo-control bg-white px-2 text-xs text-evo-ink" onclick={() => void review.resolve(item, c.id)}>Resolve</button>
				{/if}
			</div>
		{/each}
		{#if review.source.canWrite}
			<textarea
				rows="1"
				aria-label="Comment"
				placeholder="Comment… (Enter to send)"
				class="min-h-[34px] w-full resize-y rounded-lg border border-evo-control bg-white px-2.5 py-[7px] text-[0.8125rem]"
				bind:value={draft}
				onkeydown={onKey}
			></textarea>
		{:else if view.comments.length === 0}
			<span class="text-[0.8125rem] text-evo-muted">No comment yet.</span>
		{/if}
	</div>
{/if}
{#if review.menuOpen === item.id}
	<div class="flex animate-lk-in-fast flex-wrap items-center gap-2 rounded-lg bg-evo-page px-3 py-2.5">
		<button type="button" class="min-h-10 rounded-lg border border-evo-orange-line bg-evo-orange-soft px-3 text-[0.8125rem] font-semibold text-evo-orange" onclick={() => void review.setAside(item)}>⚑ Review later</button>
		{#if people.length > 0}
			<span class="text-[0.8125rem] text-evo-muted">or share with:</span>
			{#each people as person (person.id)}
				<button type="button" class="min-h-10 border border-evo-control bg-white px-3 text-[0.8125rem] text-evo-ink" title={person.job || person.name} onclick={() => void review.share(item, { id: person.id, name: person.name })}>{person.name}</button>
			{/each}
		{/if}
	</div>
{/if}
