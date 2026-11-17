<script lang="ts">
	import { anchorDomId } from '$domain/discussions';
	import BlockFoot from '../BlockFoot.svelte';
	import { useDiscussions } from '../discussions.svelte';
	import { activateRow } from '$ui/shell/activate-row';

	/**
	 * One action in a user's access columns: its name, its Comment (or "2
	 * comments") that opens under it the discussion of that action for that
	 * user (criterion ddd20a3e), and while a draft, for who may edit, Grant in
	 * No access or Take back in Access (criterion eba33558). Its name opens the
	 * action's own level when the page offers it (criterion 6dd2906e).
	 */
	interface Props {
		/** The action discussed for this user (permissions:<user>:<capability>). */
		anchor: string;
		action: string;
		access: boolean;
		/** What its discussion is called in notifications: "Guest · Delete a link". */
		title: string;
		/** Grant or take back the action; null when the reader cannot. */
		onTick: (() => void) | null;
		/** The action's own level, which its name opens; none on that level itself. */
		href?: string | null;
	}
	let { anchor, action, access, title, onTick, href = null }: Props = $props();
	const discussions = useDiscussions();
	const tally = $derived(discussions.tally(anchor));
	const open = $derived(discussions.openAnchor === anchor);
	const comments = $derived(tally.total === 0 ? 'Comment' : `${tally.total} ${tally.total === 1 ? 'comment' : 'comments'}`);
	const tone = $derived(open ? 'text-evo-violet-ink' : tally.open > 0 ? 'text-evo-orange' : tally.total > 0 ? 'text-evo-green' : 'text-evo-muted');
	const SMALL = 'inline-flex min-h-8 flex-none cursor-pointer items-center rounded-md border-0 bg-transparent px-1.5 text-xs font-semibold max-[700px]:min-h-11';
</script>

<div id={anchorDomId(anchor)} class="scroll-mt-36">
	<div use:activateRow={!href} class="flex min-h-[52px] items-center gap-1.5 px-[18px] py-2.5 {href ? 'cursor-pointer' : ''}">
		{#if href}
			<a {href} data-row-open class="min-w-0 flex-1 no-underline underline-offset-2 hover:underline {access ? 'font-semibold text-evo-ink' : 'font-medium text-evo-muted'}" title="Open “{action}” for this user">{action}<span aria-hidden="true" class="ml-1.5 text-ink-3">›</span></a>
		{:else}
			<span class="min-w-0 flex-1 {access ? 'font-semibold text-evo-ink' : 'font-medium text-evo-muted'}">{action}</span>
		{/if}
		<button
			type="button"
			class="{SMALL} {tone} hover:text-evo-violet"
			aria-expanded={open}
			title={open ? 'Hide the comments' : `Comment on “${action}” for this user`}
			onclick={() => discussions.toggle(anchor)}>{comments}</button
		>
		{#if onTick}
			<button
				type="button"
				class="{SMALL} {access ? 'text-evo-muted hover:text-evo-red' : 'text-evo-green hover:text-evo-green-stroke'} hover:bg-white"
				title={access ? `Take “${action}” back from this user` : `Let this user perform “${action}”`}
				onclick={onTick}>{access ? 'Take back' : 'Grant'}</button
			>
		{/if}
	</div>
	{#if open}
		<div class="animate-lk-in-fast flex flex-col gap-2 border-t border-evo-line-soft bg-evo-hover px-[18px] pt-2.5 pb-3.5">
			<BlockFoot {anchor} {title} />
		</div>
	{/if}
</div>
