<script lang="ts">
	import type { RetroItem } from '$domain/retrospec';
	import { initials } from '$ui/team/team-style';
	import BlockControls, { type Stamp, type ValidateLook } from '$ui/evolution/BlockControls.svelte';
	import { useReview } from './review.svelte';

	/**
	 * The controls of one reviewed item, the design's fixed order: "Not sure…"
	 * where the item can be set aside, the comments, Reject where the element
	 * can be removed, then the pill with Validate and the initials of everyone
	 * who validated it (the reader's own, dashed, while it waits on them).
	 */
	interface Props {
		item: RetroItem;
		/** The next item to validate on the tab: its Validate reads violet. */
		next?: boolean;
		unsure?: boolean;
		/** Validate is withheld (the permissions wait for every user to be decided). */
		locked?: boolean;
	}
	let { item, next = false, unsure = false, locked = false }: Props = $props();

	const review = useReview();
	const view = $derived(review.view(item.id));
	const me = $derived(review.source.me);
	const canAct = $derived(review.source.canWrite && !locked);
	const rejected = $derived(view.state === 'rejected');

	const look = $derived<ValidateLook>(view.mine ? 'mine' : view.validators.length > 0 ? 'done' : next ? 'next' : 'grey');
	const stamps = $derived.by((): Stamp[] => {
		// The avatars only say who validated: only Validate validates (ac-evo-form-validators).
		const out: Stamp[] = view.validators.map((p) => ({ id: p.id, initials: initials(p.name), ok: true, title: `${p.name} · validated` }));
		if (!view.mine && review.source.canWrite) out.push({ id: me.id, initials: initials(me.name), ok: false, title: `${me.name} · to validate` });
		return out;
	});
	const validate = $derived({
		look,
		title: view.mine ? 'You validated · click to withdraw' : locked ? 'Validate or reject each user first' : 'Validate',
		run: !canAct ? null : view.mine ? () => void review.withdraw(item) : () => void review.validate(item),
		stamps,
		settled: view.validators.length > 0
	});
	const comments = $derived({
		count: view.open,
		resolvedOnly: view.open === 0 && view.comments.length > 0,
		open: review.commentsOpen === item.id,
		toggle: () => review.toggleComments(item.id)
	});
</script>

{#snippet between()}
	{#if item.rejectable}
		<button
			type="button"
			class="h-8 rounded-lg px-2.5 text-[0.8125rem] font-semibold {rejected ? 'text-evo-ink underline' : 'text-evo-red'}"
			title={rejected ? 'Restore this element' : 'Not wanted: remove it from the specification'}
			disabled={!review.source.canWrite}
			onclick={() => void review.toggleReject(item)}>{rejected ? 'Restore' : 'Reject'}</button
		>
	{/if}
{/snippet}

<span class="flex flex-wrap items-center gap-1.5">
	{#if unsure && !rejected}
		<button
			type="button"
			class="min-h-9 px-1.5 text-[0.8125rem] text-evo-muted underline"
			aria-expanded={review.menuOpen === item.id}
			onclick={() => review.toggleMenu(item.id)}>Not sure…</button
		>
	{/if}
	<BlockControls {comments} {between} validate={rejected ? null : validate} />
</span>
